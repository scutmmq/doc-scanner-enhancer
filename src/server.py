"""
FastAPI 后端服务入口 (DocScanner-Enhancer REST API Server)
华南理工大学《数字图像处理》课程设计 · 课题一
提供高并发异步接口、全流程图像处理、单步参数微调与 OCR 评测看板接口。
"""

import os
import io
import time
import base64
from typing import Optional, List, Dict, Any
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics
from src.evaluation.ocr_evaluator import OCREvaluator

app = FastAPI(
    title="DocScanner-Enhancer API",
    description="华南理工大学《数字图像处理》课程设计 · 手机文档扫描与可读性增强系统后端",
    version="1.0.0"
)

# 允许跨域（支持 React Vite 前端本地联调）
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


class PipelineParamsRequest(BaseModel):
    image_base64: str = Field(..., description="输入的待处理文档图像 Base64")
    output_mode: str = Field("binary", description="'binary' 或 'color'")
    enable_geometric: bool = True
    enable_illumination: bool = True
    illumination_kernel_size: int = 45
    clahe_clip_limit: float = 2.0
    apply_gamma: bool = True
    enable_frequency_filter: bool = True
    notch_radius: float = 12.0
    enable_restoration: bool = False
    blur_type: str = "defocus"
    defocus_radius: int = 4
    wiener_k: float = 0.015
    binarize_method: str = "sauvola"
    sauvola_window_size: int = 25
    sauvola_k: float = 0.2
    sharpen: bool = True
    sharpen_strength: float = 0.4
    ground_truth_text: Optional[str] = None


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "DocScanner-Enhancer API", "version": "1.0.0"}


@app.post("/api/v1/enhance")
async def enhance_document(
    file: Optional[UploadFile] = File(None),
    params_json: Optional[str] = Form(None)
):
    """
    一键全流程增强接口 (支持上传 Multipart 图像文件或 JSON 参数)。
    """
    try:
        if file is not None:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            raw_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            raise HTTPException(status_code=400, detail="必须上传图片文件")

        if raw_img is None:
            raise HTTPException(status_code=400, detail="无法解析上传的图片文件")

        # 解析配置参数
        import json
        cfg_dict = json.loads(params_json) if params_json else {}

        config = PipelineConfig(
            output_mode=cfg_dict.get("output_mode", "binary"),
            enable_geometric=cfg_dict.get("enable_geometric", True),
            enable_illumination=cfg_dict.get("enable_illumination", True),
            illumination_kernel_size=cfg_dict.get("illumination_kernel_size", 45),
            clahe_clip_limit=cfg_dict.get("clahe_clip_limit", 2.0),
            apply_gamma=cfg_dict.get("apply_gamma", True),
            enable_frequency_filter=cfg_dict.get("enable_frequency_filter", True),
            notch_radius=cfg_dict.get("notch_radius", 12.0),
            enable_restoration=cfg_dict.get("enable_restoration", False),
            blur_type=cfg_dict.get("blur_type", "defocus"),
            defocus_radius=cfg_dict.get("defocus_radius", 4),
            wiener_k=cfg_dict.get("wiener_k", 0.015),
            binarize_method=cfg_dict.get("binarize_method", "sauvola"),
            sauvola_window_size=cfg_dict.get("sauvola_window_size", 25),
            sauvola_k=cfg_dict.get("sauvola_k", 0.2),
            sharpen=cfg_dict.get("sharpen", True),
            sharpen_strength=cfg_dict.get("sharpen_strength", 0.4)
        )

        pipeline = DocumentScannerPipeline(config=config)
        res = pipeline.process(raw_img, collect_stages=True, perform_ocr=True)

        # 整理各阶段中间图为 Base64 供前端交互滑动查看
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

        # 客观质量指标计算
        metrics = evaluate_quality_metrics(raw_img, res["final_image"])

        # 下游 OCR 评测对比
        gt_text = cfg_dict.get("ground_truth_text")
        ocr_comparison = OCREvaluator.evaluate_comparison(
            raw_img, res["final_image"], ground_truth_text=gt_text
        )

        return {
            "success": True,
            "total_elapsed_ms": res["total_elapsed_ms"],
            "final_image_base64": cv2_to_base64(res["final_image"]),
            "stages": stages_payload,
            "metrics": metrics,
            "ocr": {
                "text": res["ocr_text"],
                "boxes": res["ocr_boxes"],
                "comparison": ocr_comparison
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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


# 如果前端已经 build，则托管静态资源
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


def run():
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
