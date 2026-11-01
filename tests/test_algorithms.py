"""
单元测试套件：空间域光照校正、频域滤波、模糊复原与二值化
"""

import numpy as np
import pytest
from src.algorithms.illumination import (
    estimate_background_illumination,
    remove_shadow_by_division,
    apply_clahe,
    adaptive_gamma_correction,
    enhance_illumination,
)
from src.algorithms.frequency import (
    compute_fft_spectrum,
    detect_periodic_peaks,
    create_gaussian_notch_filter,
    apply_frequency_notch_filter,
)
from src.algorithms.restoration import (
    create_defocus_psf,
    create_motion_psf,
    wiener_deconvolution,
    restore_blur,
)
from src.algorithms.binarization import (
    sharpen_laplacian,
    unsharp_mask,
    sauvola_threshold,
    otsu_threshold,
    binarize_document,
)


def test_illumination_correction():
    # 构造带有渐变阴影的人工图像
    x = np.linspace(50, 240, 200)
    shadow_grad = np.tile(x, (200, 1)).astype(np.uint8)
    
    bg = estimate_background_illumination(shadow_grad, kernel_size=31)
    divided = remove_shadow_by_division(shadow_grad, bg)
    
    # 除法后标准差应显著小于有阴影的原图
    assert np.std(divided) < np.std(shadow_grad)
    
    enhanced, _, gamma = enhance_illumination(shadow_grad)
    assert enhanced.shape == shadow_grad.shape
    assert 0.3 <= gamma <= 3.0


def test_frequency_notch_filtering():
    # 构造一张带有中高频正弦网纹的图像 (周期 4 像素 -> 频域偏移 128 / 4 = 32 > 25)
    h, w = 128, 128
    y, x = np.ogrid[:h, :w]
    grid_noise = (35 * np.sin(2 * np.pi * x / 4.0)).astype(np.float32)
    base = np.full((h, w), 180, dtype=np.float32)
    noisy_img = np.clip(base + grid_noise, 0, 255).astype(np.uint8)

    filtered, s_orig, s_filt, peaks = apply_frequency_notch_filter(noisy_img, d0=8.0)
    assert filtered.shape == noisy_img.shape
    assert s_orig.shape == noisy_img.shape
    assert len(peaks) > 0  # 成功检测出高频网纹脉冲
    # 滤波后平坦区域的方差应明显降低
    assert np.std(filtered) < np.std(noisy_img)


def test_wiener_restoration():
    shape = (100, 100)
    psf_defocus = create_defocus_psf(shape, radius=3)
    assert abs(np.sum(psf_defocus) - 1.0) < 1e-4

    psf_motion = create_motion_psf(shape, length=10, angle=45)
    assert abs(np.sum(psf_motion) - 1.0) < 1e-4

    # 简单图像测试反卷积不崩溃
    dummy = np.full(shape, 150, dtype=np.uint8)
    restored, _ = restore_blur(dummy, blur_type="defocus", radius=2)
    assert restored.shape == shape


def test_sauvola_binarization():
    # 模拟真实文档：白色/浅灰平坦纸面 (220-240) + 深色文字笔画
    img = np.random.randint(220, 240, (150, 150), dtype=np.uint8)
    # 绘制模拟黑色文字线
    img[40:45, 20:120] = 30
    
    binary = sauvola_threshold(img, window_size=15, k=0.2)
    # 文字线应该被成功二值化为黑色 (0)
    assert np.mean(binary[40:45, 20:120]) < 50
    # 背景绝大多数应为白色 (255)
    assert np.mean(binary[:30, :]) > 245

    sharp = sharpen_laplacian(img)
    assert sharp.shape == img.shape
