"""API regressions without expensive OCR inference (adapted to v3.0 server)."""

import asyncio
from threading import Event
from unittest.mock import Mock

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src import server
from src.evaluation.ocr_evaluator import OCREvaluator


@pytest.fixture
def image_upload():
    image = np.full((32, 32, 3), 230, dtype=np.uint8)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return ("document.png", encoded.tobytes(), "image/png")


@pytest.fixture(autouse=True)
def skip_sample_generation(monkeypatch):
    monkeypatch.setattr(server, "_ensure_samples_exist", lambda: None)


@pytest.mark.parametrize("endpoint", ["/api/v1/enhance", "/api/v1/enhance-stream"])
@pytest.mark.parametrize(
    "files,data",
    [
        (None, None),
        (None, {"sample_name": "missing.png"}),
        ({"file": ("empty.png", b"", "image/png")}, None),
        ({"file": ("invalid.png", b"not an image", "image/png")}, None),
    ],
)
def test_enhance_invalid_input_returns_400(endpoint, files, data):
    response = TestClient(server.app).post(endpoint, files=files, data=data)
    assert response.status_code == 400


@pytest.mark.parametrize("endpoint", ["/api/v1/enhance", "/api/v1/enhance-stream"])
@pytest.mark.parametrize("params", ["{broken", "[]", "null", "1", '"text"'])
def test_enhance_invalid_json_returns_400(endpoint, image_upload, params):
    response = TestClient(server.app).post(
        endpoint,
        files={"file": image_upload},
        data={"params_json": params},
    )
    assert response.status_code == 400


@pytest.mark.parametrize(
    "path,field",
    [
        ("/api/v1/sampling-lab", "file"),
        ("/api/v1/evaluate", "raw_file"),
    ],
)
def test_empty_upload_returns_400(path, field, image_upload):
    files = {field: ("empty.png", b"", "image/png")}
    if path.endswith("evaluate"):
        files["enhanced_file"] = image_upload
    assert TestClient(server.app).post(path, files=files).status_code == 400


def test_comparison_reuses_cached_and_enhanced_result_including_empty(monkeypatch):
    image = np.zeros((32, 32, 3), dtype=np.uint8)
    extract = Mock(return_value=("raw text", [{"score": 0.8}]))
    monkeypatch.setattr(OCREvaluator, "extract_text", extract)

    report_cached = OCREvaluator.evaluate_comparison(
        image, image, cached_enhanced=("", [])
    )
    report_alias = OCREvaluator.evaluate_comparison(
        image, image, enhanced_result=("", [])
    )

    assert extract.call_count == 2
    assert report_cached["enhanced"]["text"] == ""
    assert report_cached["enhanced"]["box_count"] == 0
    assert report_alias["enhanced"]["text"] == ""
    assert report_alias["enhanced"]["box_count"] == 0


def test_comparison_default_still_extracts_both_images(monkeypatch):
    image = np.zeros((32, 32, 3), dtype=np.uint8)
    extract = Mock(side_effect=[("raw", []), ("enhanced", [{"score": 0.9}])])
    monkeypatch.setattr(OCREvaluator, "extract_text", extract)
    report = OCREvaluator.evaluate_comparison(image, image, ground_truth_text="enhanced")
    assert extract.call_count == 2
    assert report["accuracy_comparison"]["enhanced_accuracy"] == 100.0


def test_health_responds_during_enhancement_and_reuses_ocr(monkeypatch, image_upload):
    started, release = Event(), Event()
    image = np.full((32, 32, 3), 230, dtype=np.uint8)
    boxes = [{"score": 0.9, "text": "document", "box": []}]

    def process(*args, **kwargs):
        started.set()
        if not release.wait(timeout=5):
            raise RuntimeError("health request blocked by enhancement")
        return {
            "stages": [],
            "final_image": image,
            "rectified_raw_image": image,
            "ocr_text": "document",
            "ocr_boxes": boxes,
            "total_elapsed_ms": 10,
            "diagnosis": None,
        }

    monkeypatch.setattr(server.DocumentScannerPipeline, "process", process)
    extract = Mock(return_value=("raw", []))
    monkeypatch.setattr(OCREvaluator, "extract_text", extract)

    async def exercise():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app),
            base_url="http://test",
        ) as client:
            task = asyncio.create_task(
                client.post("/api/v1/enhance", files={"file": image_upload})
            )
            try:
                assert await asyncio.to_thread(started.wait, 2)
                health = await asyncio.wait_for(client.get("/api/v1/health"), timeout=1)
                assert health.status_code == 200
            finally:
                release.set()
            response = await task
            assert response.status_code == 200
            body = response.json()
            assert body["ocr"]["text"] == "document"
            assert body["ocr"]["comparison"]["enhanced"]["text"] == "document"
            assert extract.call_count == 1

    asyncio.run(exercise())


def test_evaluate_endpoint_does_not_block_health(monkeypatch, image_upload):
    started, release = Event(), Event()

    def slow_compare(raw_img, enh_img, ground_truth_text=None):
        started.set()
        if not release.wait(timeout=5):
            raise RuntimeError("evaluate blocked event loop")
        return {"raw": {"text": ""}, "enhanced": {"text": ""}}

    monkeypatch.setattr(OCREvaluator, "evaluate_comparison", slow_compare)

    async def exercise():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app),
            base_url="http://test",
        ) as client:
            task = asyncio.create_task(
                client.post(
                    "/api/v1/evaluate",
                    files={"raw_file": image_upload, "enhanced_file": image_upload},
                )
            )
            try:
                assert await asyncio.to_thread(started.wait, 2)
                health = await asyncio.wait_for(client.get("/api/v1/health"), timeout=1)
                assert health.status_code == 200
            finally:
                release.set()
            response = await task
            assert response.status_code == 200

    asyncio.run(exercise())
