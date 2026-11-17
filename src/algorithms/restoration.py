"""
退化建模与维纳滤波复原模块 (Restoration & Wiener Deconvolution)
课题一 核心算法流水线阶段 (5) / 对应课程实验六
纯传统数字图像处理实现：
1. 散焦模糊 (Circular Disk PSF)、运动模糊 (Linear Motion PSF) 与高斯模糊 (Gaussian PSF) 点扩散函数建模；
2. 结合边界平滑延拓 (Border Replication) 与拉普拉斯正则化抑制振铃的维纳反卷积复原 (Regularized Wiener Deconvolution)。
"""

from typing import Tuple
import numpy as np
import cv2


def create_defocus_psf(shape: Tuple[int, int], radius: int = 3) -> np.ndarray:
    """
    建立散焦模糊点扩散函数 (Defocus PSF)。
    采用抗锯齿子像素圆形均匀孔径模型 (Circular Disk Aperture)。
    
    参数:
        shape: 目标图像大小 (H, W)
        radius: 散焦弥散圆半径
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    r = max(int(radius), 1)
    
    # 在局部窗口计算精确欧氏距离以获得平滑圆盘边缘
    psf = np.zeros((h, w), dtype=np.float32)
    win = r + 2
    y0, y1 = max(0, cy - win), min(h, cy + win + 1)
    x0, x1 = max(0, cx - win), min(w, cx + win + 1)
    yy, xx = np.ogrid[y0:y1, x0:x1]
    dist = np.hypot(yy - cy, xx - cx)
    # 柔和抗锯齿孔径边界
    sub_disk = np.clip(float(r) + 0.5 - dist, 0.0, 1.0).astype(np.float32)
    psf[y0:y1, x0:x1] = sub_disk
    
    sum_val = float(np.sum(psf))
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
    
    length = max(int(length), 1)
    theta = np.deg2rad(angle)
    half_l = (length - 1) / 2.0
    x1 = int(round(cx - half_l * np.cos(theta)))
    y1 = int(round(cy - half_l * np.sin(theta)))
    x2 = int(round(cx + half_l * np.cos(theta)))
    y2 = int(round(cy + half_l * np.sin(theta)))
    
    cv2.line(psf, (x1, y1), (x2, y2), 1.0, 1, lineType=cv2.LINE_AA)
    
    sum_val = float(np.sum(psf))
    if sum_val > 0:
        psf /= sum_val
        
    return psf


def create_gaussian_psf(shape: Tuple[int, int], sigma: float = 2.0) -> np.ndarray:
    """
    建立高斯退化点扩散函数 (Gaussian Blur PSF，对应课程实验六要求)。
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    sigma = max(float(sigma), 0.5)
    win = int(np.ceil(sigma * 4)) + 1

    psf = np.zeros((h, w), dtype=np.float32)
    y0, y1 = max(0, cy - win), min(h, cy + win + 1)
    x0, x1 = max(0, cx - win), min(w, cx + win + 1)
    yy, xx = np.ogrid[y0:y1, x0:x1]
    r2 = (yy - cy) ** 2 + (xx - cx) ** 2
    psf[y0:y1, x0:x1] = np.exp(-r2 / (2.0 * sigma * sigma)).astype(np.float32)

    sum_val = float(np.sum(psf))
    if sum_val > 0:
        psf /= sum_val
    return psf


def wiener_deconvolution(
    gray: np.ndarray,
    psf: np.ndarray,
    k: float = 0.02
) -> np.ndarray:
    """
    带边界延拓与二阶拉普拉斯平滑约束的维纳反卷积算法 (Regularized Wiener Deconvolution)。
    
    数学模型 (Gonzalez 第四版 5.8 & 5.9 节):
        W(u, v) = H*(u, v) / (|H(u, v)|^2 + K + alpha * |P(u, v)|^2)
        F_hat(u, v) = W(u, v) * G(u, v)
        
    工程改进:
        1. 采用 32px 边界复制延拓 (BORDER_REPLICATE) 消除 2D-FFT 周期性边界截断引发的全图波纹振铃；
        2. 使用精确的中心循环移位 np.roll 对齐零相位中心，兼容任意奇偶尺寸图像；
        3. 引入微弱高频拉普拉斯算子 P(u,v) 阻尼散焦贝塞尔函数零点处的寄生振铃。
    """
    h, w = gray.shape[:2]
    pad = min(32, max(8, min(h, w) // 6))

    # 1. 边界平滑延拓，阻断周期边界条件引起的吉布斯振铃 (Gibbs Ringing)
    padded_gray = cv2.copyMakeBorder(gray, pad, pad, pad, pad, cv2.BORDER_REPLICATE).astype(np.float32)
    hp, wp = padded_gray.shape

    # 2. 将 PSF 嵌入延拓尺寸并严格将几何中心 (h//2, w//2) 移至频域零相位原点 (0, 0)
    psf_pad = np.zeros((hp, wp), dtype=np.float32)
    psf_pad[:h, :w] = psf
    cy, cx = h // 2, w // 2
    psf_zero_phase = np.roll(np.roll(psf_pad, -cy, axis=0), -cx, axis=1)
    h_freq = np.fft.fft2(psf_zero_phase)

    # 3. 构造拉普拉斯算子频域响应 |P(u, v)|^2 用于抑制高频零点振铃
    lap_pad = np.zeros((hp, wp), dtype=np.float32)
    lap_kernel = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
    lap_pad[:3, :3] = lap_kernel
    lap_zero_phase = np.roll(np.roll(lap_pad, -1, axis=0), -1, axis=1)
    p_freq_sq = np.abs(np.fft.fft2(lap_zero_phase)) ** 2

    # 4. 计算退化图像的频域表示与维纳传递函数
    g_freq = np.fft.fft2(padded_gray)
    h_conj = np.conj(h_freq)
    h_abs_sq = np.abs(h_freq) ** 2

    k_eff = max(float(k), 1e-4)
    reg_alpha = k_eff * 0.15
    wiener_filter = h_conj / (h_abs_sq + k_eff + reg_alpha * p_freq_sq)

    # 5. 频域复原并逆变换裁剪回原始尺寸
    f_hat_freq = g_freq * wiener_filter
    f_hat_padded = np.real(np.fft.ifft2(f_hat_freq))
    f_hat = f_hat_padded[pad:pad + h, pad:pad + w]

    restored = np.clip(f_hat, 0, 255).astype(np.uint8)
    return restored


def restore_blur(
    gray: np.ndarray,
    blur_type: str = "defocus",
    radius: int = 3,
    motion_length: int = 12,
    motion_angle: float = 0.0,
    k: float = 0.02
) -> Tuple[np.ndarray, np.ndarray]:
    """
    模糊复原综合接口。
    
    参数:
        gray: 输入灰度/亮度图像
        blur_type: 'defocus' (散焦模糊) | 'motion' (线性运动模糊) | 'gaussian' (高斯模糊)
        radius: 散焦半径或高斯模糊尺度
        motion_length: 运动模糊像素长度
        motion_angle: 运动模糊角度
        k: 维纳滤波信噪比倒数常数 K
    返回:
        (restored_gray, psf_visualization)
    """
    shape = gray.shape[:2]
    b_type = blur_type.lower()
    
    if b_type == "defocus":
        psf = create_defocus_psf(shape, radius=radius)
    elif b_type == "motion":
        psf = create_motion_psf(shape, length=motion_length, angle=motion_angle)
    elif b_type == "gaussian":
        psf = create_gaussian_psf(shape, sigma=max(1.0, float(radius)))
    else:
        raise ValueError(f"未知模糊类型: {blur_type}")
        
    restored = wiener_deconvolution(gray, psf, k=k)
    
    # 取中心窗口并放大可视化 PSF 供前端与报告展示
    cy, cx = shape[0] // 2, shape[1] // 2
    win = 24
    psf_crop = psf[max(0, cy - win):min(shape[0], cy + win + 1), max(0, cx - win):min(shape[1], cx + win + 1)]
    psf_norm = cv2.normalize(psf_crop, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    psf_vis = cv2.resize(psf_norm, (160, 160), interpolation=cv2.INTER_NEAREST)
    
    return restored, psf_vis
