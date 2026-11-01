"""
全流程串联管线模块 (Document Scanner Enhancement Pipeline)
华南理工大学《数字图像处理》课程设计 · 课题一
串联 7 大核心阶段，支持单步调试、中间态图元导出与全自动一键增强。
"""

import time
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
import numpy as np
import cv2

from src.algorithms.geometric import rectify_document
from src.algorithms.color_space import extract_luminance, restore_color, analyze_channel_statistics
from src.algorithms.illumination import enhance_illumination
from src.algorithms.frequency import apply_frequency_notch_filter, compute_fft_spectrum
from src.algorithms.restoration import restore_blur
from src.algorithms.binarization import binarize_document
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
    # 阶段 1: 几何校正
    enable_geometric: bool = True
    manual_corners: Optional[np.ndarray] = None
    
    # 阶段 2: 色彩解耦
    color_space: str = "hsv"  # 'hsv' 或 'ycbcr'
    
    # 阶段 3: 空间域去阴影与光照
    enable_illumination: bool = True
    illumination_kernel_size: int = 45
    clahe_clip_limit: float = 2.0
    apply_gamma: bool = True
    manual_gamma: Optional[float] = None
    
    # 阶段 4: 频域去网纹
    enable_frequency_filter: bool = True
    notch_radius: float = 12.0
    auto_detect_peaks: bool = True
    manual_peaks: Optional[List[Tuple[int, int]]] = None
    
    # 阶段 5: 退化去模糊
    enable_restoration: bool = False  # 默认按需开启，避免对清晰图产生伪影
    blur_type: str = "defocus"
    defocus_radius: int = 4
    motion_length: int = 12
    motion_angle: float = 0.0
    wiener_k: float = 0.015
    
    # 阶段 6: 锐化与二值化
    enable_binarization: bool = True
    binarize_method: str = "sauvola"  # 'sauvola', 'otsu', 'niblack'
    sauvola_window_size: int = 25
    sauvola_k: float = 0.2
    sharpen: bool = True
    sharpen_strength: float = 0.4
    soft_blend: bool = True
    
    # 输出模式: 'binary' (纯黑白文档) 或 'color' (高清保真彩色文档)
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
            collect_stages: 是否保存每个阶段的中间图（用于报告和答辩展示）
            perform_ocr: 是否由下游 RapidOCR 提取文本
            
        返回:
            包含 final_image, stages, ocr_text, total_elapsed_ms 的字典
        """
        stages: List[StageResult] = []
        start_total = time.perf_counter()
        current_img = raw_image.copy()

        # ==========================================
        # 阶段 (1): 预处理与几何矫正 (透视变换)
        # ==========================================
        t0 = time.perf_counter()
        corners_used = None
        auto_detected = False
        if self.config.enable_geometric:
            current_img, corners_used, auto_detected = rectify_document(
                current_img, manual_corners=self.config.manual_corners
            )
        elapsed_1 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            stages.append(StageResult(
                stage_id=1,
                stage_name="几何矫正与透视变换",
                output_image=current_img.copy(),
                elapsed_ms=round(elapsed_1, 2),
                metadata={"corners": corners_used.tolist() if corners_used is not None else [], "auto_detected": auto_detected}
            ))

        # ==========================================
        # 阶段 (2): 色彩空间解耦与通道分离
        # ==========================================
        t0 = time.perf_counter()
        luminance_channel, aux_chroma = extract_luminance(
            current_img, space=self.config.color_space
        )
        stats = analyze_channel_statistics(luminance_channel)
        elapsed_2 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            stages.append(StageResult(
                stage_id=2,
                stage_name="色彩空间转换与亮度分离",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_2, 2),
                metadata={"color_space": self.config.color_space, "stats": stats}
            ))

        # ==========================================
        # 阶段 (3): 空间域光照校正与阴影去除
        # ==========================================
        t0 = time.perf_counter()
        bg_field = None
        applied_gamma = 1.0
        if self.config.enable_illumination:
            # 仅在分离出的亮度通道上做光照校正
            luminance_channel, bg_field, applied_gamma = enhance_illumination(
                luminance_channel,
                kernel_size=self.config.illumination_kernel_size,
                clip_limit=self.config.clahe_clip_limit,
                apply_gamma=self.config.apply_gamma,
                gamma_val=self.config.manual_gamma
            )
        elapsed_3 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            diag_map = {}
            if bg_field is not None:
                diag_map["estimated_background"] = bg_field
            stages.append(StageResult(
                stage_id=3,
                stage_name="空间域光照校正与去阴影",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_3, 2),
                metadata={"applied_gamma": round(applied_gamma, 3)},
                diagnostic_images=diag_map
            ))

        # ==========================================
        # 阶段 (4): 频率域滤波抑制网纹与摩尔纹
        # ==========================================
        t0 = time.perf_counter()
        detected_notch_peaks = []
        orig_spectrum = None
        filtered_spectrum = None
        if self.config.enable_frequency_filter:
            luminance_channel, orig_spectrum, filtered_spectrum, detected_notch_peaks = apply_frequency_notch_filter(
                luminance_channel,
                notch_points=self.config.manual_peaks,
                d0=self.config.notch_radius,
                auto_detect=self.config.auto_detect_peaks
            )
        else:
            _, orig_spectrum = compute_fft_spectrum(luminance_channel)
            filtered_spectrum = orig_spectrum
        elapsed_4 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            diag_freq = {
                "orig_spectrum": orig_spectrum,
                "filtered_spectrum": filtered_spectrum
            }
            stages.append(StageResult(
                stage_id=4,
                stage_name="频率域滤波抑制网纹",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_4, 2),
                metadata={"detected_notch_peaks": detected_notch_peaks},
                diagnostic_images=diag_freq
            ))

        # ==========================================
        # 阶段 (5): 退化建模与维纳滤波模糊复原
        # ==========================================
        t0 = time.perf_counter()
        psf_vis = None
        if self.config.enable_restoration:
            luminance_channel, psf_vis = restore_blur(
                luminance_channel,
                blur_type=self.config.blur_type,
                radius=self.config.defocus_radius,
                motion_length=self.config.motion_length,
                motion_angle=self.config.motion_angle,
                k=self.config.wiener_k
            )
        elapsed_5 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            diag_rest = {}
            if psf_vis is not None:
                diag_rest["psf_visualization"] = psf_vis
            stages.append(StageResult(
                stage_id=5,
                stage_name="退化建模与维纳滤波去模糊",
                output_image=luminance_channel.copy(),
                elapsed_ms=round(elapsed_5, 2),
                metadata={"blur_type": self.config.blur_type},
                diagnostic_images=diag_rest
            ))

        # ==========================================
        # 阶段 (6): 文字锐化与局部自适应二值化
        # ==========================================
        t0 = time.perf_counter()
        binary_output, sharpened_gray = binarize_document(
            luminance_channel,
            method=self.config.binarize_method,
            window_size=self.config.sauvola_window_size,
            k_sauvola=self.config.sauvola_k,
            sharpen=self.config.sharpen,
            sharpen_strength=self.config.sharpen_strength,
            soft_blend=self.config.soft_blend
        )
        elapsed_6 = (time.perf_counter() - t0) * 1000
        if collect_stages:
            stages.append(StageResult(
                stage_id=6,
                stage_name="文字锐化与自适应二值化",
                output_image=binary_output.copy(),
                elapsed_ms=round(elapsed_6, 2),
                metadata={"method": self.config.binarize_method},
                diagnostic_images={"sharpened_gray": sharpened_gray}
            ))

        # 决定最终输出图像
        if self.config.output_mode == "color":
            final_image = restore_color(sharpened_gray, aux_chroma)
        else:
            # 默认为高清二值化文档
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
            "stages": stages,
            "ocr_text": ocr_text,
            "ocr_boxes": ocr_boxes,
            "total_elapsed_ms": round(total_elapsed, 2)
        }
