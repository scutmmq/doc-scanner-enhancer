"""
数字图像处理核心算法库 (DocScanner-Enhancer Algorithms Package)
华南理工大学《数字图像处理》课程设计 · 课题一
纯传统数字图像处理算法驱动，涵盖空间域、频率域、退化复原与二值化。
"""

from .geometric import detect_document_corners, perspective_transform, rectify_document, order_points
from .color_space import extract_luminance, restore_color, analyze_channel_statistics, split_hsv, split_ycbcr
from .illumination import (
    estimate_background_illumination,
    remove_shadow_by_division,
    apply_clahe,
    adaptive_gamma_correction,
    linear_contrast_stretch,
    enhance_illumination,
)
from .frequency import (
    compute_fft_spectrum,
    detect_periodic_peaks,
    create_gaussian_notch_filter,
    apply_frequency_notch_filter,
)
from .restoration import (
    create_defocus_psf,
    create_motion_psf,
    wiener_deconvolution,
    restore_blur,
)
from .binarization import (
    sharpen_laplacian,
    unsharp_mask,
    sauvola_threshold,
    niblack_threshold,
    otsu_threshold,
    binarize_document,
)

__all__ = [
    "detect_document_corners",
    "perspective_transform",
    "rectify_document",
    "order_points",
    "extract_luminance",
    "restore_color",
    "analyze_channel_statistics",
    "split_hsv",
    "split_ycbcr",
    "estimate_background_illumination",
    "remove_shadow_by_division",
    "apply_clahe",
    "adaptive_gamma_correction",
    "linear_contrast_stretch",
    "enhance_illumination",
    "compute_fft_spectrum",
    "detect_periodic_peaks",
    "create_gaussian_notch_filter",
    "apply_frequency_notch_filter",
    "create_defocus_psf",
    "create_motion_psf",
    "wiener_deconvolution",
    "restore_blur",
    "sharpen_laplacian",
    "unsharp_mask",
    "sauvola_threshold",
    "niblack_threshold",
    "otsu_threshold",
    "binarize_document",
]
