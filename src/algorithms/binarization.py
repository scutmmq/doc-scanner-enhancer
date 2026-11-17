"""
文字锐化与局部自适应二值化模块 (Sharpening & Adaptive Binarization)
课题一 核心算法流水线阶段 (6) / 对应课程实验四
纯传统数字图像处理实现：
1. 拉普拉斯二阶微分锐化 (Laplacian Sharpening) 与反锐化掩模高提升滤波 (Unsharp Masking)；
2. Sauvola 局部自适应动态阈值分割（基于盒式积分滤波 O(1) 加速）、Niblack 与 Otsu 全局大津法；
3. 基于连通域面积统计的微米级孤立墨点去噪（保护标点与细笔画不被形态学误腐蚀）；
4. 抗锯齿灰度软融合（消除二值化阶梯锯齿，提升 OCR 识别率与主观视觉舒适度）。
"""

from typing import Tuple, Optional
import numpy as np
import cv2


def sharpen_laplacian(
    gray: np.ndarray,
    strength: float = 0.35,
    kernel_type: str = "4-neighbor"
) -> np.ndarray:
    """
    拉普拉斯高频锐化算子 (Laplacian Sharpening)。
    增强笔画轮廓边缘陡度，改善字迹发虚。
    
    参数:
        gray: 灰度图像 (uint8)
        strength: 锐化权重系数 alpha (典型范围 0.2 - 0.8)
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
        
    lap = cv2.filter2D(gray.astype(np.float32), -1, kernel)
    sharpened = gray.astype(np.float32) + strength * lap
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def unsharp_mask(
    gray: np.ndarray,
    radius: int = 3,
    amount: float = 1.0
) -> np.ndarray:
    """
    反锐化掩模 / 高提升滤波 (Unsharp Masking / High-Boost Filtering)。
    公式: f_sharp = f + amount * (f - f_gaussian_blur)
    """
    blurred = cv2.GaussianBlur(gray, (radius * 2 + 1, radius * 2 + 1), 0)
    high_freq = gray.astype(np.float32) - blurred.astype(np.float32)
    sharpened = gray.astype(np.float32) + amount * high_freq
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def compute_sauvola_threshold_map(
    gray: np.ndarray,
    window_size: int = 25,
    k: float = 0.2,
    r: float = 128.0
) -> np.ndarray:
    """
    计算 Sauvola 局部动态阈值曲面 T(x, y)。
    公式:
        T(x, y) = m(x, y) * [1 + k * (s(x, y) / R - 1)]
    """
    if window_size % 2 == 0:
        window_size += 1
    window_size = max(window_size, 7)

    gray_f = gray.astype(np.float32)
    mean = cv2.boxFilter(gray_f, ddepth=-1, ksize=(window_size, window_size), borderType=cv2.BORDER_REFLECT)
    mean_sq = cv2.boxFilter(gray_f * gray_f, ddepth=-1, ksize=(window_size, window_size), borderType=cv2.BORDER_REFLECT)
    var = np.maximum(mean_sq - mean * mean, 0.0)
    std = np.sqrt(var)

    thresh = mean * (1.0 + k * (std / max(r, 1.0) - 1.0))
    return thresh


def sauvola_threshold(
    gray: np.ndarray,
    window_size: int = 25,
    k: float = 0.2,
    r: float = 128.0
) -> np.ndarray:
    """
    Sauvola 局部自适应动态阈值分割算法。
    针对非均匀光照、笔画退化和墨迹扩散的最佳传统算法。
    """
    thresh = compute_sauvola_threshold_map(gray, window_size=window_size, k=k, r=r)
    binary = np.where(gray.astype(np.float32) >= thresh, 255, 0).astype(np.uint8)
    return binary


def niblack_threshold(
    gray: np.ndarray,
    window_size: int = 25,
    k: float = -0.2
) -> np.ndarray:
    """
    Niblack 局部自适应二值化: T(x, y) = m(x, y) + k * s(x, y)
    """
    if window_size % 2 == 0:
        window_size += 1
        
    gray_f = gray.astype(np.float32)
    mean = cv2.boxFilter(gray_f, -1, (window_size, window_size), borderType=cv2.BORDER_REFLECT)
    mean_sq = cv2.boxFilter(gray_f * gray_f, -1, (window_size, window_size), borderType=cv2.BORDER_REFLECT)
    std = np.sqrt(np.maximum(mean_sq - mean * mean, 0.0))
    
    thresh = mean + k * std
    binary = np.where(gray_f >= thresh, 255, 0).astype(np.uint8)
    return binary


def otsu_threshold(gray: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Otsu 全局大津法最大类间方差阈值分割（作为对比基线）。
    """
    thresh_val, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary, float(thresh_val)


def clean_binary_noise(
    binary: np.ndarray,
    min_speckle_area: int = 3
) -> np.ndarray:
    """
    基于连通域面积统计的去孤立噪点算法：
    精确剔除面积小于 min_speckle_area 的孤立单像素/双像素黑色杂点，
    绝不腐蚀或粘连正常文字笔画（修复传统形态学开闭运算导致的笔画粘连问题）。
    """
    if min_speckle_area <= 1:
        return binary.copy()

    # 反转使黑色文字/噪点变为前景 (255)
    inv = (binary == 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)

    cleaned = binary.copy()
    if num_labels <= 1:
        return cleaned

    areas = stats[:, cv2.CC_STAT_AREA]
    # 找出面积过小的孤立黑点标签（排除背景 label 0）
    tiny_labels = np.where((np.arange(num_labels) > 0) & (areas < min_speckle_area))[0]
    if len(tiny_labels) > 0:
        mask = np.isin(labels, tiny_labels)
        cleaned[mask] = 255

    return cleaned


def binarize_document(
    gray: np.ndarray,
    method: str = "sauvola",
    window_size: int = 25,
    k_sauvola: float = 0.18,
    sharpen: bool = True,
    sharpen_strength: float = 0.35,
    soft_blend: bool = True
) -> Tuple[np.ndarray, np.ndarray]:
    """
    锐化与二值化综合接口。
    
    参数:
        soft_blend: 是否启用类扫描全能王“高清柔化增亮”软融合模式：
                    背景净化为纯净纸白 (250)，文字笔画保留高频抗锯齿灰阶过渡，消除二值化锯齿。
    返回:
        (binary_doc, sharpened_gray)
    """
    # 1. 适度边缘锐化
    if sharpen and sharpen_strength > 0:
        sharp_gray = sharpen_laplacian(gray, strength=sharpen_strength, kernel_type="4-neighbor")
    else:
        sharp_gray = gray.copy()
        
    # 2. 二值化分割
    method_lower = method.lower()
    if method_lower == "sauvola":
        binary = sauvola_threshold(sharp_gray, window_size=window_size, k=k_sauvola)
    elif method_lower == "niblack":
        binary = niblack_threshold(sharp_gray, window_size=window_size)
    elif method_lower == "otsu":
        binary, _ = otsu_threshold(sharp_gray)
    else:
        raise ValueError(f"未知二值化方法: {method}")
        
    # 3. 连通域精确去孤立杂点
    cleaned_binary = clean_binary_noise(binary, min_speckle_area=3)

    # 4. 软融合抗锯齿增强（背景净化为标准纸白 250，前景笔画保留灰度抗锯齿梯度）
    if soft_blend:
        final_doc = np.where(cleaned_binary == 0, np.minimum(sharp_gray, 210), 250).astype(np.uint8)
    else:
        final_doc = cleaned_binary

    return final_doc, sharp_gray
