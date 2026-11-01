"""
频率域滤波消除周期性网纹与摩尔纹模块 (Frequency Domain Filtering)
课题一 核心算法流水线阶段 (4)
纯传统数字图像处理实现：2D 离散傅里叶变换 (2D-FFT)、中心化对数幅度谱、高斯陷波带阻滤波器 (Gaussian Notch Reject Filter) 去除屏幕翻拍摩尔纹与周期性扫描网纹。
"""

from typing import Tuple, List, Optional
import numpy as np
import cv2


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
    # 对数动态范围压缩
    log_mag = np.log(1.0 + magnitude)
    
    # 归一化至 0-255 便于前端显示与论文插图
    norm_mag = cv2.normalize(log_mag, None, 0, 255, cv2.NORM_MINMAX)
    return f_shift, norm_mag.astype(np.uint8)


def detect_periodic_peaks(
    magnitude_spectrum: np.ndarray,
    peak_threshold_ratio: float = 0.75,
    center_exclude_radius: int = 20,
    max_peaks: int = 16
) -> List[Tuple[int, int]]:
    """
    自动检测频域中除直流中心外的异常周期性高能脉冲亮峰 (Notch Peaks)。
    
    参数:
        magnitude_spectrum: 归一化对数谱 (H, W, uint8)
        peak_threshold_ratio: 亮峰阈值比率 (默认 0.75)
        center_exclude_radius: 屏蔽低频直流中心的半径（保护文档整体结构与大块平坦区域）
        max_peaks: 最多检测的陷波点对数
    返回:
        notch_points: 异常频域峰值坐标列表 [(u1, v1), (u2, v2), ...]
    """
    h, w = magnitude_spectrum.shape
    cy, cx = h // 2, w // 2
    
    # 构建直流保护掩模 (Center Mask)
    y_idx, x_idx = np.ogrid[:h, :w]
    dist_from_center = np.hypot(y_idx - cy, x_idx - cx)
    
    masked_spectrum = magnitude_spectrum.copy()
    masked_spectrum[dist_from_center < center_exclude_radius] = 0
    
    # 动态阈值：结合比率与背景标准差
    thresh_val = int(255 * peak_threshold_ratio)
    _, binary_peaks = cv2.threshold(masked_spectrum, thresh_val, 255, cv2.THRESH_BINARY)
    
    # 寻找局部峰值连通域质心
    contours, _ = cv2.findContours(binary_peaks, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    peak_points = []
    for cnt in contours:
        m = cv2.moments(cnt)
        if m["m00"] > 0:
            px = int(m["m10"] / m["m00"])
            py = int(m["m01"] / m["m00"])
        else:
            # 单像素或线状极小点，直接取几何均值点
            px = int(np.mean(cnt[:, 0, 0]))
            py = int(np.mean(cnt[:, 0, 1]))

        # 偏离中心才算网纹脉冲
        if np.hypot(py - cy, px - cx) >= center_exclude_radius:
            peak_points.append((py, px))
                
        if len(peak_points) >= max_peaks:
            break
            
    return peak_points


def create_gaussian_notch_filter(
    shape: Tuple[int, int],
    notch_points: List[Tuple[int, int]],
    d0: float = 12.0
) -> np.ndarray:
    """
    构造高斯陷波带阻滤波器传递函数 H(u, v)。
    公式: H_NR(u, v) = prod_{k=1}^Q [1 - exp(-0.5 * (D_k * D_{-k}) / D0^2)]
    
    由于实数图像傅里叶变换共轭对称性，每个陷波点 (u_k, v_k) 必须同时消除其对称点 (-u_k, -v_k)。
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    
    y, x = np.ogrid[:h, :w]
    h_filter = np.ones((h, w), dtype=np.float32)
    
    for (py, px) in notch_points:
        # 计算相对中心的偏移
        u_k = py - cy
        v_k = px - cx
        
        # 正负对称中心点
        d_k = np.hypot(y - (cy + u_k), x - (cx + v_k))
        d_neg_k = np.hypot(y - (cy - u_k), x - (cx - v_k))
        
        # 高斯陷波阻带核
        notch = 1.0 - np.exp(-0.5 * (d_k * d_neg_k) / (d0 ** 2 + 1e-6))
        h_filter *= notch
        
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
    if auto_detect or notch_points is None:
        detected_peaks = detect_periodic_peaks(orig_spectrum)
    else:
        detected_peaks = notch_points
        
    if not detected_peaks:
        # 若无网纹脉冲，不进行滤波以免损失细节
        return gray.copy(), orig_spectrum, orig_spectrum, []
        
    # 构建高斯陷波传递函数
    h_filter = create_gaussian_notch_filter((h, w), detected_peaks, d0=d0)
    
    # 频域相乘滤波
    f_filtered = f_shift * h_filter
    
    # 计算滤波后的频谱用于对比展示
    filtered_mag = np.log(1.0 + np.abs(f_filtered))
    filtered_spectrum = cv2.normalize(filtered_mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    # 逆变换还原空域
    f_ishift = np.fft.ifftshift(f_filtered)
    img_back = np.fft.ifft2(f_ishift)
    img_real = np.real(img_back)
    
    # 截断与类型转换
    filtered_gray = np.clip(img_real, 0, 255).astype(np.uint8)
    
    return filtered_gray, orig_spectrum, filtered_spectrum, detected_peaks
