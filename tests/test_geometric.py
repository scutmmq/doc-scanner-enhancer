"""
单元测试套件：测试几何校正与色彩空间解耦
"""

import numpy as np
import pytest
from src.algorithms.geometric import order_points, perspective_transform, rectify_document
from src.algorithms.color_space import extract_luminance, restore_color, analyze_channel_statistics


def test_order_points():
    pts = np.array([[100, 100], [0, 0], [100, 0], [0, 100]], dtype="float32")
    ordered = order_points(pts)
    assert np.allclose(ordered[0], [0, 0])      # TL
    assert np.allclose(ordered[1], [100, 0])    # TR
    assert np.allclose(ordered[2], [100, 100])  # BR
    assert np.allclose(ordered[3], [0, 100])    # BL


def test_perspective_transform():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    corners = np.array([[20, 20], [180, 25], [175, 175], [25, 170]], dtype="float32")
    warped, m = perspective_transform(img, corners)
    assert warped.shape[0] > 100
    assert warped.shape[1] > 100
    assert m.shape == (3, 3)


def test_color_space_decoupling():
    img = np.random.randint(0, 256, (120, 120, 3), dtype=np.uint8)
    v, aux_hsv = extract_luminance(img, space="hsv")
    assert v.shape == (120, 120)
    restored_hsv = restore_color(v, aux_hsv)
    assert restored_hsv.shape == img.shape

    y, aux_ycbcr = extract_luminance(img, space="ycbcr")
    assert y.shape == (120, 120)
    restored_ycbcr = restore_color(y, aux_ycbcr)
    assert restored_ycbcr.shape == img.shape


def test_channel_statistics():
    img = np.full((100, 100), 128, dtype=np.uint8)
    stats = analyze_channel_statistics(img)
    assert abs(stats["mean_intensity"] - 128.0) < 1.0
    assert stats["dark_pixel_ratio"] == 0.0
