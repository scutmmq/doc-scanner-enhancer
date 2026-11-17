"""
全流程串联管线模块 (Document Scanner Enhancement Pipeline)
华南理工大学《数字图像处理》课程设计 · 课题一
串联 7 大核心阶段，支持单步调试、多维学术诊断图导出、采样量化模拟与全自动一键增强。
"""

import time
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
import numpy as np
import cv2

from src.algorithms.geometric import rectify_document, render_geometric_diagnostics
from src.algorithms.color_space import (
    extract_luminance,
    restore_color,
    analyze_channel_statistics,
    render_channel_montage,
)
from src.algorithms.illumination import (
    enhance_illumination,
    render_histogram_comparison,
    linear_contrast_stretch,
    spatial_denoise,
)
from src.algorithms.frequency import apply_frequency_notch_filter, compute_fft_spectrum
from src.algorithms.restoration import restore_blur, create_defocus_psf
from src.algorithms.binarization import (
    binarize_document,
    compute_sauvola_threshold_map,
)
from src.algorithms.sampling_quantization import apply_sampling_and_quantization
from src.evaluation.ocr_evaluator import OCREvaluator


@dataclass
class StageResult:
    """单个阶段执行结果与诊断数据"""
    stage_id: int
    stage_name: str
    output_image: np.ndarray
    elapsed_ms: float
    metadata: Dict[str, Any] = field(default_factory=dict)
    diagnostic_images: Dict[str, np.ndarray] = field(default_factory=dict)


@dataclass
class PipelineConfig:
    """全流水线超参数配置类"""
    # 可选前置模拟: 采样率与灰度量化 (任务书要求 1)
    sampling_scale: float = 1.0
    quantization_bits: int = 8

    # 阶段 1: 几何校正
    enable_geometric: bool = True
    manual_corners: Optional[np.ndarray] = None
    
    # 阶段 2: 色彩解耦与偏色白平衡校正
    color_space: str = "hsv"  # 'hsv' 或 'ycbcr'
    enable_white_balance: bool = True
    
    # 阶段 3: 空间域去噪、去阴影与光照校正
    enable_illumination: bool = True
    illumination_kernel_size: int = 45
    clahe_clip_limit: float = 2.0
    contrast_method: str = "stretch_clahe"  # 'stretch_clahe', 'stretch', 'clahe', 'hist_eq', 'none'
    denoise_method: str = "none"            # 'none', 'median', 'bilateral', 'gaussian'
    denoise_ksize: int = 3
    apply_gamma: bool = True
    manual_gamma: Optional[float] = None
    
    # 阶段 4: 频域去网纹
    enable_frequency_filter: bool = True
    notch_radius: float = 12.0
    auto_detect_peaks: bool = True
    manual_peaks: Optional[List[Tuple[int, int]]] = None
    
    # 阶段 5: 退化去模糊
    enable_restoration: bool = False  # 默认按需开启，避免对清晰图产生伪影
    blur_type: str = "defocus"        # 'defocus', 'motion', 'gaussian'
    defocus_radius: int = 3
    motion_length: int = 12
    motion_angle: float = 0.0
    wiener_k: float = 0.02
    
    # 阶段 6: 锐化与二值化
    enable_binarization: bool = True
    binarize_method: str = "sauvola"  # 'sauvola', 'otsu', 'niblack'
    sauvola_window_size: int = 25
    sauvola_k: float = 0.18
    sharpen: bool = True
    sharpen_strength: float = 0.35
    soft_blend: bool = True
    
    # 输出模式: 'binary' (高清黑白/抗锯齿文档), 'color' (高清保真无偏色彩色文档), 'gray' (增强灰度文档)
    output_mode: str = "binary"


class DocumentScannerPipeline:
    """
    手机文档扫描与可读性增强系统全流程引擎。
    """
    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()

    def process(
        self,
        raw_image: np.ndarray,
        collect_stages: bool = True,
        perform_ocr: bool = True
    ) -> Dict[str, Any]:
        """
        运行全套传统算法增强管线。
        
        参数:
            raw_image: 手机拍摄的原始图像 (BGR uint8)
            collect_stages: 是否保存每个阶段的中间图与诊断图（用于报告和答辩展示）
            perform_ocr: 是否由下游 RapidOCR 提取文本
            
        返回:
            包含 final_image, stages, ocr_text, total_elapsed_ms 的字典
        """
        stages: List[StageResult] = []
        start_total = time.perf_counter()
        current_img = raw_image.copy()

        # 若开启了采样/量化退化实验参数，先施加重采样与重量化
        if self.config.sampling_scale < 0.999 or self.config.quantization_bits < 8:
            current_img, _ = apply_sampling_and_quantization(
                current_img,
                scale_factor=self.config.sampling_scale,
                bits=self.config.quantization_bits
            )

        # ==========================================
        # 阶段 (1): 预处理与几何矫正 (透视变换)
        # ==========================================
        t0 = time.perf_counter()
        pre_geo_img = current_img.copy()
        corners_used = None
        auto_detected = False
        if self.config.enable_geometric:
            current_img, corners_used, auto_detected = rectify_document(
                current_img, manual_corners=self.config.manual_corners
            )
        else:
            h0, w0 = current_img.shape[:2]
            corners_used = np.array([[0, 0], [w0 - 1, 0], [w0 - 1, h0 - 1], [0, h0 - 1]], dtype="float32")
        elapsed_1 = (time.perf_counter() - t0) * 1000

        if collect_stages:
            geo_diag = render_geometric_diagnostics(pre_geo_img, corners_used, auto_detected)
            stages.append(StageResult(
                stage_id=1,
                stage_name="几何矫正与透视变换",
                output_image=current_img.copy(),
                elapsed_ms=round(elapsed_1, 2),
                metadata={
                    "corners": corners_used.tolist() if corners_used is not None else [],
                    "detected_corners": corners_used.tolist() if corners_used is not None else [],
                    "auto_detected": auto_detected,
                    "output_resolution": f"{current_img.shape[1]}x{current_img.shape[0]}"
                },
                diagnostic_images={"corner_detection": geo_diag}
            ))

        # ==========================================
        # 阶段 (2): 色彩空间解耦、白平衡与通道分离
        # ==========================================
        t0 = time.perf_counter()
        if self.config.denoise_method != "none" and len(current_img.shape) == 3:
            current_img = spatial_denoise(
                current_img,
                method=self.config.denoise_method,
                kernel_size=self.config.denoise_ksize
            )
        luminance_channel, aux_chroma = extract_luminance(
            current_img,
            space=self.config.color_space,
            apply_white_balance=self.config.enable_white_balance
        )
        stats = analyze_channel_statistics(current_img)
        elapsed_2 = (time.perf_counter() - t0) * 1000

        if collect_stages:
            wb_preview = aux_chroma.get("wb_image", current_img)
            channel_montage = render_channel_montage(wb_preview, space=self.config.color_space)
            diag_s2 = {"channel_montage": channel_montage}
            if self.config.enable_white_balance and len(current_img.shape) == 3:
                diag_s2["white_balanced_color"] = wb_preview
            stages.append(StageResult(
                stage_id=2,
                stage_name="色彩空间转换与亮度分离",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_2, 2),
                metadata={
                    "color_space": self.config.color_space.upper(),
                    "white_balance_gains": aux_chroma.get("wb_gains", {}),
                    "stats": stats
                },
                diagnostic_images=diag_s2
            ))

        raw_luminance = luminance_channel.copy()

        # ==========================================
        # 物理顺序优化:
        # 若图像开启了频域去网纹 (Stage 4) 或线性维纳去模糊 (Stage 5)，
        # 先检测并滤除周期性网纹/线性卷积模糊，防止 Stage 3 的非线性对比度拉伸破坏频域正弦峰与 PSF 线性假设。
        # ==========================================
        pre_filtered_lum = raw_luminance.copy()
        detected_notch_peaks = []
        orig_spectrum = None
        filtered_spectrum = None

        t0_freq = time.perf_counter()
        if self.config.enable_frequency_filter:
            pre_filtered_lum, orig_spectrum, filtered_spectrum, detected_notch_peaks = apply_frequency_notch_filter(
                pre_filtered_lum,
                notch_points=self.config.manual_peaks,
                d0=self.config.notch_radius,
                auto_detect=self.config.auto_detect_peaks
            )
        else:
            _, orig_spectrum = compute_fft_spectrum(pre_filtered_lum)
            filtered_spectrum = orig_spectrum
        elapsed_4 = (time.perf_counter() - t0_freq) * 1000

        t0_rest = time.perf_counter()
        psf_vis = None
        if self.config.enable_restoration:
            pre_filtered_lum, psf_vis = restore_blur(
                pre_filtered_lum,
                blur_type=self.config.blur_type,
                radius=self.config.defocus_radius,
                motion_length=self.config.motion_length,
                motion_angle=self.config.motion_angle,
                k=self.config.wiener_k
            )
        else:
            psf_raw = create_defocus_psf((64, 64), radius=self.config.defocus_radius)
            psf_vis = cv2.resize(
                cv2.normalize(psf_raw[16:48, 16:48], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8),
                (160, 160),
                interpolation=cv2.INTER_NEAREST
            )
        elapsed_5 = (time.perf_counter() - t0_rest) * 1000

        # ==========================================
        # 阶段 (3): 空间域光照校正与阴影去除
        # ==========================================
        t0 = time.perf_counter()
        bg_field = None
        applied_gamma = 1.0
        # Stage 3 的独立展示图（对原始亮度做光照校正）以及对已消网纹/去模糊亮度的校正
        if self.config.enable_illumination:
            stage3_display_lum, bg_field, applied_gamma = enhance_illumination(
                raw_luminance,
                kernel_size=self.config.illumination_kernel_size,
                clip_limit=self.config.clahe_clip_limit,
                apply_gamma=self.config.apply_gamma,
                gamma_val=self.config.manual_gamma,
                contrast_method=self.config.contrast_method,
                denoise_method=self.config.denoise_method,
                denoise_ksize=self.config.denoise_ksize
            )
            if detected_notch_peaks or self.config.enable_restoration:
                luminance_channel, _, _ = enhance_illumination(
                    pre_filtered_lum,
                    kernel_size=self.config.illumination_kernel_size,
                    clip_limit=self.config.clahe_clip_limit,
                    apply_gamma=self.config.apply_gamma,
                    gamma_val=self.config.manual_gamma,
                    contrast_method=self.config.contrast_method,
                    denoise_method=self.config.denoise_method,
                    denoise_ksize=self.config.denoise_ksize
                )
            else:
                luminance_channel = stage3_display_lum
        else:
            stage3_display_lum = raw_luminance.copy()
            luminance_channel = pre_filtered_lum.copy()
        elapsed_3 = (time.perf_counter() - t0) * 1000

        if collect_stages:
            diag_map = {}
            if bg_field is not None:
                diag_map["estimated_background"] = bg_field
            diag_map["histogram_comparison"] = render_histogram_comparison(raw_luminance, luminance_channel)
            stages.append(StageResult(
                stage_id=3,
                stage_name="空间域光照校正与去阴影",
                output_image=stage3_display_lum.copy(),
                elapsed_ms=round(elapsed_3, 2),
                metadata={
                    "applied_gamma": round(applied_gamma, 3),
                    "contrast_method": self.config.contrast_method,
                    "denoise_method": self.config.denoise_method
                },
                diagnostic_images=diag_map
            ))

        # ==========================================
        # 阶段 (4): 频率域滤波抑制网纹与摩尔纹 (展示阶段产物与频谱)
        # ==========================================
        stage4_img = luminance_channel.copy() if detected_notch_peaks else stage3_display_lum.copy()
        if collect_stages:
            diag_freq = {
                "orig_spectrum": orig_spectrum,
                "filtered_spectrum": filtered_spectrum
            }
            stages.append(StageResult(
                stage_id=4,
                stage_name="频率域滤波抑制网纹",
                output_image=stage4_img,
                elapsed_ms=round(elapsed_4, 2),
                metadata={
                    "detected_notch_peaks": detected_notch_peaks,
                    "notch_count": len(detected_notch_peaks),
                    "notch_radius": self.config.notch_radius
                },
                diagnostic_images=diag_freq
            ))

        # ==========================================
        # 阶段 (5): 退化建模与维纳滤波模糊复原
        # ==========================================
        if collect_stages:
            diag_rest = {}
            if psf_vis is not None:
                diag_rest["psf_visualization"] = psf_vis
            stages.append(StageResult(
                stage_id=5,
                stage_name="退化建模与维纳滤波去模糊",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_5, 2),
                metadata={
                    "enabled": self.config.enable_restoration,
                    "blur_type": self.config.blur_type,
                    "wiener_k": self.config.wiener_k
                },
                diagnostic_images=diag_rest
            ))

        # ==========================================
        # 阶段 (6): 文字锐化与局部自适应二值化
        # ==========================================
        t0 = time.perf_counter()
        if self.config.enable_binarization:
            binary_output, sharpened_gray = binarize_document(
                luminance_channel,
                method=self.config.binarize_method,
                window_size=self.config.sauvola_window_size,
                k_sauvola=self.config.sauvola_k,
                sharpen=self.config.sharpen,
                sharpen_strength=self.config.sharpen_strength,
                soft_blend=self.config.soft_blend
            )
        else:
            sharpened_gray = luminance_channel.copy()
            binary_output = luminance_channel.copy()
        elapsed_6 = (time.perf_counter() - t0) * 1000

        if collect_stages:
            thresh_map = compute_sauvola_threshold_map(
                sharpened_gray,
                window_size=self.config.sauvola_window_size,
                k=self.config.sauvola_k
            )
            thresh_vis = np.clip(thresh_map, 0, 255).astype(np.uint8)
            stages.append(StageResult(
                stage_id=6,
                stage_name="文字锐化与自适应二值化",
                output_image=binary_output.copy(),
                elapsed_ms=round(elapsed_6, 2),
                metadata={
                    "method": self.config.binarize_method,
                    "window_size": self.config.sauvola_window_size,
                    "sauvola_k": self.config.sauvola_k,
                    "soft_blend": self.config.soft_blend
                },
                diagnostic_images={
                    "sharpened_gray": sharpened_gray,
                    "threshold_surface": thresh_vis
                }
            ))

        # 决定最终输出图像
        if self.config.output_mode == "color":
            # 利用二值化净化后的背景掩模消除纸面残余噪点，同时保留印章与彩字色度
            color_lum = np.where(binary_output >= 245, 250, sharpened_gray).astype(np.uint8)
            final_image = restore_color(color_lum, aux_chroma, clean_paper_chroma=True)
        elif self.config.output_mode == "gray":
            final_image = cv2.cvtColor(sharpened_gray, cv2.COLOR_GRAY2BGR)
        else:
            final_image = cv2.cvtColor(binary_output, cv2.COLOR_GRAY2BGR)

        total_elapsed = (time.perf_counter() - start_total) * 1000

        # ==========================================
        # 阶段 (7): 下游 RapidOCR 文本识别
        # ==========================================
        ocr_text = ""
        ocr_boxes = []
        if perform_ocr:
            ocr_text, ocr_boxes = OCREvaluator.extract_text(final_image)

        return {
            "final_image": final_image,
            "rectified_raw_image": current_img,
            "stages": stages,
            "ocr_text": ocr_text,
            "ocr_boxes": ocr_boxes,
            "total_elapsed_ms": round(total_elapsed, 2)
        }
