"""
空间域去噪、光照校正与阴影消除模块 (Spatial Denoising & Illumination Correction)
课题一 核心算法流水线阶段 (3)
纯传统数字图像处理实现：
1. 空域统计排序/保边去噪（中值滤波去椒盐噪声、双边/高斯滤波去高斯噪声）；
2. 多尺度形态学闭运算 + 高斯低频滤波估算背景照度场 (Background Illumination Field)；
3. 基于 Retinex 反射模型的除法归一化去除阴影；
4. 对比度线性拉伸 (Contrast Stretching)、全局直方图均衡 (HE)、限制对比度局部均衡 (CLAHE) 与文档自适应伽马校正；
5. 增强前后灰度直方图对比图绘制。
"""

from typing import Tuple, Optional
import numpy as np
import cv2


def spatial_denoise(
    gray: np.ndarray,
    method: str = "none",
    kernel_size: int = 3
) -> np.ndarray:
    """
    空间域去噪算子（对应课程实验三：去除椒盐噪声与高斯随机噪声）。
    
    参数:
        gray: 输入单通道图像 (uint8)
        method: 'none' | 'median' (中值滤波，克制椒盐噪声) | 'bilateral' (双边保边滤波) | 'gaussian' (高斯平滑)
        kernel_size: 滤波核尺寸 (奇数，默认 3)
    """
    if method == "none" or kernel_size <= 1:
        return gray.copy()

    if kernel_size % 2 == 0:
        kernel_size += 1

    method_lower = method.lower()
    if method_lower == "median":
        return cv2.medianBlur(gray, kernel_size)
    elif method_lower == "bilateral":
        return cv2.bilateralFilter(gray, d=max(kernel_size, 5), sigmaColor=35, sigmaSpace=35)
    elif method_lower == "gaussian":
        return cv2.GaussianBlur(gray, (kernel_size, kernel_size), 0)
    else:
        return gray.copy()


def estimate_background_illumination(
    gray: np.ndarray,
    kernel_size: int = 41,
    method: str = "morphology"
) -> np.ndarray:
    """
    估算文档的低频背景照度场 (Background Illumination Field)。
    
    改进算法原理:
        传统单一超大矩形核闭运算在文字穿过阴影边界时会产生锯齿状光环伪影。
        本实现采用“两步解耦法”：
        1. 用适度尺度的椭圆形结构元膨胀/闭运算抹除细小深色文字笔画（保留真实阴影边界曲率）；
        2. 通过下采样大尺度高斯低通平滑提取纯净、连续、无锯齿的低频光照场 I_bg(x, y)。
    
    参数:
        gray: 单通道灰度图 (uint8)
        kernel_size: 背景平滑尺度（奇数，默认 41）
        method: 'morphology' (形态学抹字 + 低频平滑) 或 'gaussian' (纯大尺度高斯模糊)
    返回:
        bg: 估算出的平滑低频光照背景图 (uint8)
    """
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel_size = max(kernel_size, 15)

    h, w = gray.shape[:2]

    if method == "morphology":
        # 使用大于文字笔画宽度(3~10px)但小于阴影渐变宽度的椭圆形结构元素执行形态学闭运算 (Closing = Dilate -> Erode)
        # 根据数学形态学原理，闭运算可 100% 填平窄暗谷（文字笔画），同时在单调阴影斜坡上保持零位移恒等，彻底消除阴影边界黑环！
        stroke_k = min(max(17, (kernel_size // 2) | 1), 23)
        if stroke_k % 2 == 0:
            stroke_k += 1
        ellipse_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (stroke_k, stroke_k))
        closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, ellipse_kernel)
        # 配合轻度中值与小核高斯滤波平滑结构元素边缘折面，不拉宽阴影过渡带
        smoothed = cv2.medianBlur(closed, 7)
        bg = cv2.GaussianBlur(smoothed, (9, 9), 0)
    elif method == "gaussian":
        sigma = kernel_size / 3.0
        bg = cv2.GaussianBlur(gray, (kernel_size, kernel_size), sigma)
    else:
        raise ValueError(f"不支持的背景估计方法: {method}")
        
    return bg


def remove_shadow_by_division(
    gray: np.ndarray,
    bg: np.ndarray,
    target_mean: float = 242.0
) -> np.ndarray:
    """
    基于 Retinex 反射模型的除法归一化去除阴影。
    成像模型: I(x, y) = R(x, y) * L(x, y) -> R(x, y) = I(x, y) / L(x, y)
    
    参数:
        gray: 原图 (uint8)
        bg: 估计的背景光照 (uint8)
        target_mean: 纸面目标白度基准均值 (默认 242.0)
    返回:
        normalized: 消除阴影、白度平坦的文档图 (uint8)
    """
    gray_f = gray.astype(np.float32)
    # 保证分母不会过小导致暗部噪点爆炸，同时确保分子不大于分母背景
    bg_f = np.maximum(bg.astype(np.float32), 6.0)
    bg_f = np.maximum(bg_f, gray_f)
    
    # 逐像素除法计算反射率分量 R(x, y) in [0, 1]
    ratio = gray_f / bg_f
    
    # 映射至目标白纸亮度，并对高反射率纸面做柔和提亮
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
    改善局部对比度，同时限制噪声过度放大。
    """
    clahe = cv2.createCLAHE(clipLimit=max(0.1, float(clip_limit)), tileGridSize=tile_grid_size)
    return clahe.apply(gray)


def apply_global_hist_eq(gray: np.ndarray) -> np.ndarray:
    """
    全局直方图均衡化 (Global Histogram Equalization，对应任务书与实验一要求)。
    """
    return cv2.equalizeHist(gray)


def linear_contrast_stretch(
    gray: np.ndarray,
    p_low: float = 1.0,
    p_high: float = 18.0
) -> np.ndarray:
    """
    基于百分位截断的分段线性对比度拉伸 (Percentile Contrast Stretching)。
    对于文档图像，90% 以上像素均为纸面背景，将 p_high (上限 220 的纸面背景底限) 拉伸至 250 纯白，
    将 p_low (如 1% 分位数的深色墨迹) 拉伸至 22 深黑，从而彻底抹平背景残余纹波与高斯底噪并显著提升文字对比度。
    """
    low_val, high_val = np.percentile(gray, (p_low, p_high))
    high_val = min(float(high_val), 220.0)
    if high_val - low_val < 10.0:
        return gray.copy()
        
    stretched = (gray.astype(np.float32) - low_val) * (228.0 / (high_val - low_val)) + 22.0
    return np.clip(stretched, 0, 250).astype(np.uint8)


def adaptive_gamma_correction(
    gray: np.ndarray,
    gamma: Optional[float] = None,
    target_white_mean: float = 0.88
) -> Tuple[np.ndarray, float]:
    """
    文档自适应伽马校正:
    s = r^gamma
    
    若未指定 gamma，则基于文档图像高白度先验 (target_white_mean ≈ 0.88) 自适应计算:
    gamma = ln(target_white_mean) / ln(mean / 255.0)
    避免传统自然图像中灰假设 (0.5) 将白底文档错误压暗。
    """
    norm = gray.astype(np.float32) / 255.0
    
    if gamma is None:
        mean_val = float(np.mean(norm))
        mean_val = float(np.clip(mean_val, 0.10, 0.96))
        gamma = float(np.log(target_white_mean) / np.log(mean_val))
        # 限制合理的自动 gamma 调节范围 [0.5, 1.5]
        gamma = float(np.clip(gamma, 0.5, 1.5))
    else:
        gamma = float(np.clip(gamma, 0.2, 3.0))
        
    corrected = np.power(norm, gamma) * 255.0
    return np.clip(corrected, 0, 255).astype(np.uint8), round(float(gamma), 3)


def render_histogram_comparison(before_gray: np.ndarray, after_gray: np.ndarray) -> np.ndarray:
    """
    绘制处理前 vs 处理后灰度直方图对比可视化图（用于课程报告插图与前端诊断展示）。
    """
    w, h = 520, 220
    canvas = np.full((h, w, 3), 18, dtype=np.uint8)

    # 绘制网格线
    for y_line in range(40, h - 25, 40):
        cv2.line(canvas, (30, y_line), (w - 20, y_line), (35, 42, 56), 1)
    for x_line in range(30, w - 15, 60):
        cv2.line(canvas, (x_line, 30), (x_line, h - 25), (35, 42, 56), 1)

    hist_b = cv2.calcHist([before_gray], [0], None, [256], [0, 256]).ravel()
    hist_a = cv2.calcHist([after_gray], [0], None, [256], [0, 256]).ravel()

    # 对数平滑压缩峰值以展示暗部与亮部完整分布
    hist_b = np.log1p(hist_b)
    hist_a = np.log1p(hist_a)

    max_val = max(float(np.max(hist_b)), float(np.max(hist_a)), 1.0)
    plot_w = w - 50
    plot_h = h - 60

    pts_b = []
    pts_a = []
    for i in range(256):
        px = int(30 + (i / 255.0) * plot_w)
        py_b = int(h - 25 - (hist_b[i] / max_val) * plot_h)
        py_a = int(h - 25 - (hist_a[i] / max_val) * plot_h)
        pts_b.append([px, py_b])
        pts_a.append([px, py_a])

    cv2.polylines(canvas, [np.array(pts_b, dtype=np.int32)], False, (110, 130, 165), 1, cv2.LINE_AA)
    cv2.polylines(canvas, [np.array(pts_a, dtype=np.int32)], False, (255, 165, 50), 2, cv2.LINE_AA)

    cv2.putText(canvas, "Grayscale Histogram (Log Scale): Raw [Gray] vs Enhanced [Blue]", (16, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (220, 230, 242), 1, cv2.LINE_AA)
    cv2.putText(canvas, "0 (Black)", (25, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (150, 160, 175), 1, cv2.LINE_AA)
    cv2.putText(canvas, "128", (int(30 + 0.5 * plot_w) - 10, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (150, 160, 175), 1, cv2.LINE_AA)
    cv2.putText(canvas, "255 (White)", (w - 85, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (150, 160, 175), 1, cv2.LINE_AA)

    return canvas


def enhance_illumination(
    image: np.ndarray,
    kernel_size: int = 45,
    clip_limit: float = 2.0,
    apply_gamma: bool = True,
    gamma_val: Optional[float] = None,
    contrast_method: str = "stretch_clahe",
    denoise_method: str = "none",
    denoise_ksize: int = 3
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    空间域去噪、光照校正与去阴影整合流水线。
    
    参数:
        image: 单通道亮度图或 3 通道彩色图
        kernel_size: 背景形态学+高斯估计尺度
        clip_limit: CLAHE 限制阈值
        apply_gamma: 是否启用伽马校正
        gamma_val: 手动指定的伽马值（None 则自动估算）
        contrast_method:
            - 'stretch_clahe' (默认推荐：线性对比度拉伸 + 局部细节柔性 CLAHE 融合)
            - 'stretch' (纯百分位对比度拉伸)
            - 'clahe' (标准 CLAHE)
            - 'hist_eq' (全局直方图均衡化)
            - 'none' (仅做 Retinex 除法去阴影)
        denoise_method: 'none' | 'median' | 'bilateral' | 'gaussian'
        denoise_ksize: 去噪核尺寸
    返回:
        (enhanced_img, background_field, applied_gamma)
    """
    is_color = (len(image.shape) == 3)
    if is_color:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        channel_to_process = v
    else:
        channel_to_process = image.copy()

    # 0. 可选空域去噪（去除椒盐噪声或传感器热噪）
    if denoise_method != "none":
        channel_to_process = spatial_denoise(channel_to_process, method=denoise_method, kernel_size=denoise_ksize)
        
    # 1. 估计平滑无锯齿的低频光照场
    bg = estimate_background_illumination(channel_to_process, kernel_size=kernel_size)
    
    # 2. Retinex 除法去阴影
    divided = remove_shadow_by_division(channel_to_process, bg, target_mean=244.0)
    
    # 3. 对比度与直方图增强
    c_method = contrast_method.lower()
    if c_method == "stretch_clahe":
        stretched = linear_contrast_stretch(divided, p_low=1.0, p_high=18.0)
        clahe_img = apply_clahe(stretched, clip_limit=min(clip_limit, 2.0))
        # 仅在深色文字笔画内部及边缘融合 CLAHE，确保 >=240 的纸面背景 100% 纯净无噪斑
        alpha = np.clip((235.0 - stretched.astype(np.float32)) / 150.0, 0.0, 0.5)
        equalized = np.clip(
            stretched.astype(np.float32) * (1.0 - alpha) + clahe_img.astype(np.float32) * alpha,
            0, 255
        ).astype(np.uint8)
    elif c_method == "stretch":
        equalized = linear_contrast_stretch(divided, p_low=1.0, p_high=18.0)
    elif c_method == "clahe":
        equalized = apply_clahe(divided, clip_limit=clip_limit)
    elif c_method == "hist_eq":
        equalized = apply_global_hist_eq(divided)
    else:
        equalized = divided
    
    # 4. 自适应或手动伽马校正
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
