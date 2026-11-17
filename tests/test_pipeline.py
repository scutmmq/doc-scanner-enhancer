"""
全流程 Pipeline 串联与 FastAPI 接口测试套件
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient
from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics
from src.server import app


def test_pipeline_execution():
    # 模拟一张 300x300 彩色带文字和阴影的文档图
    img = np.full((300, 300, 3), 235, dtype=np.uint8)
    img[:150, :] = (img[:150, :].astype(np.float32) * 0.55).astype(np.uint8)
    img[80:86, 50:250] = 15
    img[200:206, 50:250] = 15

    cfg = PipelineConfig(
        enable_geometric=False,
        output_mode="binary"
    )
    pipeline = DocumentScannerPipeline(cfg)
    result = pipeline.process(img, collect_stages=True, perform_ocr=False)

    assert result["final_image"] is not None
    assert len(result["stages"]) == 6
    assert result["total_elapsed_ms"] > 0

    metrics = evaluate_quality_metrics(img, result["final_image"])
    assert "psnr" in metrics
    assert "ssim" in metrics
    assert "background_uniformity" in metrics
    assert "contrast_cnr" in metrics


def test_fastapi_endpoints():
    client = TestClient(app)

    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    samples = client.get("/api/v1/samples")
    assert samples.status_code == 200
    data = samples.json()
    assert data["success"] is True
    assert len(data["samples"]) >= 6
