"""
纯传统信号驱动的文档退化自动诊断引擎 (Traditional Signal-Based Document Auto-Diagnosis)
华南理工大学《数字图像处理》课程设计 · 课题一

严格基于经典数字图像处理与信号统计模型（零深度学习依赖），自动量化分析手机实拍文档的 7 类核心退化与特征：
1. 几何透视畸变 (Skew / Perspective)      — Canny + 凸包四边形边界检测
2. 椒盐脉冲噪声 (Impulse Noise)           — 8-邻域孤立极值统计排序检测
3. 灯光偏色 (Color Cast)                  — 纸面高分位 RGB 通道失衡与 YCrCb 色度偏移指数
4. 屏幕摩尔纹/周期网纹 (Moire Pattern)    — 2D-FFT 频谱方向脊线感知孤立亮峰检测
5. 非均匀光照与手影 (Shadow Gradient)     — 形态学闭运算低频光照背景场 P95-P10 动态跨度
6. 光学散焦 / 手抖运动模糊 (Blur)          — Crete 再模糊边缘梯度衰减率 + Sobel 方向各向异性
7. 红章与彩色批注 (Red Seal / Annotation) — 纸白校正后 HSV 高饱和色度像素占比检测

并据此输出面向普通用户可解释的诊断标签与对应传统算法最优推荐参数集。
"""

import time
from typing import Dict, Any, List, Optional
import numpy as np
import cv2

from src.algorithms.geometric import detect_document_corners, perspective_transform
from src.algorithms.color_space import extract_luminance, analyze_channel_statistics, correct_color_cast
from src.algorithms.illumination import estimate_background_illumination, remove_shadow_by_division
from src.algorithms.frequency import compute_fft_spectrum, detect_periodic_peaks, apply_frequency_notch_filter


def _compute_impulse_noise_ratio(gray: np.ndarray) -> float:
    """
    基于 8-邻域孤立极值差检测椒盐脉冲噪声比例。
    原理：连续文字笔画至少与相邻笔画像素灰度接近，周期正弦网纹沿波脊也连续；
    只有孤立的椒盐单像素脉冲满足严格低于 8 邻域最小值或高于最大值显著阈值。
    """
    g = gray.astype(np.int16)
    padded = np.pad(g, 1, mode="edge")
    h, w = g.shape
    neighbors = np.stack(
        [
            padded[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            if not (dy == 0 and dx == 0)
        ],
        axis=0,
    )
    nb_min = np.min(neighbors, axis=0)
    nb_max = np.max(neighbors, axis=0)
    impulse_mask = (g < (nb_min - 35)) | (g > (nb_max + 35))
    return float(np.mean(impulse_mask))


def _detect_color_stamps(image_bgr: np.ndarray) -> Dict[str, Any]:
    """
    在自动纸面白平衡后，基于 HSV 色相/饱和度与 RGB 通道分离度检测是否存在红章、蓝字批注或彩色高亮标记。
    """
    if len(image_bgr.shape) != 3:
        return {"detected": False, "ratio": 0.0, "red_ratio": 0.0, "blue_ratio": 0.0}

    wb_img, _ = correct_color_cast(image_bgr, method="paper_white")
    hsv = cv2.cvtColor(wb_img, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = cv2.split(hsv)

    ch_max = np.max(wb_img, axis=2).astype(np.int16)
    ch_min = np.min(wb_img, axis=2).astype(np.int16)
    chroma_span = ch_max - ch_min

    # 高饱和且通道差异显著的非灰像素（严格区分正红印章 H<=10|>=168 与蓝墨批注 H in [98,132]，避免暖黄灯光色偏误判）
    vivid_mask = (s_ch >= 72) & (v_ch >= 45) & (chroma_span >= 45)
    red_mask = vivid_mask & ((h_ch <= 10) | (h_ch >= 168))
    blue_mask = vivid_mask & (h_ch >= 98) & (h_ch <= 132)

    red_ratio = float(np.mean(red_mask))
    blue_ratio = float(np.mean(blue_mask))
    total_ratio = red_ratio + blue_ratio

    # 占比在 0.08% ~ 35% 区间内视为有效印章或手写批注（避免纯色背景误判）
    detected = (0.0008 <= total_ratio <= 0.35)
    return {
        "detected": detected,
        "ratio": round(total_ratio, 5),
        "red_ratio": round(red_ratio, 5),
        "blue_ratio": round(blue_ratio, 5),
    }


def _analyze_blur_and_anisotropy(norm_gray_f32: np.ndarray) -> Dict[str, Any]:
    """
    基于 Crete 无参考再模糊边缘梯度衰减率 + Sobel 方向各向异性，量化评估图像清晰度并区分失焦模糊与运动模糊。
    """
    gx = cv2.Sobel(norm_gray_f32, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(norm_gray_f32, cv2.CV_32F, 0, 1, ksize=3)
    gmag = np.hypot(gx, gy)
    lap = np.abs(cv2.Laplacian(norm_gray_f32, cv2.CV_32F, ksize=3))

    edge_thresh = float(np.percentile(gmag, 95))
    if edge_thresh < 8.0:
        return {
            "blur_detected": False,
            "blur_type": "none",
            "sharp_ratio": 0.5,
            "crete_drop": 0.5,
            "anisotropy": 1.0,
            "suggested_angle": 0.0,
        }

    emask = gmag >= edge_thresh
    mean_gmag = max(float(np.mean(gmag[emask])), 1.0)
    sharp_ratio = float(np.mean(lap[emask]) / mean_gmag)

    # 各向同性高斯再模糊对比 (Crete et al. 经典无参考模糊估计原理)
    reblur_iso = cv2.GaussianBlur(norm_gray_f32, (5, 5), 1.5)
    g_reblur = np.hypot(
        cv2.Sobel(reblur_iso, cv2.CV_32F, 1, 0, ksize=3),
        cv2.Sobel(reblur_iso, cv2.CV_32F, 0, 1, ksize=3),
    )
    crete_drop = float(np.mean(np.maximum(gmag[emask] - g_reblur[emask], 0.0)) / mean_gmag)

    # X / Y 方向能量各向异性与单向再模糊衰减率（精准识别手抖线性运动拖影）
    gx_e = float(np.mean(np.abs(gx[emask])))
    gy_e = float(np.mean(np.abs(gy[emask])))
    anisotropy = gx_e / max(gy_e, 1e-4)

    gx_reblur = np.abs(cv2.Sobel(cv2.GaussianBlur(norm_gray_f32, (5, 1), 1.5), cv2.CV_32F, 1, 0, ksize=3))
    gy_reblur = np.abs(cv2.Sobel(cv2.GaussianBlur(norm_gray_f32, (1, 5), 1.5), cv2.CV_32F, 0, 1, ksize=3))
    drop_x = float(np.mean(np.maximum(np.abs(gx[emask]) - gx_reblur[emask], 0.0)) / max(gx_e, 1.0))
    drop_y = float(np.mean(np.maximum(np.abs(gy[emask]) - gy_reblur[emask], 0.0)) / max(gy_e, 1.0))

    blur_type = "none"
    blur_detected = False
    suggested_angle = 0.0

    # 判定 1: 水平或垂直线性运动模糊（单轴梯度能量强烈崩塌 + 对应轴再模糊衰减骤降）
    if anisotropy < 0.35 and drop_x < 0.42:
        blur_detected = True
        blur_type = "motion"
        suggested_angle = 0.0
    elif anisotropy > 2.85 and drop_y < 0.42:
        blur_detected = True
        blur_type = "motion"
        suggested_angle = 90.0
    # 判定 2: 光学失焦模糊（各向同性边缘梯度再模糊衰减率与拉普拉斯锐度同步走低）
    elif crete_drop < 0.40 and sharp_ratio < 0.32:
        blur_detected = True
        blur_type = "defocus"

    return {
        "blur_detected": blur_detected,
        "blur_type": blur_type,
        "sharp_ratio": round(sharp_ratio, 3),
        "crete_drop": round(crete_drop, 3),
        "drop_x": round(drop_x, 3),
        "drop_y": round(drop_y, 3),
        "anisotropy": round(anisotropy, 3),
        "suggested_angle": suggested_angle,
    }


def diagnose_document(
    image: np.ndarray,
    max_analysis_dim: int = 960
) -> Dict[str, Any]:
    """
    对输入文档图像执行纯传统信号自动诊断，返回可解释的问题标签列表、底层指标和推荐处理参数。

    参数:
        image: BGR 彩色图或单通道灰度图 (uint8)
        max_analysis_dim: 诊断工作副本最大边长（默认 900px，确保 4K 手机照片诊断耗时 < 60ms）
    返回:
        包含 issues, metrics, summary_text, recommended_params, elapsed_ms 的字典
    """
    t0 = time.perf_counter()
    orig_h, orig_w = image.shape[:2]

    # 等比缩放到分析尺度，提升 4K 实拍图诊断速度并统一核尺度感受野
    if max(orig_h, orig_w) > max_analysis_dim:
        scale = max_analysis_dim / float(max(orig_h, orig_w))
        work_img = cv2.resize(
            image,
            (max(1, int(round(orig_w * scale))), max(1, int(round(orig_h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        work_img = image.copy()

    # 1. 透视畸变检测
    corners = detect_document_corners(work_img, max_detect_dim=max_analysis_dim)
    has_skew = corners is not None
    if has_skew:
        analysis_img, _ = perspective_transform(work_img, corners)
    else:
        analysis_img = work_img

    is_color = (len(analysis_img.shape) == 3)
    raw_gray = cv2.cvtColor(analysis_img, cv2.COLOR_BGR2GRAY) if is_color else analysis_img

    # 2. 椒盐脉冲噪声检测
    impulse_ratio = _compute_impulse_noise_ratio(raw_gray)
    has_impulse_noise = impulse_ratio >= 0.008

    # 3. 灯光色偏检测（基于高分位无字纸面 RGB 通道失衡 + YCrCb 色度偏移）
    stats = analyze_channel_statistics(analysis_img)
    paper_cast = 0.0
    if is_color:
        wb_p90 = np.percentile(analysis_img.reshape(-1, 3), 90, axis=0)
        paper_cast = float((np.max(wb_p90) - np.min(wb_p90)) / max(float(np.max(wb_p90)), 1.0))
    has_color_cast = is_color and (paper_cast >= 0.14 or stats["chroma_cast_index"] >= 10.0)

    # 在去脉冲噪点后的图像上进行色度、频谱、阴影与模糊分析，防止噪点干扰后续估计
    clean_img = cv2.medianBlur(analysis_img, 3) if has_impulse_noise else analysis_img

    # 4. 红章与彩色批注检测
    stamp_info = _detect_color_stamps(clean_img) if is_color else {"detected": False, "ratio": 0.0}
    has_color_stamp = bool(stamp_info["detected"])

    # 提取纸白校正后的亮度通道
    lum, _ = extract_luminance(clean_img, space="hsv", apply_white_balance=True)

    # 5. 2D-FFT 周期性摩尔纹检测（排除普通排版文字行距在垂直/水平主轴上的中弱谐波）
    _, spec = compute_fft_spectrum(lum)
    raw_peaks = detect_periodic_peaks(spec)
    sh, sw = spec.shape[:2]
    scy, scx = sh // 2, sw // 2
    peaks = [
        (py, px)
        for (py, px) in raw_peaks
        if (abs(px - scx) > 3 and abs(py - scy) > 3) or int(spec[py, px]) >= 205
    ]
    moire_peak_count = len(peaks)
    has_moire = moire_peak_count >= 2

    lum_nomoire = (
        apply_frequency_notch_filter(lum, notch_points=peaks, d0=14.0)[0]
        if has_moire
        else lum
    )

    # 6. 非均匀光照与阴影梯度检测
    bg = estimate_background_illumination(lum_nomoire, kernel_size=45)
    p95_bg, p10_bg = np.percentile(bg, (95, 10))
    shadow_span = float((p95_bg - p10_bg) / max(float(p95_bg), 1.0))
    has_shadow = shadow_span >= 0.22

    # 7. 在光照归一化后的亮度上评估模糊度（彻底解耦阴影与摩尔纹影响）
    div = remove_shadow_by_division(lum_nomoire, bg, target_mean=244.0)
    p1, p99 = np.percentile(div, (1, 99))
    norm_f32 = np.clip(
        (div.astype(np.float32) - float(p1)) / max(float(p99 - p1), 1.0) * 255.0,
        0.0,
        255.0,
    ).astype(np.float32)
    blur_info = _analyze_blur_and_anisotropy(norm_f32)
    has_blur = bool(blur_info["blur_detected"])
    blur_type = str(blur_info["blur_type"])

    # ==========================================
    # 生成可解释的问题清单与推荐传统算法参数
    # ==========================================
    issues: List[Dict[str, Any]] = []
    recommended_params: Dict[str, Any] = {
        "output_mode": "stamp_preserve" if has_color_stamp else "binary",
        "enable_geometric": has_skew,
        "enable_white_balance": True,
        "enable_illumination": True,
        "illumination_kernel_size": 45,
        "contrast_method": "stretch_clahe",
        "denoise_method": "median" if has_impulse_noise else "none",
        "denoise_ksize": 3,
        "enable_frequency_filter": has_moire,
        "notch_radius": 14.0 if moire_peak_count >= 6 else 12.0,
        "enable_restoration": has_blur,
        "blur_type": blur_type if blur_type in ("defocus", "motion") else "defocus",
        "defocus_radius": 3,
        "motion_length": 9,
        "motion_angle": float(blur_info.get("suggested_angle", 0.0)),
        "wiener_k": 0.016 if blur_type == "motion" else 0.018,
        "enable_binarization": True,
        "binarize_method": "sauvola",
        "sauvola_window_size": 25,
        "sauvola_k": 0.18,
        "sharpen": True,
        "sharpen_strength": 0.4 if has_blur else 0.35,
        "soft_blend": True,
    }

    if has_skew:
        issues.append({
            "code": "skew",
            "label": "画面存在透视倾斜",
            "severity": "high",
            "action": "已启用 Canny + 凸包四角检测与单应性拉直",
            "metric": "检测到 4 边纸张轮廓",
        })
    if has_shadow:
        issues.append({
            "code": "shadow",
            "label": "光照不均 / 手影遮挡",
            "severity": "high" if shadow_span >= 0.45 else "medium",
            "action": "已启用形态学背景场估计与 Retinex 除法匀光",
            "metric": f"光照落差 {shadow_span * 100:.0f}%",
        })
    if has_moire:
        issues.append({
            "code": "moire",
            "label": "屏幕周期性摩尔纹",
            "severity": "high",
            "action": f"已定位 {moire_peak_count} 个频域异常脉冲峰并施加高斯陷波",
            "metric": f"{moire_peak_count} 个 FFT 亮峰",
        })
    if has_blur and blur_type == "motion":
        issues.append({
            "code": "motion_blur",
            "label": "手持抖动线性重影",
            "severity": "high",
            "action": f"已启用线性运动 PSF (θ={blur_info['suggested_angle']:.0f}°) 维纳反卷积",
            "metric": f"方向各向异性 {blur_info['anisotropy']:.2f}",
        })
    elif has_blur and blur_type == "defocus":
        issues.append({
            "code": "defocus_blur",
            "label": "镜头失焦文字发虚",
            "severity": "high",
            "action": "已启用圆盘 PSF 退化建模与正则化维纳复原",
            "metric": f"边缘锐度衰减 {blur_info['crete_drop']:.2f}",
        })
    if has_color_cast:
        issues.append({
            "code": "color_cast",
            "label": "暖光 / 荧光环境偏色",
            "severity": "medium",
            "action": "已启用纸面白点 Retinex 自动白平衡纠偏",
            "metric": f"通道偏色度 {paper_cast * 100:.0f}%",
        })
    if has_impulse_noise:
        issues.append({
            "code": "impulse_noise",
            "label": "暗光椒盐脉冲噪点",
            "severity": "medium",
            "action": "已启用 3×3 统计中值滤波无损抹除孤立噪点",
            "metric": f"脉冲噪点率 {impulse_ratio * 100:.2f}%",
        })
    if has_color_stamp:
        issues.append({
            "code": "color_stamp",
            "label": "检测到红章 / 彩色批注",
            "severity": "info",
            "action": "已自动推荐「红章/批注彩印」模式保留高饱和色迹",
            "metric": f"彩迹占比 {stamp_info['ratio'] * 100:.2f}%",
        })

    if not issues:
        summary_text = "画面整体平整清晰，已自动应用标准净白扫描与文字锐化策略。"
    else:
        labels = "、".join(item["label"] for item in issues[:4])
        summary_text = f"自动诊断发现：{labels}。已按对应传统图像信号模型自动匹配修复管线。"

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "issues": issues,
        "summary_text": summary_text,
        "recommended_params": recommended_params,
        "metrics": {
            "has_skew": has_skew,
            "shadow_span": round(shadow_span, 3),
            "moire_peak_count": moire_peak_count,
            "blur_type": blur_type,
            "blur_crete_drop": blur_info["crete_drop"],
            "blur_sharp_ratio": blur_info["sharp_ratio"],
            "blur_anisotropy": blur_info["anisotropy"],
            "paper_color_cast": round(paper_cast, 3),
            "chroma_cast_index": stats["chroma_cast_index"],
            "impulse_noise_ratio": round(impulse_ratio, 5),
            "has_color_stamp": has_color_stamp,
            "color_stamp_ratio": stamp_info["ratio"],
        },
        "elapsed_ms": round(elapsed_ms, 2),
    }
