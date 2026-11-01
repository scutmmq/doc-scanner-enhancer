"""
色彩空间转换与亮度-色度解耦模块 (Color Space Decoupling)
课题一 核心算法流水线阶段 (2)
纯传统数字图像处理实现：RGB 与 HSV / YCbCr 之间的数学转换与通道解耦。
"""

from typing import Tuple, Dict, Any
import numpy as np
import cv2


def split_hsv(image: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    分离 HSV 色彩空间通道。
    H: 色调 (Hue, 0-179)
    S: 饱和度 (Saturation, 0-255)
    V: 明度/亮度 (Value, 0-255)
    """
    if len(image.shape) != 3:
        raise ValueError("输入图像必须为 3 通道彩色图")
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    return h, s, v


def merge_hsv(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
    """
    将 H, S, V 三通道合并并转换回 BGR 彩色空间。
    """
    hsv = cv2.merge([h, s, v])
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)


def split_ycbcr(image: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    分离 YCbCr 色彩空间通道。
    Y: 亮度分量 (Luma)
    Cb: 蓝色色度分量 (Blue-difference chroma)
    Cr: 红色色度分量 (Red-difference chroma)
    """
    if len(image.shape) != 3:
        raise ValueError("输入图像必须为 3 通道彩色图")
    ycbcr = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
    # OpenCV 的 YCrCb 顺序为: Y, Cr, Cb
    y, cr, cb = cv2.split(ycbcr)
    return y, cb, cr


def merge_ycbcr(y: np.ndarray, cb: np.ndarray, cr: np.ndarray) -> np.ndarray:
    """
    将 Y, Cb, Cr 三通道合并并转换回 BGR 彩色空间。
    """
    ycbcr = cv2.merge([y, cr, cb])
    return cv2.cvtColor(ycbcr, cv2.COLOR_YCrCb2BGR)


def extract_luminance(
    image: np.ndarray,
    space: str = "hsv"
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    根据指定色彩空间解耦并提取单通道亮度矩阵。
    
    参数:
        image: BGR 图像
        space: 'hsv' 或 'ycbcr'
    返回:
        luminance: 归一化或标准的单通道灰度/亮度图 (uint8)
        aux_data: 保存的色度元数据，用于后续还原彩色
    """
    if len(image.shape) == 2:
        return image.copy(), {"space": "gray"}
        
    space_lower = space.lower()
    if space_lower == "hsv":
        h, s, v = split_hsv(image)
        return v, {"space": "hsv", "channels": (h, s)}
    elif space_lower in ["ycbcr", "ycrcb"]:
        y, cb, cr = split_ycbcr(image)
        return y, {"space": "ycbcr", "channels": (cb, cr)}
    else:
        raise ValueError(f"不支持的色彩空间: {space}")


def restore_color(
    enhanced_luminance: np.ndarray,
    aux_data: Dict[str, Any]
) -> np.ndarray:
    """
    将增强后的单通道亮度与原色度通道重新融合，生成高清彩色无色偏图像。
    """
    space = aux_data.get("space", "gray")
    if space == "gray":
        return enhanced_luminance.copy()
        
    if space == "hsv":
        h, s = aux_data["channels"]
        return merge_hsv(h, s, enhanced_luminance)
    elif space == "ycbcr":
        cb, cr = aux_data["channels"]
        return merge_ycbcr(enhanced_luminance, cb, cr)
    else:
        raise ValueError(f"未知色彩空间模式: {space}")


def analyze_channel_statistics(image: np.ndarray) -> Dict[str, float]:
    """
    统计图像明度分布特性（平均亮度、动态范围、低照度像素比例等）。
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
        
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    min_val = float(np.min(gray))
    max_val = float(np.max(gray))
    dark_ratio = float(np.sum(gray < 60) / gray.size)
    
    return {
        "mean_intensity": mean_val,
        "std_intensity": std_val,
        "min_intensity": min_val,
        "max_intensity": max_val,
        "dark_pixel_ratio": dark_ratio,
        "contrast_dynamic_range": max_val - min_val
    }
