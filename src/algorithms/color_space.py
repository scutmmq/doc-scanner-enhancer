"""
色彩空间转换、亮度-色度解耦与彩色校正模块 (Color Space Decoupling & White Balance)
课题一 核心算法流水线阶段 (2)
纯传统数字图像处理实现：
1. RGB 与 HSV / YCbCr 之间的数学转换与通道分离；
2. 彩色偏色校正（基于灰度世界假设 Gray World 与完美反射白纸基准 White Patch Retinex）；
3. 增强后亮度与色度融合还原及三通道分量可视化拼图。
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


def white_balance_gray_world(image: np.ndarray) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    基于灰度世界假设 (Gray World Assumption) 的自动白平衡彩色校正。
    数学模型:
        假设自然或文档场景的三通道均值趋于同一灰度常数 K = (B_bar + G_bar + R_bar) / 3，
        各通道增益 G_c = K / C_bar。
    """
    if len(image.shape) != 3:
        return image.copy(), {"b_gain": 1.0, "g_gain": 1.0, "r_gain": 1.0}

    img_f = image.astype(np.float32)
    b_mean = max(float(np.mean(img_f[:, :, 0])), 1.0)
    g_mean = max(float(np.mean(img_f[:, :, 1])), 1.0)
    r_mean = max(float(np.mean(img_f[:, :, 2])), 1.0)

    k_gray = (b_mean + g_mean + r_mean) / 3.0
    b_gain = float(np.clip(k_gray / b_mean, 0.5, 2.2))
    g_gain = float(np.clip(k_gray / g_mean, 0.5, 2.2))
    r_gain = float(np.clip(k_gray / r_mean, 0.5, 2.2))

    balanced = np.empty_like(img_f)
    balanced[:, :, 0] = img_f[:, :, 0] * b_gain
    balanced[:, :, 1] = img_f[:, :, 1] * g_gain
    balanced[:, :, 2] = img_f[:, :, 2] * r_gain

    return np.clip(balanced, 0, 255).astype(np.uint8), {
        "b_gain": round(b_gain, 3),
        "g_gain": round(g_gain, 3),
        "r_gain": round(r_gain, 3),
    }


def white_balance_paper_white(
    image: np.ndarray,
    percentile: float = 95.0
) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    基于完美反射体 / 纸面白点基准 (White Patch Retinex) 的文档偏色消除算法。
    针对暖黄台灯、冷白荧光灯下拍摄的文档照片，提取各通道高百分位（代表无字纸面基底）对齐至中性白。
    """
    if len(image.shape) != 3:
        return image.copy(), {"b_gain": 1.0, "g_gain": 1.0, "r_gain": 1.0}

    img_f = image.astype(np.float32)
    b_p = max(float(np.percentile(img_f[:, :, 0], percentile)), 10.0)
    g_p = max(float(np.percentile(img_f[:, :, 1], percentile)), 10.0)
    r_p = max(float(np.percentile(img_f[:, :, 2], percentile)), 10.0)

    target_white = max(b_p, g_p, r_p, 240.0)
    b_gain = float(np.clip(target_white / b_p, 0.6, 2.5))
    g_gain = float(np.clip(target_white / g_p, 0.6, 2.5))
    r_gain = float(np.clip(target_white / r_p, 0.6, 2.5))

    balanced = np.empty_like(img_f)
    balanced[:, :, 0] = img_f[:, :, 0] * b_gain
    balanced[:, :, 1] = img_f[:, :, 1] * g_gain
    balanced[:, :, 2] = img_f[:, :, 2] * r_gain

    return np.clip(balanced, 0, 255).astype(np.uint8), {
        "b_gain": round(b_gain, 3),
        "g_gain": round(g_gain, 3),
        "r_gain": round(r_gain, 3),
    }


def correct_color_cast(
    image: np.ndarray,
    method: str = "paper_white"
) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    彩色偏色校正统一接口。
    
    参数:
        image: BGR 彩色图像
        method: 'paper_white' (纸面白点校正), 'gray_world' (灰度世界), 或 'none'
    """
    if len(image.shape) != 3 or method == "none":
        return image.copy(), {"b_gain": 1.0, "g_gain": 1.0, "r_gain": 1.0}

    if method == "gray_world":
        return white_balance_gray_world(image)
    return white_balance_paper_white(image)


def extract_luminance(
    image: np.ndarray,
    space: str = "hsv",
    apply_white_balance: bool = True
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    根据指定色彩空间解耦并提取单通道亮度矩阵。
    
    参数:
        image: BGR 图像
        space: 'hsv' 或 'ycbcr'
        apply_white_balance: 是否在解耦前执行彩色偏色校正
    返回:
        luminance: 归一化或标准的单通道灰度/亮度图 (uint8)
        aux_data: 保存的色度元数据，用于后续还原彩色
    """
    if len(image.shape) == 2:
        return image.copy(), {"space": "gray", "wb_gains": {"b_gain": 1.0, "g_gain": 1.0, "r_gain": 1.0}}

    wb_img = image
    wb_gains = {"b_gain": 1.0, "g_gain": 1.0, "r_gain": 1.0}
    if apply_white_balance:
        wb_img, wb_gains = correct_color_cast(image, method="paper_white")
        
    space_lower = space.lower()
    if space_lower == "hsv":
        h, s, v = split_hsv(wb_img)
        return v, {"space": "hsv", "channels": (h, s), "wb_gains": wb_gains, "wb_image": wb_img}
    elif space_lower in ["ycbcr", "ycrcb"]:
        y, cb, cr = split_ycbcr(wb_img)
        return y, {"space": "ycbcr", "channels": (cb, cr), "wb_gains": wb_gains, "wb_image": wb_img}
    else:
        raise ValueError(f"不支持的色彩空间: {space}")


def restore_color(
    enhanced_luminance: np.ndarray,
    aux_data: Dict[str, Any],
    clean_paper_chroma: bool = False
) -> np.ndarray:
    """
    将增强后的单通道亮度与原色度通道重新融合，生成高清彩色无色偏图像。
    若开启 clean_paper_chroma，则自动将高亮白纸背景区域的残余杂色饱和度压零，保留红章/彩字。
    """
    space = aux_data.get("space", "gray")
    if space == "gray":
        return enhanced_luminance.copy()
        
    if space == "hsv":
        h, s = aux_data["channels"]
        if clean_paper_chroma:
            # 纸面背景净化为中性纯白纸底 (S=0, V=250)
            s_clean = s.copy()
            v_clean = enhanced_luminance.copy()
            paper_mask = (enhanced_luminance >= 200)
            s_clean[paper_mask] = 0
            v_clean[paper_mask] = 250
            return merge_hsv(h, s_clean, v_clean)
        return merge_hsv(h, s, enhanced_luminance)
    elif space == "ycbcr":
        cb, cr = aux_data["channels"]
        if clean_paper_chroma:
            cb_clean = cb.astype(np.float32)
            cr_clean = cr.astype(np.float32)
            y_clean = enhanced_luminance.copy()
            dist_chroma = np.hypot(cb_clean - 128.0, cr_clean - 128.0)
            paper_mask = (enhanced_luminance > 205) & (dist_chroma < 32.0)
            cb_clean[paper_mask] = 128.0
            cr_clean[paper_mask] = 128.0
            y_clean[paper_mask] = 250
            return merge_ycbcr(
                y_clean,
                np.clip(cb_clean, 0, 255).astype(np.uint8),
                np.clip(cr_clean, 0, 255).astype(np.uint8)
            )
        return merge_ycbcr(enhanced_luminance, cb, cr)
    else:
        raise ValueError(f"未知色彩空间模式: {space}")


def render_channel_montage(image: np.ndarray, space: str = "hsv") -> np.ndarray:
    """
    生成三通道解耦可视化拼图（用于报告插图与前端诊断：展示 H/S/V 或 Y/Cb/Cr 三个独立分量）。
    """
    if len(image.shape) == 2:
        return image.copy()

    h_img, w_img = image.shape[:2]
    target_h = 320
    target_w = max(120, int(w_img * (target_h / max(h_img, 1))))

    space_lower = space.lower()
    if space_lower == "hsv":
        c1, c2, c3 = split_hsv(image)
        # H 范围 0-179 映射到 0-255 便于观察
        c1_vis = cv2.normalize(c1, None, 0, 255, cv2.NORM_MINMAX)
        c2_vis, c3_vis = c2, c3
        labels = ["H (Hue)", "S (Saturation)", "V (Luminance)"]
    else:
        c1_vis, c2_vis, c3_vis = split_ycbcr(image)
        labels = ["Y (Luma)", "Cb (Chroma Blue)", "Cr (Chroma Red)"]

    panels = []
    for ch, label in zip((c1_vis, c2_vis, c3_vis), labels):
        resized = cv2.resize(ch, (target_w, target_h), interpolation=cv2.INTER_AREA)
        panel = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)
        cv2.rectangle(panel, (0, 0), (target_w, 28), (20, 26, 38), -1)
        cv2.putText(panel, label, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (235, 240, 250), 1, cv2.LINE_AA)
        panels.append(panel)

    sep = np.full((target_h, 6, 3), 35, dtype=np.uint8)
    return np.hstack([panels[0], sep, panels[1], sep, panels[2]])


def analyze_channel_statistics(image: np.ndarray) -> Dict[str, float]:
    """
    统计图像明度与色偏分布特性（平均亮度、动态范围、低照度像素比例、色偏指数等）。
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        ycbcr = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb).astype(np.float32)
        chroma_shift = float(np.hypot(np.mean(ycbcr[:, :, 1] - 128.0), np.mean(ycbcr[:, :, 2] - 128.0)))
    else:
        gray = image
        chroma_shift = 0.0
        
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    min_val = float(np.min(gray))
    max_val = float(np.max(gray))
    dark_ratio = float(np.sum(gray < 60) / gray.size)
    
    return {
        "mean_intensity": round(mean_val, 2),
        "std_intensity": round(std_val, 2),
        "min_intensity": min_val,
        "max_intensity": max_val,
        "dark_pixel_ratio": round(dark_ratio, 4),
        "contrast_dynamic_range": max_val - min_val,
        "chroma_cast_index": round(chroma_shift, 2)
    }
