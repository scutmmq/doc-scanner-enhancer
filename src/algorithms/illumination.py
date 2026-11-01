"""
空间域光照校正与阴影消除模块 (Spatial Illumination Correction)
课题一 核心算法流水线阶段 (3)
纯传统数字图像处理实现：基于形态学闭运算/低频滤波背景照度估计、Retinex 除法归一化模型、CLAHE 局部自适应直方图均衡及自适应伽马校正。
"""

from typing import Tuple, Optional
import numpy as np
import cv2


def estimate_background_illumination(
    gray: np.ndarray,
    kernel_size: int = 41,
    method: str = "morphology"
) -> np.ndarray:
    """
    估算文档的低频背景照度场 (Background Illumination Field)。
    
    参数:
        gray: 单通道灰度图 (uint8)
        kernel_size: 结构元尺寸（须为大于笔画宽度的奇数，默认 41）
        method: 'morphology' (形态学闭运算) 或 'gaussian' (大尺度高斯模糊)
    返回:
        bg: 估算出的平滑低频光照背景图 (uint8)
    """
    # 确保核尺寸为奇数
    if kernel_size % 2 == 0:
        kernel_size += 1
        
    if method == "morphology":
        # 利用大尺寸结构元进行闭运算：膨胀填平深色文字笔画，腐蚀还原整体背景光照
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
        bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
        # 再施加适度轻微平滑消除形态学边界台阶感
        bg = cv2.GaussianBlur(bg, (kernel_size // 2 * 2 + 1, kernel_size // 2 * 2 + 1), 0)
    elif method == "gaussian":
        sigma = kernel_size / 3.0
        bg = cv2.GaussianBlur(gray, (kernel_size, kernel_size), sigma)
    else:
        raise ValueError(f"不支持的背景估计方法: {method}")
        
    return bg


def remove_shadow_by_division(
    gray: np.ndarray,
    bg: np.ndarray,
    target_mean: float = 230.0
) -> np.ndarray:
    """
    基于 Retinex 反射模型的除法归一化去除阴影。
    成像模型: I(x, y) = R(x, y) * L(x, y) -> R(x, y) = I(x, y) / L(x, y)
    
    参数:
        gray: 原图 (uint8)
        bg: 估计的背景光照 (uint8)
        target_mean: 纸面目标白度基准均值
    返回:
        normalized: 消除阴影、白度平坦的文档图 (uint8)
    """
    gray_f = gray.astype(np.float32)
    bg_f = np.maximum(bg.astype(np.float32), 1.0)
    
    # 逐像素除法计算反射率分量
    ratio = gray_f / bg_f
    
    # 动态缩放到目标纸面白度
    result = ratio * target_mean
    result = np.clip(result, 0, 255).astype(np.uint8)
    return result


def apply_clahe(
    gray: np.ndarray,
    clip_limit: float = 2.0,
    tile_grid_size: Tuple[int, int] = (8, 8)
) -> np.ndarray:
    """
    对比度受限自适应直方图均衡化 (CLAHE)。
    改善局部对比度，同时严格限制噪声过度放大。
    """
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    return clahe.apply(gray)


def adaptive_gamma_correction(
    gray: np.ndarray,
    gamma: Optional[float] = None
) -> Tuple[np.ndarray, float]:
    """
    自适应伽马校正:
    s = c * r^gamma
    
    若未指定 gamma，则根据图像均值自适应计算:
    gamma = ln(0.5) / ln(mean / 255.0)
    """
    norm = gray.astype(np.float32) / 255.0
    
    if gamma is None:
        mean_val = np.mean(norm)
        # 防止过小或过大发散
        mean_val = np.clip(mean_val, 0.05, 0.95)
        gamma = float(np.log(0.5) / np.log(mean_val))
        # 限制合理的 gamma 调节范围 [0.4, 2.5]
        gamma = np.clip(gamma, 0.4, 2.5)
        
    corrected = np.power(norm, gamma) * 255.0
    return np.clip(corrected, 0, 255).astype(np.uint8), gamma


def linear_contrast_stretch(
    gray: np.ndarray,
    p_low: float = 1.0,
    p_high: float = 99.0
) -> np.ndarray:
    """
    基于百分位截断的对比度线性拉伸 (Percentile Contrast Stretch)。
    """
    low_val, high_val = np.percentile(gray, (p_low, p_high))
    if high_val <= low_val:
        return gray.copy()
        
    stretched = (gray.astype(np.float32) - low_val) * (255.0 / (high_val - low_val))
    return np.clip(stretched, 0, 255).astype(np.uint8)


def enhance_illumination(
    image: np.ndarray,
    kernel_size: int = 45,
    clip_limit: float = 2.0,
    apply_gamma: bool = True,
    gamma_val: Optional[float] = None
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    空间域光照校正与去阴影整合流水线。
    
    返回:
        (enhanced_img, background_field, applied_gamma)
    """
    is_color = (len(image.shape) == 3)
    if is_color:
        # 在 HSV 空间提取 V 通道处理，避免彩色偏色
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        channel_to_process = v
    else:
        channel_to_process = image.copy()
        
    # 1. 估计低频光照场
    bg = estimate_background_illumination(channel_to_process, kernel_size=kernel_size)
    
    # 2. 除法去阴影
    divided = remove_shadow_by_division(channel_to_process, bg)
    
    # 3. CLAHE 局部直方图均衡
    equalized = apply_clahe(divided, clip_limit=clip_limit)
    
    # 4. 自适应伽马校正
    final_gamma = 1.0
    if apply_gamma:
        enhanced_v, final_gamma = adaptive_gamma_correction(equalized, gamma=gamma_val)
    else:
        enhanced_v = equalized
        
    # 5. 重建输出
    if is_color:
        enhanced_img = cv2.cvtColor(cv2.merge([h, s, enhanced_v]), cv2.COLOR_HSV2BGR)
    else:
        enhanced_img = enhanced_v
        
    return enhanced_img, bg, final_gamma
