"""
v3.0 新增核心功能自动化测试套件：
1. 纯传统信号自动退化诊断引擎 (auto_diagnose)
2. 红章/彩色批注保真输出模式 (stamp_preserve)
3. 4K 超大手机实拍图多尺度金字塔处理与角点坐标映射
4. SSE 实时阶段进度流式增强与局域网 QR 手机拍传接力接口
"""

import json
import os
import cv2
import numpy as np
from fastapi.testclient import TestClient

from src.algorithms.auto_diagnose import diagnose_document
from src.evaluation.generate_samples import generate_benchmark_samples
from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.server import app


def _ensure_benchmark_files():
    if not os.path.exists("data/samples/test6_color_cast_noise.png"):
        generate_benchmark_samples()


def test_auto_diagnose_all_degradation_categories():
    _ensure_benchmark_files()

    cases = [
        ("data/ground_truth/standard_doc_gt.png", set(), {"shadow", "moire", "defocus_blur", "motion_blur", "skew"}),
        ("data/samples/test1_shadow.png", {"shadow"}, {"moire", "defocus_blur", "motion_blur"}),
        ("data/samples/test2_moire.png", {"moire"}, {"defocus_blur", "motion_blur"}),
        ("data/samples/test3_defocus.png", {"defocus_blur"}, {"moire", "motion_blur"}),
        ("data/samples/test4_complex_degraded.png", {"skew", "shadow", "moire"}, {"defocus_blur", "motion_blur"}),
        ("data/samples/test5_motion_blur.png", {"motion_blur"}, {"moire", "defocus_blur"}),
        ("data/samples/test6_color_cast_noise.png", {"shadow", "color_cast", "impulse_noise"}, {"moire", "defocus_blur"}),
    ]

    for path, must_have, must_not_have in cases:
        img = cv2.imread(path)
        assert img is not None, f"Failed to load {path}"
        res = diagnose_document(img)
        codes = {item["code"] for item in res["issues"]}
        assert must_have.issubset(codes), f"{path}: expected {must_have}, got {codes}"
        assert codes.isdisjoint(must_not_have), f"{path}: unexpected {codes & must_not_have}"
        assert res["elapsed_ms"] > 0


def test_stamp_preserve_and_4k_pyramid():
    _ensure_benchmark_files()
    doc = cv2.imread("data/samples/test1_shadow.png").copy()
    # 模拟文档底部盖有鲜艳红色公章
    cv2.circle(doc, (520, 680), 65, (20, 25, 220), 8)
    cv2.putText(doc, "SEAL", (485, 690), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (20, 25, 220), 3)

    diag = diagnose_document(doc)
    codes = {i["code"] for i in diag["issues"]}
    assert "color_stamp" in codes
    assert diag["recommended_params"]["output_mode"] == "stamp_preserve"

    # 测试自动诊断 + 红章保真输出
    events = []
    cfg = PipelineConfig(auto_diagnose=True)
    res = DocumentScannerPipeline(cfg).process(
        doc,
        collect_stages=True,
        perform_ocr=False,
        progress_callback=lambda sid, label, pct: events.append((sid, pct)),
    )
    assert cfg.output_mode == "stamp_preserve"
    assert len(events) >= 6
    out = res["final_image"]
    # 公章红圈像素应保持高红低蓝
    stamp_rim = out[680 - 68 : 680 - 62, 520 - 5 : 520 + 5]
    mean_bgr = np.mean(stamp_rim, axis=(0, 1))
    assert mean_bgr[2] > 180 and mean_bgr[2] - mean_bgr[0] > 120
    # 纸面空白区应为纯白净底
    paper_patch = out[45:65, 500:600]
    assert np.mean(paper_patch) > 245

    # 测试 4K 手机大图多尺度金字塔（3000x4000 -> 最大边 2200，角点仍映射回原图坐标系）
    doc_4k = cv2.resize(doc, (3000, 4000), interpolation=cv2.INTER_LINEAR)
    cfg_4k = PipelineConfig(auto_diagnose=True, max_working_dim=2200)
    res_4k = DocumentScannerPipeline(cfg_4k).process(doc_4k, collect_stages=True, perform_ocr=False)
    assert max(res_4k["final_image"].shape[:2]) == 2200
    assert res_4k["stages"][0].metadata["input_resolution"] == "3000x4000"


def test_v3_api_diagnose_sse_and_qr_relay():
    _ensure_benchmark_files()
    client = TestClient(app)

    # 1. 自动诊断接口
    r_diag = client.post("/api/v1/diagnose", data={"sample_name": "test4_complex_degraded.png"})
    assert r_diag.status_code == 200
    diag_codes = {i["code"] for i in r_diag.json()["diagnosis"]["issues"]}
    assert {"skew", "shadow", "moire"}.issubset(diag_codes)

    # 2. SSE 实时进度流式增强接口（含主图/OCR 异步解耦模式）
    r_sse = client.post(
        "/api/v1/enhance-stream",
        data={
            "sample_name": "test1_shadow.png",
            "params_json": json.dumps({"auto_diagnose": True, "defer_ocr": True}),
        },
    )
    assert r_sse.status_code == 200
    assert "text/event-stream" in r_sse.headers.get("content-type", "")
    assert "event: progress" in r_sse.text
    assert "event: result" in r_sse.text

    # 解析 SSE result 并验证后台异步 OCR 接口可无缝回填识别文本与准确率提升
    result_payload = None
    for block in r_sse.text.split("\n\n"):
        if "event: result" in block:
            for line in block.splitlines():
                if line.startswith("data:"):
                    result_payload = json.loads(line[5:].strip())
    assert result_payload is not None
    assert result_payload["ocr"]["pending"] is True
    job_id = result_payload.get("ocr_job_id")
    assert job_id

    r_ocr = client.post(f"/api/v1/ocr-eval/{job_id}")
    assert r_ocr.status_code == 200
    ocr_json = r_ocr.json()
    assert ocr_json["success"] is True
    assert ocr_json["ocr"]["pending"] is False
    assert ocr_json["ocr"]["comparison"] is not None

    # 3. 局域网二维码手机拍传接力接口
    r_sess = client.get("/api/v1/capture/new-session")
    assert r_sess.status_code == 200
    sess_data = r_sess.json()
    sid = sess_data["session_id"]
    assert sess_data["qr_base64"].startswith("data:image/png;base64,")
    assert f"capture_session={sid}" in sess_data["capture_url"]

    r_status = client.get(f"/api/v1/capture/{sid}/status")
    assert r_status.status_code == 200
    assert r_status.json()["active"] is True

    with open("data/samples/test1_shadow.png", "rb") as fp:
        r_up = client.post(
            f"/api/v1/capture/{sid}/upload",
            files={"file": ("mobile_shot.png", fp, "image/png")},
        )
    assert r_up.status_code == 200
    assert r_up.json()["success"] is True
    assert r_up.json()["width"] == 700
