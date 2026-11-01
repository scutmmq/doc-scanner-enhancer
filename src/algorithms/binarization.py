"""
文字锐化与局部自适应二值化模块 (Sharpening & Adaptive Binarization)
课题一 核心算法流水线阶段 (6)
纯传统数字图像处理实现：拉普拉斯高提升锐化边缘、Sauvola 局部动态阈值分割（积分图/快速盒式滤波 $O(1)$ 加速）、Niblack 与 Otsu 对比算法。
"""

from typing import Tuple, Optional
import numpy as np
import cv2


def sharpen_laplacian(
    gray: np.ndarray,
    strength: float = 0.5,
    kernel_type: str = "8-neighbor"
) -> np.ndarray:
    """
    拉普拉斯高频锐化算子 (Laplacian Sharpening)。
    增强笔画轮廓边缘陡度，改善字迹发虚。
    
    参数:
        gray: 灰度图像 (uint8)
        strength: 锐化权重系数 alpha (典型范围 0.2 - 1.0)
        kernel_type: '4-neighbor' 或 '8-neighbor'
    """
    if kernel_type == "4-neighbor":
        kernel = np.array([
            [0, -1, 0],
            [-1, 4, -1],
            [0, -1, 0]
        ], dtype=np.float32)
    else:
        kernel = np.array([
            [-1, -1, -1],
            [-1, 8, -1],
            [-1, -1, -1]
        ], dtype=np.float32)
        
    # 计算二阶导数响应
    lap = cv2.filter2D(gray.astype(np.float32), -1, kernel)
    
    # 原图叠加上高频边缘分量
    sharpened = gray.astype(np.float32) + strength * lap
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def unsharp_mask(
    gray: np.ndarray,
    radius: int = 3,
    amount: float = 1.0
) -> np.ndarray:
    """
    反锐化掩模 (Unsharp Masking / High-Boost Filtering)。
    公式: f_sharp = f + amount * (f - f_gaussian_blur)
    """
    blurred = cv2.GaussianBlur(gray, (radius * 2 + 1, radius * 2 + 1), 0)
    high_freq = gray.astype(np.float32) - blurred.astype(np.float32)
    sharpened = gray.astype(np.float32) + amount * high_freq
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def sauvola_threshold(
    gray: np.ndarray,
    window_size: int = 25,
    k: float = 0.2,
    r: float = 128.0
) -> np.ndarray:
    """
    Sauvola 局部自适应动态阈值分割算法。
    针对非均匀光照、笔画退化和墨迹扩散的最佳传统算法。
    
    公式:
        T(x, y) = m(x, y) * [1 + k * (s(x, y) / R - 1)]
        其中 m 为局部均值，s 为局部标准差。
        
    实现优化:
        采用 cv2.boxFilter 盒式均值滤波进行快速 O(1) 局部统计计算，毫秒级响应。
    """
    if window_size % 2 == 0:
        window_size += 1
        
    gray_f = gray.astype(np.float32)
    
    # 局部均值 m(x, y)
    mean = cv2.boxFilter(gray_f, ddepth=-1, ksize=(window_size, window_size), borderType=cv2.BORDER_REFLECT)
    
    # 局部平方均值 E[x^2]
    mean_sq = cv2.boxFilter(gray_f * gray_f, ddepth=-1, ksize=(window_size, window_size), borderType=cv2.BORDER_REFLECT)
    
    # 方差 Var = E[x^2] - (E[x])^2
    var = mean_sq - mean * mean
    # 避免浮点舍入引起的微小负值
    var = np.maximum(var, 0.0)
    std = np.sqrt(var)
    
    # Sauvola 动态阈值平面 T(x, y)
    thresh = mean * (1.0 + k * (std / r - 1.0))
    
    # 二值化（前景文字为 0 黑，背景为 255 白）
    binary = np.where(gray_f >= thresh, 255, 0).astype(np.uint8)
    return binary


def niblack_threshold(
    gray: np.ndarray,
    window_size: int = 25,
    k: float = -0.2
) -> np.ndarray:
    """
    Niblack 局部自适应二值化: T = m + k * s
    """
    if window_size % 2 == 0:
        window_size += 1
        
    gray_f = gray.astype(np.float32)
    mean = cv2.boxFilter(gray_f, -1, (window_size, window_size))
    mean_sq = cv2.boxFilter(gray_f * gray_f, -1, (window_size, window_size))
    std = np.sqrt(np.maximum(mean_sq - mean * mean, 0.0))
    
    thresh = mean + k * std
    binary = np.where(gray_f >= thresh, 255, 0).astype(np.uint8)
    return binary


def otsu_threshold(gray: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Otsu 全局大津法阈值分割（作为对比基线）。
    """
    thresh_val, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary, float(thresh_val)


def clean_binary_noise(
    binary: np.ndarray,
    min_speckle_size: int = 2
) -> np.ndarray:
    """
    形态学校正去噪：消除页面边缘微小椒盐杂点与毛刺。
    """
    if min_speckle_size <= 1:
        return binary
        
    # 开运算消除独立黑噪点
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_speckle_size, min_speckle_size))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    return cleaned


def binarize_document(
    gray: np.ndarray,
    method: str = "sauvola",
    window_size: int = 25,
    k_sauvola: float = 0.2,
    sharpen: bool = True,
    sharpen_strength: float = 0.4,
    soft_blend: bool = True
) -> Tuple[np.ndarray, np.ndarray]:
    """
    锐化与二值化综合接口。
    
    参数:
        soft_blend: 是否启用类扫描全能王“魔法增亮”软融合模式（背景强制漂白为 255，笔画保留高频抗锯齿灰阶，显著提升 OCR 精度）。
    返回:
        (binary_doc, sharpened_gray)
    """
    # 1. 锐化
    if sharpen:
        sharp_gray = sharpen_laplacian(gray, strength=sharpen_strength)
    else:
        sharp_gray = gray.copy()
        
    # 2. 二值化
    method_lower = method.lower()
    if method_lower == "sauvola":
        binary = sauvola_threshold(sharp_gray, window_size=window_size, k=k_sauvola)
    elif method_lower == "niblack":
        binary = niblack_threshold(sharp_gray, window_size=window_size)
    elif method_lower == "otsu":
        binary, _ = otsu_threshold(sharp_gray)
    else:
        raise ValueError(f"未知二值化方法: {method}")
        
    # 3. 去孤立噪点
    cleaned_binary = clean_binary_noise(binary, min_speckle_size=2)

    # 4. 软融合（保护笔画灰度抗锯齿，彻底消除锯齿和断划）
    if soft_blend:
        final_doc = np.where(cleaned_binary == 0, sharp_gray, 255).astype(np.uint8)
    else:
        final_doc = cleaned_binary

    return final_doc, sharp_gray
