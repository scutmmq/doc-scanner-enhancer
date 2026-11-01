"""
全流程 Pipeline 串联测试套件
"""

import numpy as np
import pytest
from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics


def test_pipeline_execution():
    # 模拟一张 300x300 彩色带文字和阴影的文档图
    img = np.full((300, 300, 3), 220, dtype=np.uint8)
    # 添加阴影
    img[:150, :] = (img[:150, :].astype(np.float32) * 0.5).astype(np.uint8)
    # 模拟文字条
    img[80:85, 50:250] = 0
    img[200:205, 50:250] = 0

    cfg = PipelineConfig(
        enable_geometric=False,  # 测试图无透视畸变，跳过几何检测
        output_mode="binary"
    )
    pipeline = DocumentScannerPipeline(cfg)
    result = pipeline.process(img, collect_stages=True, perform_ocr=False)

    assert result["final_image"] is not None
    assert len(result["stages"]) >= 5
    assert result["total_elapsed_ms"] > 0

    # 评价指标不崩溃
    metrics = evaluate_quality_metrics(img, result["final_image"])
    assert "psnr" in metrics
    assert "ssim" in metrics
