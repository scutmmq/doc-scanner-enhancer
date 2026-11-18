"""
FastAPI 后端服务入口 (DocScanner-Enhancer REST API Server)
华南理工大学《数字图像处理》课程设计 · 课题一
提供高并发异步接口、内置 6 类退化样本画廊、全流程图像处理、单步参数微调、采样量化分析实验室与 OCR 评测看板接口。
"""

import os
import io
import json
import time
import base64
from typing import Optional, List, Dict, Any
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics
from src.evaluation.ocr_evaluator import OCREvaluator
from src.evaluation.generate_samples import SAMPLE_CATALOG, generate_benchmark_samples
from src.algorithms.sampling_quantization import (
    apply_sampling_and_quantization,
    run_sampling_quantization_sweep,
)

app = FastAPI(
    title="DocScanner API",
    description="智能文档扫描、退化复原与可读性增强引擎 REST API",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def cv2_to_base64(image: np.ndarray, ext: str = ".png") -> str:
    """将 OpenCV 图像编码为 Base64 字符串"""
    success, buffer = cv2.imencode(ext, image)
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
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法解析图像数据")
    return image


def _ensure_samples_exist():
    """确保 6 类基准退化样本与真值文件已生成"""
    gt_path = os.path.join("data", "ground_truth", "standard_doc_gt.png")
    s6_path = os.path.join("data", "samples", "test6_color_cast_noise.png")
    if not os.path.exists(gt_path) or not os.path.exists(s6_path):
        generate_benchmark_samples()


@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "service": "DocScanner-Enhancer API", "version": "2.0.0"}


@app.get("/api/v1/samples")
def list_benchmark_samples():
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
def get_benchmark_sample(sample_name: str):
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


@app.post("/api/v1/enhance")
def enhance_document(
    file: Optional[UploadFile] = File(None),
    sample_name: Optional[str] = Form(None),
    params_json: Optional[str] = Form(None)
):
    """
    一键全流程增强接口 (支持上传 Multipart 图像文件或指定内置 sample_name + JSON 超参数)。
    """
    try:
        _ensure_samples_exist()
        matched_sample_name: Optional[str] = None

        if file is not None:
            contents = file.file.read()
            if not contents:
                raise HTTPException(status_code=400, detail="上传的图片文件为空")
            nparr = np.frombuffer(contents, np.uint8)
            raw_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
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

        try:
            cfg_dict = json.loads(params_json) if params_json else {}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="params_json 必须是有效的 JSON 对象")
        if not isinstance(cfg_dict, dict):
            raise HTTPException(status_code=400, detail="params_json 必须是 JSON 对象")
        if not matched_sample_name and cfg_dict.get("sample_name") in SAMPLE_CATALOG:
            matched_sample_name = cfg_dict.get("sample_name")

        manual_corners = None
        if cfg_dict.get("manual_corners"):
            manual_corners = np.array(cfg_dict["manual_corners"], dtype="float32")

        config = PipelineConfig(
            sampling_scale=float(cfg_dict.get("sampling_scale", 1.0)),
            quantization_bits=int(cfg_dict.get("quantization_bits", 8)),
            output_mode=cfg_dict.get("output_mode", "binary"),
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
            soft_blend=cfg_dict.get("soft_blend", True)
        )

        pipeline = DocumentScannerPipeline(config=config)
        res = pipeline.process(raw_img, collect_stages=True, perform_ocr=True)

        stages_payload = []
        for s in res["stages"]:
            stage_item = {
                "stage_id": s.stage_id,
                "stage_name": s.stage_name,
                "elapsed_ms": s.elapsed_ms,
                "image_base64": cv2_to_base64(s.output_image),
                "metadata": s.metadata,
                "diagnostics": {
                    k: cv2_to_base64(v) for k, v in s.diagnostic_images.items()
                }
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
            # 实拍无真值模式：以光照归一化后的灰度结构作为高保真参考基准计算结构保真度，并附带无参考文档指标
            stage3_img = res["stages"][2].output_image if len(res["stages"]) >= 3 else res["rectified_raw_image"]
            metrics = evaluate_quality_metrics(stage3_img, res["final_image"], raw_image=eval_input_img)

        ocr_comparison = OCREvaluator.evaluate_comparison(
            eval_input_img, res["final_image"], ground_truth_text=gt_text,
            enhanced_result=(res["ocr_text"], res["ocr_boxes"])
        )

        return {
            "success": True,
            "sample_name": matched_sample_name,
            "total_elapsed_ms": res["total_elapsed_ms"],
            "raw_image_base64": cv2_to_base64(eval_input_img),
            "rectified_raw_base64": cv2_to_base64(res["rectified_raw_image"]),
            "final_image_base64": cv2_to_base64(res["final_image"]),
            "stages": stages_payload,
            "metrics": metrics,
            "ocr": {
                "text": res["ocr_text"],
                "boxes": res["ocr_boxes"],
                "comparison": ocr_comparison
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/sampling-lab")
def run_sampling_lab(
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
        contents = file.file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="上传的图片文件为空")
        target_img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if not (file.filename and os.path.basename(file.filename) in SAMPLE_CATALOG):
            gt_text = None
    else:
        target_img = cv2.imread(gt_img_path)

    if target_img is None:
        raise HTTPException(status_code=400, detail="无法加载用于采样与量化分析的基准图像")

    sweep_data = run_sampling_quantization_sweep(target_img, gt_text=gt_text, perform_ocr=True)
    return {
        "success": True,
        "sampling_sweep": sweep_data["sampling_sweep"],
        "quantization_sweep": sweep_data["quantization_sweep"]
    }


@app.post("/api/v1/evaluate")
def evaluate_images(
    raw_file: UploadFile = File(...),
    enhanced_file: UploadFile = File(...),
    gt_text: Optional[str] = Form(None)
):
    """
    独立评测对比接口：计算两张图的 PSNR、SSIM 及 OCR 识别准确率。
    """
    raw_data = raw_file.file.read()
    enh_data = enhanced_file.file.read()
    if not raw_data or not enh_data:
        raise HTTPException(status_code=400, detail="上传的图片文件为空")

    raw_img = cv2.imdecode(np.frombuffer(raw_data, np.uint8), cv2.IMREAD_COLOR)
    enh_img = cv2.imdecode(np.frombuffer(enh_data, np.uint8), cv2.IMREAD_COLOR)

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
    import socket

    port = int(os.environ.get("PORT", 8080))
    for p in [port, 8088, 8888, 9000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                port = p
                break

    print(f"\n=======================================================")
    print(f"🚀 DocScanner-Enhancer v2.0 服务已启动!")
    print(f"👉 本地浏览器直接访问: http://localhost:{port}")
    print(f"=======================================================\n")
    uvicorn.run("src.server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    run()
