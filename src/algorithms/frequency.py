"""
频率域滤波消除周期性网纹与摩尔纹模块 (Frequency Domain Filtering)
课题一 核心算法流水线阶段 (4)
纯传统数字图像处理实现：
1. 2D 离散傅里叶变换 (2D-FFT) 与中心化对数幅度谱；
2. 方向脊线感知的局部显著性脉冲亮峰检测 (Directional-Ridge-Aware Peak Detection)，保护文档文字行频谐波；
3. 标准共轭对称高斯陷波带阻滤波器 (Gaussian Notch Reject Filter, Gonzalez 4th Ed. Eq. 4-149)。
"""

from typing import Tuple, List, Optional
import numpy as np
import cv2
from scipy.ndimage import median_filter


def compute_fft_spectrum(gray: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    计算 2D 傅里叶变换及中心化对数幅度谱。
    
    返回:
        f_shift: 中心化复数频谱矩阵
        magnitude_spectrum: 用于显示的归一化对数能量图 (0-255, uint8)
    """
    f = np.fft.fft2(gray.astype(np.float32))
    f_shift = np.fft.fftshift(f)
    
    magnitude = np.abs(f_shift)
    # 对数动态范围压缩: S = log(1 + |F(u, v)|)
    log_mag = np.log1p(magnitude)
    
    # 归一化至 0-255 便于前端显示与论文插图
    norm_mag = cv2.normalize(log_mag, None, 0, 255, cv2.NORM_MINMAX)
    return f_shift, norm_mag.astype(np.uint8)


def detect_periodic_peaks(
    magnitude_spectrum: np.ndarray,
    peak_threshold_ratio: float = 0.68,
    center_exclude_radius: int = 20,
    max_peaks: int = 16,
    prominence_thresh: float = 32.0
) -> List[Tuple[int, int]]:
    """
    自动检测频域中除直流中心与文档自然行频脊线外的异常周期性高能脉冲亮峰 (Notch Peaks)。
    
    算法创新点:
        普通文档的水平文字行在频谱垂直轴 (v = cx) 上天然形成连续衍射脊线与低频行距谐波。
        若仅用全局阈值或普通 2D 邻域中值，极易将文字行频误判为摩尔纹并抹除，引发全图水平黑条纹。
        本算法融合 2D 邻域中值与垂直/水平 1D 方向中值构造基线背景，仅检出在二维与一维脊线上同时孤立突起的真周期性网纹脉冲。
    
    参数:
        magnitude_spectrum: 归一化对数谱 (H, W, uint8)
        peak_threshold_ratio: 绝对幅度門限比率 (默认 0.68)
        center_exclude_radius: 屏蔽低频直流中心的最小半径
        max_peaks: 最多检测的陷波点数量
        prominence_thresh: 局部突出度阈值 (默认 32.0)
    返回:
        notch_points: 异常频域峰值坐标列表 [(u1, v1), (u2, v2), ...]
    """
    h, w = magnitude_spectrum.shape
    cy, cx = h // 2, w // 2
    spec_f = magnitude_spectrum.astype(np.float32)

    # 动态适配低频保护半径（既兼容 128x128 单元测试图，也保护大尺寸文档的低频区）
    effective_radius = max(center_exclude_radius, int(min(h, w) * 0.08))

    # 计算 2D 局部背景，并在十字主轴附近融合 1D 轴向脊线背景以保护文字行频谐波
    med_2d = cv2.medianBlur(magnitude_spectrum, 15).astype(np.float32)
    win_1d = min(25, max(9, (min(h, w) // 8) | 1))
    med_vert = median_filter(spec_f, size=(win_1d, 1))
    med_horiz = median_filter(spec_f, size=(1, win_1d))

    local_baseline = med_2d.copy()
    # 仅在垂直主轴 (|x - cx| <= 4) 与水平主轴 (|y - cy| <= 4) 施加 1D 脊线基线抑制
    local_baseline[:, max(0, cx - 4):min(w, cx + 5)] = np.maximum(
        local_baseline[:, max(0, cx - 4):min(w, cx + 5)],
        med_vert[:, max(0, cx - 4):min(w, cx + 5)]
    )
    local_baseline[max(0, cy - 4):min(h, cy + 5), :] = np.maximum(
        local_baseline[max(0, cy - 4):min(h, cy + 5), :],
        med_horiz[max(0, cy - 4):min(h, cy + 5), :]
    )

    prominence = spec_f - local_baseline

    # 屏蔽中心低频直流区
    y_idx, x_idx = np.ogrid[:h, :w]
    dist_from_center = np.hypot(y_idx - cy, x_idx - cx)
    prominence[dist_from_center < effective_radius] = 0.0

    abs_thresh = 255.0 * peak_threshold_ratio
    binary_peaks = ((prominence >= prominence_thresh) & (spec_f >= abs_thresh)).astype(np.uint8) * 255

    # 连通域质心提取并按局部突出度从高到低排序
    contours, _ = cv2.findContours(binary_peaks, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for cnt in contours:
        m = cv2.moments(cnt)
        if m["m00"] > 0:
            px = int(round(m["m10"] / m["m00"]))
            py = int(round(m["m01"] / m["m00"]))
        else:
            px = int(round(np.mean(cnt[:, 0, 0])))
            py = int(round(np.mean(cnt[:, 0, 1])))

        if np.hypot(py - cy, px - cx) >= effective_radius:
            score = float(prominence[min(max(py, 0), h - 1), min(max(px, 0), w - 1)])
            candidates.append((score, (py, px)))

    candidates.sort(key=lambda item: item[0], reverse=True)
    peak_points = [pt for _, pt in candidates[:max_peaks]]
    return peak_points


def create_gaussian_notch_filter(
    shape: Tuple[int, int],
    notch_points: List[Tuple[int, int]],
    d0: float = 12.0
) -> np.ndarray:
    """
    构造标准共轭对称高斯陷波带阻滤波器传递函数 H_NR(u, v)。
    理论基准: Gonzalez《数字图像处理》(第四版) 公式 (4-149)
        H_NR(u, v) = prod_{k=1}^Q [1 - exp(-D_k^2(u, v) / (2 * D0^2))] * [1 - exp(-D_{-k}^2(u, v) / (2 * D0^2))]
    
    由于实数图像傅里叶变换具有共轭对称性，每个陷波点 (u_k, v_k) 同步消除其对称点 (-u_k, -v_k)，
    且严格保护直流中心 (cy, cx) 增益为 1.0，杜绝背景均值发黑。
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    
    y, x = np.ogrid[:h, :w]
    h_filter = np.ones((h, w), dtype=np.float32)
    denom = 2.0 * (max(float(d0), 1.0) ** 2)
    
    # 去重对称点对，防止对同一对共轭峰重复平方衰减
    visited = []
    for (py, px) in notch_points:
        u_k = py - cy
        v_k = px - cx
        if u_k == 0 and v_k == 0:
            continue
        is_dup = False
        for (uu, vv) in visited:
            if np.hypot(u_k - uu, v_k - vv) < max(4.0, d0 * 0.5) or np.hypot(u_k + uu, v_k + vv) < max(4.0, d0 * 0.5):
                is_dup = True
                break
        if is_dup:
            continue
        visited.append((u_k, v_k))

        # 正负对称陷波中心的欧氏距离平方
        d_k_sq = (y - (cy + u_k)) ** 2 + (x - (cx + v_k)) ** 2
        d_neg_k_sq = (y - (cy - u_k)) ** 2 + (x - (cx - v_k)) ** 2
        
        notch_pos = 1.0 - np.exp(-d_k_sq / denom)
        notch_neg = 1.0 - np.exp(-d_neg_k_sq / denom)
        h_filter *= (notch_pos * notch_neg)

    # 强制保护直流分量 DC (cy, cx) 不受任何微弱尾部衰减影响
    h_filter[cy, cx] = 1.0
    return h_filter


def apply_frequency_notch_filter(
    gray: np.ndarray,
    notch_points: Optional[List[Tuple[int, int]]] = None,
    d0: float = 12.0,
    auto_detect: bool = True
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[Tuple[int, int]]]:
    """
    频域陷波滤波去网纹全流程。
    
    返回:
        (filtered_gray, orig_spectrum, filtered_spectrum, detected_peaks)
    """
    h, w = gray.shape
    f_shift, orig_spectrum = compute_fft_spectrum(gray)
    
    # 亮峰检测
    if auto_detect and notch_points is None:
        detected_peaks = detect_periodic_peaks(orig_spectrum)
    elif notch_points is not None:
        detected_peaks = notch_points
    else:
        detected_peaks = detect_periodic_peaks(orig_spectrum)
        
    if not detected_peaks:
        # 若无网纹脉冲，原样直通，零细节损失
        return gray.copy(), orig_spectrum, orig_spectrum.copy(), []
        
    # 构建高斯陷波传递函数
    h_filter = create_gaussian_notch_filter((h, w), detected_peaks, d0=d0)
    
    # 频域相乘滤波
    f_filtered = f_shift * h_filter
    
    # 计算滤波后的对数幅度谱（直接使用相同动态范围映射或叠加滤波器掩模以便直观对比陷波黑孔）
    filtered_mag = np.log1p(np.abs(f_filtered))
    filtered_spectrum = cv2.normalize(filtered_mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    # 同步将陷波阻带压暗在可视化频谱上，使课程报告中滤波前后的频谱对比清晰可见
    filtered_spectrum = (filtered_spectrum.astype(np.float32) * h_filter).astype(np.uint8)
    
    # 逆傅里叶变换还原空域
    f_ishift = np.fft.ifftshift(f_filtered)
    img_back = np.fft.ifft2(f_ishift)
    img_real = np.real(img_back)
    
    filtered_gray = np.clip(img_real, 0, 255).astype(np.uint8)
    return filtered_gray, orig_spectrum, filtered_spectrum, detected_peaks
