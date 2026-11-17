"""
单元测试套件：几何矫正、色彩空间与白平衡、空间域光照校正与去噪、频域滤波、模糊复原、二值化与采样量化
"""

import numpy as np
import pytest
from src.algorithms.geometric import detect_document_corners, rectify_document
from src.algorithms.color_space import (
    correct_color_cast,
    extract_luminance,
    restore_color,
    render_channel_montage,
)
from src.algorithms.illumination import (
    spatial_denoise,
    estimate_background_illumination,
    remove_shadow_by_division,
    apply_clahe,
    apply_global_hist_eq,
    adaptive_gamma_correction,
    enhance_illumination,
    render_histogram_comparison,
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
    create_gaussian_psf,
    wiener_deconvolution,
    restore_blur,
)
from src.algorithms.binarization import (
    sharpen_laplacian,
    unsharp_mask,
    sauvola_threshold,
    otsu_threshold,
    binarize_document,
    compute_sauvola_threshold_map,
)
from src.algorithms.sampling_quantization import (
    simulate_spatial_sampling,
    simulate_gray_quantization,
    apply_sampling_and_quantization,
)


def test_color_space_and_white_balance():
    # 构造偏黄暖色调文档图像 (R=245, G=220, B=155)
    warm_doc = np.zeros((120, 120, 3), dtype=np.uint8)
    warm_doc[:, :] = [155, 220, 245]
    warm_doc[40:50, 20:100] = [20, 25, 30]

    balanced, gains = correct_color_cast(warm_doc, method="paper_white")
    assert balanced.shape == warm_doc.shape
    assert gains["b_gain"] > 1.1  # 蓝色通道获得补偿增益

    lum, aux = extract_luminance(warm_doc, space="hsv", apply_white_balance=True)
    restored = restore_color(lum, aux, clean_paper_chroma=True)
    assert restored.shape == warm_doc.shape

    montage = render_channel_montage(warm_doc, space="ycbcr")
    assert montage.ndim == 3


def test_illumination_and_spatial_denoise():
    # 构造带有渐变阴影的人工图像
    x = np.linspace(60, 240, 200)
    shadow_grad = np.tile(x, (200, 1)).astype(np.uint8)

    bg = estimate_background_illumination(shadow_grad, kernel_size=31)
    divided = remove_shadow_by_division(shadow_grad, bg)

    # 除法后标准差应显著小于有阴影的原图
    assert np.std(divided) < np.std(shadow_grad)

    # 测试椒盐去噪
    noisy = shadow_grad.copy()
    noisy[20, 20] = 0
    noisy[50, 50] = 255
    denoised = spatial_denoise(noisy, method="median", kernel_size=3)
    assert denoised[20, 20] != 0
    assert denoised[50, 50] != 255

    enhanced, _, gamma = enhance_illumination(shadow_grad, contrast_method="stretch_clahe")
    assert enhanced.shape == shadow_grad.shape
    assert 0.5 <= gamma <= 1.5

    hist_vis = render_histogram_comparison(shadow_grad, enhanced)
    assert hist_vis.ndim == 3


def test_frequency_notch_filtering():
    # 构造一张带有中高频正弦网纹的图像 (周期 4 像素 -> 频域偏移 128 / 4 = 32 > 22)
    h, w = 128, 128
    y, x = np.ogrid[:h, :w]
    grid_noise = (45 * np.sin(2 * np.pi * x / 4.0)).astype(np.float32)
    base = np.full((h, w), 190, dtype=np.float32)
    noisy_img = np.clip(base + grid_noise, 0, 255).astype(np.uint8)

    filtered, s_orig, s_filt, peaks = apply_frequency_notch_filter(noisy_img, d0=10.0)
    assert filtered.shape == noisy_img.shape
    assert s_orig.shape == noisy_img.shape
    assert len(peaks) > 0
    assert np.std(filtered) < np.std(noisy_img)


def test_wiener_restoration():
    shape = (100, 100)
    psf_defocus = create_defocus_psf(shape, radius=3)
    assert abs(np.sum(psf_defocus) - 1.0) < 1e-4

    psf_motion = create_motion_psf(shape, length=9, angle=15)
    assert abs(np.sum(psf_motion) - 1.0) < 1e-4

    psf_gauss = create_gaussian_psf(shape, sigma=1.8)
    assert abs(np.sum(psf_gauss) - 1.0) < 1e-4

    dummy = np.full(shape, 230, dtype=np.uint8)
    dummy[40:60, 40:60] = 30
    restored, psf_vis = restore_blur(dummy, blur_type="motion", motion_length=7, motion_angle=0.0)
    assert restored.shape == shape
    assert psf_vis.ndim == 2


def test_sauvola_binarization():
    img = np.random.randint(225, 245, (150, 150), dtype=np.uint8)
    img[40:45, 20:120] = 25

    binary = sauvola_threshold(img, window_size=15, k=0.2)
    assert np.mean(binary[40:45, 20:120]) < 50
    assert np.mean(binary[:30, :]) > 245

    t_map = compute_sauvola_threshold_map(img, window_size=15, k=0.2)
    assert t_map.shape == img.shape

    sharp = sharpen_laplacian(img)
    assert sharp.shape == img.shape


def test_sampling_and_quantization():
    img = np.linspace(0, 255, 100 * 100, dtype=np.uint8).reshape((100, 100))
    sampled, meta_s = simulate_spatial_sampling(img, scale_factor=0.5)
    assert sampled.shape == img.shape
    assert meta_s["effective_dpi"] == 150

    quantized, meta_q = simulate_gray_quantization(img, bits=2)
    assert quantized.shape == img.shape
    assert meta_q["levels"] == 4
    assert len(np.unique(quantized)) <= 4

    combined, _ = apply_sampling_and_quantization(img, scale_factor=0.5, bits=4)
    assert combined.shape == img.shape
