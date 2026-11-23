"""
FastAPI 后端服务入口 (DocScanner-Enhancer REST API Server v3.0)
华南理工大学《数字图像处理》课程设计 · 课题一
提供高并发异步接口、纯传统自动退化诊断、SSE 实时进度流式增强、局域网扫码手机拍传接力、内置 6 类退化样本画廊与 OCR 评测接口。
"""

import os
import io
import json
import time
import uuid
import queue
import socket
import base64
import asyncio
import threading
from typing import Optional, List, Dict, Any, Callable
import numpy as np
import cv2
import qrcode
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.algorithms.auto_diagnose import diagnose_document
from src.evaluation.metrics import evaluate_quality_metrics
from src.evaluation.ocr_evaluator import OCREvaluator
from src.evaluation.generate_samples import SAMPLE_CATALOG, generate_benchmark_samples
from src.algorithms.sampling_quantization import (
    apply_sampling_and_quantization,
    run_sampling_quantization_sweep,
)

app = FastAPI(
    title="DocScanner API",
    description="智能文档扫描、传统信号退化诊断与可读性增强引擎 REST API v3.0",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 局域网手机扫码拍传内存会话表（自动 TTL 清理，零磁盘残留）
_CAPTURE_SESSIONS: Dict[str, Dict[str, Any]] = {}
_CAPTURE_TTL_SEC = 1200  # 20 分钟
_CAPTURE_MAX_SESSIONS = 64


def _cleanup_capture_sessions():
    now = time.time()
    expired = [sid for sid, s in _CAPTURE_SESSIONS.items() if now - s["created_at"] > _CAPTURE_TTL_SEC]
    for sid in expired:
        _CAPTURE_SESSIONS.pop(sid, None)
    if len(_CAPTURE_SESSIONS) > _CAPTURE_MAX_SESSIONS:
        oldest = sorted(_CAPTURE_SESSIONS.items(), key=lambda kv: kv[1]["created_at"])
        for sid, _ in oldest[: len(_CAPTURE_SESSIONS) - _CAPTURE_MAX_SESSIONS]:
            _CAPTURE_SESSIONS.pop(sid, None)


def _is_usable_lan_ip(ip: str) -> bool:
    """过滤回环、链路本地及 VPN/Clash TUN 虚拟段 (198.18.0.0/15)，保留真实 RFC-1918 局域网地址"""
    if not ip or ":" in ip:
        return False
    if ip.startswith(("127.", "169.254.", "198.18.", "198.19.", "0.")):
        return False
    return True


def _get_lan_ip() -> str:
    """获取当前设备真实局域网 Wi-Fi/以太网 IPv4 地址（自动绕过 Clash/Surge TUN 198.18.x.x 虚拟网卡）"""
    import subprocess
    import re

    # 1. macOS 优先探测常见物理 Wi-Fi / 以太网接口 (en0, en1, en2)
    for iface in ("en0", "en1", "en2", "en3"):
        try:
            out = subprocess.check_output(
                ["ipconfig", "getifaddr", iface],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=0.6,
            ).strip()
            if _is_usable_lan_ip(out):
                return out
        except Exception:
            pass

    # 2. 解析 ifconfig / hostname -I 中的 RFC-1918 私有局域网 IP
    candidates: List[str] = []
    for cmd in (["ifconfig"], ["hostname", "-I"]):
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, timeout=0.8)
            for match in re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", out):
                if _is_usable_lan_ip(match) and match not in candidates:
                    candidates.append(match)
        except Exception:
            pass
    for prefix in ("192.168.", "10.", "172."):
        for ip in candidates:
            if ip.startswith(prefix):
                return ip

    # 3. 回退 UDP 路由探测
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if _is_usable_lan_ip(ip):
                return ip
    except Exception:
        pass
    return "127.0.0.1"


def _make_qr_base64(text: str) -> str:
    """离线生成高清深色适配二维码 PNG Base64"""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def decode_uploaded_image(contents: bytes) -> Optional[np.ndarray]:
    """
    安全解码上传图片并自动处理手机相机 EXIF 旋转标签（解决 iOS/Android 竖拍变横图问题）。
    """
    try:
        with Image.open(io.BytesIO(contents)) as pil_img:
            pil_img = ImageOps.exif_transpose(pil_img)
            if pil_img.mode not in ("RGB", "L"):
                pil_img = pil_img.convert("RGB")
            arr = np.array(pil_img)
            if arr.ndim == 2:
                return cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception:
        nparr = np.frombuffer(contents, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


def cv2_to_base64(
    image: np.ndarray,
    ext: str = ".png",
    max_dim: Optional[int] = None,
    jpeg_quality: int = 88,
) -> str:
    """将 OpenCV 图像编码为 Base64 字符串（支持按 max_dim 缩放以加速 4K 响应传输）"""
    target = image
    if max_dim is not None and max(image.shape[:2]) > max_dim:
        h, w = image.shape[:2]
        scale = max_dim / float(max(h, w))
        target = cv2.resize(
            image,
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality] if ext == ".jpg" else []
    success, buffer = cv2.imencode(ext, target, encode_params)
    if not success:
        return ""
    b64_str = base64.b64encode(buffer).decode("utf-8")
    mime = "image/png" if ext == ".png" else "image/jpeg"
    return f"data:{mime};base64,{b64_str}"


def base64_to_cv2(b64_str: str) -> np.ndarray:
    """将 Base64 字符串解码为 OpenCV 图像 (BGR uint8)"""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_data = base64.b64decode(b64_str)
    image = decode_uploaded_image(img_data)
    if image is None:
        raise ValueError("无法解析图像数据")
    return image


def _ensure_samples_exist():
    """确保 6 类基准退化样本与真值文件已生成"""
    gt_path = os.path.join("data", "ground_truth", "standard_doc_gt.png")
    s6_path = os.path.join("data", "samples", "test6_color_cast_noise.png")
    if not os.path.exists(gt_path) or not os.path.exists(s6_path):
        generate_benchmark_samples()


def _build_pipeline_config(cfg_dict: Dict[str, Any]) -> PipelineConfig:
    manual_corners = None
    if cfg_dict.get("manual_corners"):
        manual_corners = np.array(cfg_dict["manual_corners"], dtype="float32")

    return PipelineConfig(
        sampling_scale=float(cfg_dict.get("sampling_scale", 1.0)),
        quantization_bits=int(cfg_dict.get("quantization_bits", 8)),
        output_mode=cfg_dict.get("output_mode", "binary"),
        max_working_dim=int(cfg_dict.get("max_working_dim", 2200)),
        auto_diagnose=bool(cfg_dict.get("auto_diagnose", False)),
        enable_geometric=cfg_dict.get("enable_geometric", True),
        manual_corners=manual_corners,
        color_space=cfg_dict.get("color_space", "hsv"),
        enable_white_balance=cfg_dict.get("enable_white_balance", True),
        enable_illumination=cfg_dict.get("enable_illumination", True),
        illumination_kernel_size=int(cfg_dict.get("illumination_kernel_size", 45)),
        clahe_clip_limit=float(cfg_dict.get("clahe_clip_limit", 2.0)),
        contrast_method=cfg_dict.get("contrast_method", "stretch_clahe"),
        denoise_method=cfg_dict.get("denoise_method", "none"),
        denoise_ksize=int(cfg_dict.get("denoise_ksize", 3)),
        apply_gamma=cfg_dict.get("apply_gamma", True),
        manual_gamma=float(cfg_dict["manual_gamma"]) if cfg_dict.get("manual_gamma") is not None else None,
        enable_frequency_filter=cfg_dict.get("enable_frequency_filter", True),
        notch_radius=float(cfg_dict.get("notch_radius", 12.0)),
        enable_restoration=cfg_dict.get("enable_restoration", False),
        blur_type=cfg_dict.get("blur_type", "defocus"),
        defocus_radius=int(cfg_dict.get("defocus_radius", 3)),
        motion_length=int(cfg_dict.get("motion_length", 9)),
        motion_angle=float(cfg_dict.get("motion_angle", 0.0)),
        wiener_k=float(cfg_dict.get("wiener_k", 0.018)),
        enable_binarization=cfg_dict.get("enable_binarization", True),
        binarize_method=cfg_dict.get("binarize_method", "sauvola"),
        sauvola_window_size=int(cfg_dict.get("sauvola_window_size", 25)),
        sauvola_k=float(cfg_dict.get("sauvola_k", 0.18)),
        sharpen=cfg_dict.get("sharpen", True),
        sharpen_strength=float(cfg_dict.get("sharpen_strength", 0.35)),
        soft_blend=cfg_dict.get("soft_blend", True),
    )


def _execute_enhance_sync(
    raw_img: np.ndarray,
    cfg_dict: Dict[str, Any],
    matched_sample_name: Optional[str],
    progress_callback: Optional[Callable[[int, str, int], None]] = None,
) -> Dict[str, Any]:
    """全流程增强与评测同步执行核心（供普通 POST 与 SSE 流式接口复用）"""
    config = _build_pipeline_config(cfg_dict)
    pipeline = DocumentScannerPipeline(config=config)
    res = pipeline.process(
        raw_img,
        collect_stages=True,
        perform_ocr=True,
        progress_callback=progress_callback,
        run_diagnosis=True,
    )

    if progress_callback:
        progress_callback(8, "正在编码阶段诊断图与计算量化指标...", 97)

    # 阶段中间图与诊断图按 max_dim=1100 压缩传输，确保 4K 原图响应轻快；最终成品保持全工作分辨率 PNG
    stages_payload = []
    for s in res["stages"]:
        stage_item = {
            "stage_id": s.stage_id,
            "stage_name": s.stage_name,
            "elapsed_ms": s.elapsed_ms,
            "image_base64": cv2_to_base64(s.output_image, ext=".jpg", max_dim=1100, jpeg_quality=88),
            "metadata": s.metadata,
            "diagnostics": {
                k: cv2_to_base64(v, ext=".jpg", max_dim=1000, jpeg_quality=88)
                for k, v in s.diagnostic_images.items()
            },
        }
        stages_payload.append(stage_item)

    # 匹配地面真值 (Ground Truth)
    gt_text = cfg_dict.get("ground_truth_text")
    gt_img = None
    if matched_sample_name:
        gt_img_path = os.path.join("data", "ground_truth", "standard_doc_gt.png")
        gt_txt_path = os.path.join("data", "ground_truth", "standard_doc_gt.txt")
        if os.path.exists(gt_img_path):
            gt_img = cv2.imread(gt_img_path)
        if not gt_text and os.path.exists(gt_txt_path):
            gt_text = open(gt_txt_path, "r", encoding="utf-8").read()

    # 若有采样/量化实验前置退化，对输入图同步计算
    eval_input_img = raw_img
    if config.sampling_scale < 0.999 or config.quantization_bits < 8:
        eval_input_img, _ = apply_sampling_and_quantization(
            raw_img, scale_factor=config.sampling_scale, bits=config.quantization_bits
        )

    if gt_img is not None:
        metrics = evaluate_quality_metrics(gt_img, res["final_image"], raw_image=eval_input_img)
    else:
        stage3_img = res["stages"][2].output_image if len(res["stages"]) >= 3 else res["rectified_raw_image"]
        metrics = evaluate_quality_metrics(stage3_img, res["final_image"], raw_image=eval_input_img)

    # 实拍大图评测对比时将输入图限制到与工作分辨率一致，避免 4K 原始图跑两次慢 OCR
    ocr_eval_input = eval_input_img
    if max(ocr_eval_input.shape[:2]) > config.max_working_dim:
        h, w = ocr_eval_input.shape[:2]
        sc = config.max_working_dim / float(max(h, w))
        ocr_eval_input = cv2.resize(
            ocr_eval_input,
            (max(1, int(round(w * sc))), max(1, int(round(h * sc)))),
            interpolation=cv2.INTER_AREA,
        )

    ocr_comparison = OCREvaluator.evaluate_comparison(
        ocr_eval_input, res["final_image"], ground_truth_text=gt_text
    )

    applied_params = {
        "output_mode": config.output_mode,
        "enable_geometric": config.enable_geometric,
        "color_space": config.color_space,
        "enable_white_balance": config.enable_white_balance,
        "enable_illumination": config.enable_illumination,
        "illumination_kernel_size": config.illumination_kernel_size,
        "clahe_clip_limit": config.clahe_clip_limit,
        "contrast_method": config.contrast_method,
        "apply_gamma": config.apply_gamma,
        "denoise_method": config.denoise_method,
        "denoise_ksize": config.denoise_ksize,
        "enable_frequency_filter": config.enable_frequency_filter,
        "notch_radius": config.notch_radius,
        "enable_restoration": config.enable_restoration,
        "blur_type": config.blur_type,
        "defocus_radius": config.defocus_radius,
        "motion_length": config.motion_length,
        "motion_angle": config.motion_angle,
        "wiener_k": config.wiener_k,
        "enable_binarization": config.enable_binarization,
        "binarize_method": config.binarize_method,
        "sauvola_window_size": config.sauvola_window_size,
        "sauvola_k": config.sauvola_k,
        "sharpen": config.sharpen,
        "sharpen_strength": config.sharpen_strength,
        "soft_blend": config.soft_blend,
        "sampling_scale": config.sampling_scale,
        "quantization_bits": config.quantization_bits,
    }

    return {
        "success": True,
        "sample_name": matched_sample_name,
        "total_elapsed_ms": res["total_elapsed_ms"],
        "raw_image_base64": cv2_to_base64(eval_input_img, ext=".jpg", max_dim=1800, jpeg_quality=90),
        "rectified_raw_base64": cv2_to_base64(res["rectified_raw_image"], ext=".jpg", max_dim=2200, jpeg_quality=90),
        "final_image_base64": cv2_to_base64(res["final_image"], ext=".png"),
        "stages": stages_payload,
        "diagnosis": res.get("diagnosis"),
        "applied_params": applied_params,
        "metrics": metrics,
        "ocr": {
            "text": res["ocr_text"],
            "boxes": res["ocr_boxes"],
            "comparison": ocr_comparison,
        },
    }


async def _load_request_image(
    file: Optional[UploadFile],
    sample_name: Optional[str],
    cfg_dict: Dict[str, Any],
) -> tuple[np.ndarray, Optional[str]]:
    _ensure_samples_exist()
    matched_sample_name: Optional[str] = None

    if file is not None:
        contents = await file.read()
        raw_img = decode_uploaded_image(contents)
        if file.filename and os.path.basename(file.filename) in SAMPLE_CATALOG:
            matched_sample_name = os.path.basename(file.filename)
    elif sample_name and sample_name in SAMPLE_CATALOG:
        matched_sample_name = sample_name
        fpath = os.path.join("data", "samples", sample_name)
        raw_img = cv2.imread(fpath)
    else:
        raise HTTPException(status_code=400, detail="必须上传图片文件或指定内置样本名")

    if raw_img is None:
        raise HTTPException(status_code=400, detail="无法解析上传的图片文件")

    if not matched_sample_name and cfg_dict.get("sample_name") in SAMPLE_CATALOG:
        matched_sample_name = cfg_dict.get("sample_name")

    return raw_img, matched_sample_name


@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    has_hero_video = any(
        os.path.exists(os.path.join(base_dir, rel))
        for rel in ("frontend/dist/hero-intro.mp4", "frontend/public/hero-intro.mp4")
    )
    return {
        "status": "ok",
        "service": "DocScanner-Enhancer API",
        "version": "3.0.0",
        "has_hero_video": has_hero_video,
    }


@app.get("/api/v1/samples")
async def list_benchmark_samples():
    """获取内置 6 大典型退化测试样本列表（支持前端一键载入演示）"""
    _ensure_samples_exist()
    items = []
    for fname, meta in SAMPLE_CATALOG.items():
        fpath = os.path.join("data", "samples", fname)
        thumb_b64 = ""
        if os.path.exists(fpath):
            img = cv2.imread(fpath)
            if img is not None:
                thumb = cv2.resize(img, (105, 135), interpolation=cv2.INTER_AREA)
                thumb_b64 = cv2_to_base64(thumb, ext=".jpg")
        items.append({
            "filename": fname,
            "id": meta["id"],
            "title": meta["title"],
            "subtitle": meta["subtitle"],
            "recommended_preset": meta["recommended_preset"],
            "recommended_params": meta["recommended_params"],
            "thumbnail_base64": thumb_b64
        })
    return {"success": True, "samples": items}


@app.get("/api/v1/samples/{sample_name}")
async def get_benchmark_sample(sample_name: str):
    """读取指定内置测试样本原图与推荐参数"""
    _ensure_samples_exist()
    if sample_name not in SAMPLE_CATALOG:
        raise HTTPException(status_code=404, detail=f"未找到内置样本: {sample_name}")

    fpath = os.path.join("data", "samples", sample_name)
    img = cv2.imread(fpath)
    if img is None:
        raise HTTPException(status_code=404, detail=f"样本文件读取失败: {sample_name}")

    gt_txt_path = os.path.join("data", "ground_truth", "standard_doc_gt.txt")
    gt_text = open(gt_txt_path, "r", encoding="utf-8").read() if os.path.exists(gt_txt_path) else ""

    meta = SAMPLE_CATALOG[sample_name]
    return {
        "success": True,
        "filename": sample_name,
        "title": meta["title"],
        "subtitle": meta["subtitle"],
        "image_base64": cv2_to_base64(img),
        "recommended_params": meta["recommended_params"],
        "ground_truth_text": gt_text
    }


@app.post("/api/v1/diagnose")
async def diagnose_uploaded_document(
    file: Optional[UploadFile] = File(None),
    sample_name: Optional[str] = Form(None),
):
    """纯传统信号自动退化诊断接口（<0.4s 返回透视/阴影/摩尔纹/模糊/偏色/噪点/红章评估与推荐参数）"""
    try:
        raw_img, _ = await _load_request_image(file, sample_name, {})
        diagnosis = await asyncio.to_thread(diagnose_document, raw_img)
        return {"success": True, "diagnosis": diagnosis}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/enhance")
async def enhance_document(
    file: Optional[UploadFile] = File(None),
    sample_name: Optional[str] = Form(None),
    params_json: Optional[str] = Form(None)
):
    """
    一键全流程增强接口 (支持上传 Multipart 图像文件或指定内置 sample_name + JSON 超参数)。
    """
    try:
        cfg_dict = json.loads(params_json) if params_json else {}
        raw_img, matched_sample_name = await _load_request_image(file, sample_name, cfg_dict)
        return await asyncio.to_thread(_execute_enhance_sync, raw_img, cfg_dict, matched_sample_name, None)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/enhance-stream")
async def enhance_document_stream(
    file: Optional[UploadFile] = File(None),
    sample_name: Optional[str] = Form(None),
    params_json: Optional[str] = Form(None),
):
    """
    SSE 实时阶段进度流式增强接口：逐阶段推送 `event: progress` 与最终 `event: result`，杜绝 4K 处理静默等待。
    """
    cfg_dict = json.loads(params_json) if params_json else {}
    raw_img, matched_sample_name = await _load_request_image(file, sample_name, cfg_dict)

    event_queue: "queue.Queue[tuple[str, Any]]" = queue.Queue()

    def _on_progress(stage_id: int, label: str, percent: int):
        event_queue.put(("progress", {"stage_id": stage_id, "label": label, "percent": percent}))

    def _worker():
        try:
            payload = _execute_enhance_sync(raw_img, cfg_dict, matched_sample_name, progress_callback=_on_progress)
            event_queue.put(("progress", {"stage_id": 8, "label": "处理完成", "percent": 100}))
            event_queue.put(("result", payload))
        except Exception as exc:
            import traceback
            traceback.print_exc()
            event_queue.put(("error", {"detail": str(exc)}))
        finally:
            event_queue.put(("done", None))

    threading.Thread(target=_worker, daemon=True).start()

    async def _event_generator():
        while True:
            try:
                evt_name, evt_data = await asyncio.to_thread(event_queue.get, True, 15.0)
            except queue.Empty:
                yield ": keepalive\n\n"
                continue
            if evt_name == "done":
                break
            data_str = json.dumps(evt_data, ensure_ascii=False)
            yield f"event: {evt_name}\ndata: {data_str}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==========================================
# 局域网扫码 · 手机拍传电脑接力 (QR Phone Relay)
# ==========================================

@app.get("/api/v1/capture/new-session")
async def create_capture_session(request: Request):
    """创建一次性局域网手机拍传会话并生成二维码"""
    _cleanup_capture_sessions()
    session_id = uuid.uuid4().hex[:10]
    _CAPTURE_SESSIONS[session_id] = {
        "created_at": time.time(),
        "uploads": [],
        "subscribers": [],
    }

    lan_ip = _get_lan_ip()
    req_host = request.url.hostname or "localhost"
    req_port = request.url.port
    scheme = request.url.scheme or "http"

    # 若桌面端通过 localhost/127.0.0.1 访问，则自动替换为局域网 IP 供同 Wi-Fi 手机扫码连接
    target_host = lan_ip if req_host in ("localhost", "127.0.0.1", "0.0.0.0") else req_host
    port_part = f":{req_port}" if req_port and req_port not in (80, 443) else ""
    capture_url = f"{scheme}://{target_host}{port_part}/?capture_session={session_id}"

    qr_b64 = _make_qr_base64(capture_url)
    return {
        "success": True,
        "session_id": session_id,
        "capture_url": capture_url,
        "lan_ip": lan_ip,
        "qr_base64": qr_b64,
        "expires_in_sec": _CAPTURE_TTL_SEC,
    }


@app.get("/api/v1/capture/{session_id}/status")
async def get_capture_session_status(session_id: str):
    """手机端检查扫码拍传会话是否有效"""
    _cleanup_capture_sessions()
    session = _CAPTURE_SESSIONS.get(session_id)
    if not session:
        return {"success": True, "active": False, "upload_count": 0}
    return {
        "success": True,
        "active": True,
        "upload_count": len(session["uploads"]),
    }


@app.post("/api/v1/capture/{session_id}/upload")
async def upload_captured_photo(session_id: str, file: UploadFile = File(...)):
    """手机拍照/相册选图上传，实时通过 SSE 推送到桌面工作台"""
    _cleanup_capture_sessions()
    session = _CAPTURE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="拍传会话已过期或不存在，请在电脑端重新扫码")

    contents = await file.read()
    img = decode_uploaded_image(contents)
    if img is None:
        raise HTTPException(status_code=400, detail="无法识别上传的照片格式")

    h, w = img.shape[:2]
    # 传输到桌面端前上限限制为 2600px JPEG(q=92)，确保 12MP 手机照片在局域网 <0.5s 秒传且清晰无损
    img_b64 = cv2_to_base64(img, ext=".jpg", max_dim=2600, jpeg_quality=92)
    upload_item = {
        "upload_id": uuid.uuid4().hex[:8],
        "filename": file.filename or f"手机拍传_{time.strftime('%H%M%S')}.jpg",
        "width": w,
        "height": h,
        "image_base64": img_b64,
        "uploaded_at": time.time(),
    }
    session["uploads"].append(upload_item)
    # 仅保留最近 5 张避免内存膨胀
    if len(session["uploads"]) > 5:
        session["uploads"] = session["uploads"][-5:]

    # 通知所有正在监听的桌面端连接
    for sub_q in list(session["subscribers"]):
        try:
            sub_q.put_nowait(upload_item)
        except Exception:
            pass

    return {
        "success": True,
        "upload_id": upload_item["upload_id"],
        "filename": upload_item["filename"],
        "width": w,
        "height": h,
    }


@app.get("/api/v1/capture/{session_id}/events")
async def capture_session_events(session_id: str, request: Request):
    """桌面端 SSE 监听手机拍照推送事件"""
    _cleanup_capture_sessions()
    session = _CAPTURE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="拍传会话已过期或不存在")

    sub_q: asyncio.Queue = asyncio.Queue()
    session["subscribers"].append(sub_q)

    async def _gen():
        try:
            yield f"event: connected\ndata: {json.dumps({'session_id': session_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(sub_q.get(), timeout=15.0)
                    yield f"event: photo\ndata: {json.dumps(item, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            if sub_q in session["subscribers"]:
                session["subscribers"].remove(sub_q)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/sampling-lab")
async def run_sampling_lab(
    file: Optional[UploadFile] = File(None),
    sample_name: Optional[str] = Form(None)
):
    """
    课题一核心要求 (1) 专属接口：
    运行“图像空间采样（DPI分辨率）与灰度级量化（8-bit ~ 1-bit）对 OCR 可读性影响”的系统化消融实验。
    """
    _ensure_samples_exist()
    gt_txt_path = os.path.join("data", "ground_truth", "standard_doc_gt.txt")
    gt_img_path = os.path.join("data", "ground_truth", "standard_doc_gt.png")
    gt_text = open(gt_txt_path, "r", encoding="utf-8").read() if os.path.exists(gt_txt_path) else None

    if file is not None:
        contents = await file.read()
        target_img = decode_uploaded_image(contents)
        if not (file.filename and os.path.basename(file.filename) in SAMPLE_CATALOG):
            gt_text = None
    else:
        target_img = cv2.imread(gt_img_path)

    if target_img is None:
        raise HTTPException(status_code=400, detail="无法加载用于采样与量化分析的基准图像")

    sweep_data = await asyncio.to_thread(
        run_sampling_quantization_sweep, target_img, gt_text=gt_text, perform_ocr=True
    )
    return {
        "success": True,
        "sampling_sweep": sweep_data["sampling_sweep"],
        "quantization_sweep": sweep_data["quantization_sweep"]
    }


@app.post("/api/v1/evaluate")
async def evaluate_images(
    raw_file: UploadFile = File(...),
    enhanced_file: UploadFile = File(...),
    gt_text: Optional[str] = Form(None)
):
    """
    独立评测对比接口：计算两张图的 PSNR、SSIM 及 OCR 识别准确率。
    """
    raw_data = await raw_file.read()
    enh_data = await enhanced_file.read()

    raw_img = decode_uploaded_image(raw_data)
    enh_img = decode_uploaded_image(enh_data)

    if raw_img is None or enh_img is None:
        raise HTTPException(status_code=400, detail="图像解析失败")

    metrics = evaluate_quality_metrics(raw_img, enh_img)
    ocr_comparison = OCREvaluator.evaluate_comparison(raw_img, enh_img, ground_truth_text=gt_text)

    return {
        "metrics": metrics,
        "ocr_comparison": ocr_comparison
    }


frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


def run():
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    for p in [port, 8088, 8888, 9000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                port = p
                break

    lan_ip = _get_lan_ip()
    print(f"\n=======================================================")
    print(f"🚀 DocScanner-Enhancer v3.0 服务已启动!")
    print(f"👉 电脑端工作台: http://localhost:{port}")
    print(f"📱 手机局域网直连: http://{lan_ip}:{port}")
    print(f"=======================================================\n")
    uvicorn.run("src.server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    run()
