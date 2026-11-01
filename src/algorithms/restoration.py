"""
退化建模与维纳滤波复原模块 (Restoration & Wiener Deconvolution)
课题一 核心算法流水线阶段 (5)
纯传统数字图像处理实现：散焦模糊与运动模糊点扩散函数 (PSF) 建模、维纳滤波逆卷积复原 (Wiener Filter)，有效抑制逆滤波的高频噪声发散。
"""

from typing import Tuple
import numpy as np
import cv2


def create_defocus_psf(shape: Tuple[int, int], radius: int = 5) -> np.ndarray:
    """
    建立散焦模糊点扩散函数 (Defocus PSF)。
    采用圆形均匀孔径模型 (Circular Disk Aperture)。
    
    参数:
        shape: 目标图像大小 (H, W)
        radius: 散焦弥散圆半径
    """
    h, w = shape
    psf = np.zeros((h, w), dtype=np.float32)
    
    # 在中心生成圆盘
    cy, cx = h // 2, w // 2
    cv2.circle(psf, (cx, cy), max(radius, 1), 1.0, -1)
    
    # 能量归一化（保证滤波能量守恒）
    sum_val = np.sum(psf)
    if sum_val > 0:
        psf /= sum_val
        
    return psf


def create_motion_psf(shape: Tuple[int, int], length: int = 15, angle: float = 0.0) -> np.ndarray:
    """
    建立线性运动模糊点扩散函数 (Motion Blur PSF)。
    
    参数:
        shape: (H, W)
        length: 运动模糊位移像素长度
        angle: 运动方向角度 (度，水平向右为 0)
    """
    h, w = shape
    psf = np.zeros((h, w), dtype=np.float32)
    cy, cx = h // 2, w // 2
    
    # 计算线段端点
    theta = np.deg2rad(angle)
    half_l = length / 2.0
    x1 = int(cx - half_l * np.cos(theta))
    y1 = int(cy - half_l * np.sin(theta))
    x2 = int(cx + half_l * np.cos(theta))
    y2 = int(cy + half_l * np.sin(theta))
    
    cv2.line(psf, (x1, y1), (x2, y2), 1.0, 1)
    
    sum_val = np.sum(psf)
    if sum_val > 0:
        psf /= sum_val
        
    return psf


def wiener_deconvolution(
    gray: np.ndarray,
    psf: np.ndarray,
    k: float = 0.01
) -> np.ndarray:
    """
    维纳反卷积复原算法 (Wiener Deconvolution)。
    
    数学模型:
        W(u, v) = H*(u, v) / (|H(u, v)|^2 + K)
        F_hat(u, v) = W(u, v) * G(u, v)
        
    参数:
        gray: 输入模糊图像 (H, W, uint8)
        psf: 点扩散函数 (H, W)，中心已对其
        k: 噪声与未退化图像功率比经验常数（典型范围 [0.001, 0.05]）
    """
    # 傅里叶变换将空间原点对齐到 (0, 0)
    # 利用 ifftshift 将中心对齐的 psf 移至角点以匹配标准 2D-FFT 约定
    psf_shifted = np.fft.ifftshift(psf)
    h_freq = np.fft.fft2(psf_shifted)
    
    # 退化图像的频域表示
    g_freq = np.fft.fft2(gray.astype(np.float32))
    
    # 维纳传递函数 W(u, v)
    h_conj = np.conj(h_freq)
    h_abs_sq = np.abs(h_freq) ** 2
    wiener_filter = h_conj / (h_abs_sq + k)
    
    # 频域滤波估计原图
    f_hat_freq = g_freq * wiener_filter
    
    # 逆傅里叶变换还原空域
    f_hat = np.real(np.fft.ifft2(f_hat_freq))
    
    # 截断与归一化
    restored = np.clip(f_hat, 0, 255).astype(np.uint8)
    return restored


def restore_blur(
    gray: np.ndarray,
    blur_type: str = "defocus",
    radius: int = 4,
    motion_length: int = 12,
    motion_angle: float = 0.0,
    k: float = 0.015
) -> Tuple[np.ndarray, np.ndarray]:
    """
    模糊复原综合接口。
    
    返回:
        (restored_gray, psf_visualization)
    """
    shape = gray.shape[:2]
    
    if blur_type == "defocus":
        psf = create_defocus_psf(shape, radius=radius)
    elif blur_type == "motion":
        psf = create_motion_psf(shape, length=motion_length, angle=motion_angle)
    else:
        raise ValueError(f"未知模糊类型: {blur_type}")
        
    restored = wiener_deconvolution(gray, psf, k=k)
    
    # 取中心小窗口可视化 PSF 供前端与报告展示
    cy, cx = shape[0] // 2, shape[1] // 2
    win = 32
    psf_crop = psf[max(0, cy-win):min(shape[0], cy+win), max(0, cx-win):min(shape[1], cx+win)]
    psf_vis = cv2.normalize(psf_crop, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    return restored, psf_vis
