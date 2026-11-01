"""
客观图像质量评价指标模块 (Objective Image Quality Metrics)
课题一 核心算法流水线阶段 (7)
包含 PSNR (峰值信噪比)、SSIM (结构相似性度量)、对比度与图像信息熵。
"""

from typing import Tuple
import numpy as np
import cv2


def compute_psnr(image_true: np.ndarray, image_test: np.ndarray) -> float:
    """
    计算峰值信噪比 PSNR (Peak Signal-to-Noise Ratio)。
    公式: PSNR = 10 * log10(MAX^2 / MSE)
    """
    # 尺寸对齐
    if image_true.shape != image_test.shape:
        image_test = cv2.resize(image_test, (image_true.shape[1], image_true.shape[0]))
        
    img1 = image_true.astype(np.float64)
    img2 = image_test.astype(np.float64)
    
    mse = np.mean((img1 - img2) ** 2)
    if mse == 0:
        return 100.0  # 完全相同
        
    max_pixel = 255.0
    psnr = 10.0 * np.log10((max_pixel ** 2) / mse)
    return float(psnr)


def compute_ssim(
    image_true: np.ndarray,
    image_test: np.ndarray,
    k1: float = 0.01,
    k2: float = 0.03
) -> float:
    """
    计算结构相似性指数 SSIM (Structural Similarity Index)。
    针对局部亮度、对比度与结构相似度进行三要素综合评价。
    """
    if image_true.shape != image_test.shape:
        image_test = cv2.resize(image_test, (image_true.shape[1], image_true.shape[0]))
        
    if len(image_true.shape) == 3:
        im1 = cv2.cvtColor(image_true, cv2.COLOR_BGR2GRAY).astype(np.float64)
    else:
        im1 = image_true.astype(np.float64)
        
    if len(image_test.shape) == 3:
        im2 = cv2.cvtColor(image_test, cv2.COLOR_BGR2GRAY).astype(np.float64)
    else:
        im2 = image_test.astype(np.float64)
        
    c1 = (k1 * 255.0) ** 2
    c2 = (k2 * 255.0) ** 2
    
    # 11x11 高斯窗口
    kernel = cv2.getGaussianKernel(11, 1.5)
    window = np.outer(kernel, kernel.transpose())
    
    mu1 = cv2.filter2D(im1, -1, window)[5:-5, 5:-5]
    mu2 = cv2.filter2D(im2, -1, window)[5:-5, 5:-5]
    
    mu1_sq = mu1 * mu1
    mu2_sq = mu2 * mu2
    mu1_mu2 = mu1 * mu2
    
    sigma1_sq = cv2.filter2D(im1 * im1, -1, window)[5:-5, 5:-5] - mu1_sq
    sigma2_sq = cv2.filter2D(im2 * im2, -1, window)[5:-5, 5:-5] - mu2_sq
    sigma12 = cv2.filter2D(im1 * im2, -1, window)[5:-5, 5:-5] - mu1_mu2
    
    ssim_map = ((2.0 * mu1_mu2 + c1) * (2.0 * sigma12 + c2)) / \
               ((mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2) + 1e-7)
               
    return float(np.mean(ssim_map))


def compute_image_entropy(image: np.ndarray) -> float:
    """
    计算图像的一阶灰度信息熵 (Shannon Entropy)。
    反映图像细节信息丰富度。
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
        
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
    hist_norm = hist / hist.sum()
    # 过滤 0 概率
    non_zero = hist_norm[hist_norm > 0]
    entropy = -np.sum(non_zero * np.log2(non_zero))
    return float(entropy)


def evaluate_quality_metrics(
    image_ref: np.ndarray,
    image_target: np.ndarray
) -> dict:
    """
    综合计算所有客观评估指标。
    """
    psnr_val = compute_psnr(image_ref, image_target)
    ssim_val = compute_ssim(image_ref, image_target)
    entropy_val = compute_image_entropy(image_target)
    
    return {
        "psnr": round(psnr_val, 2),
        "ssim": round(ssim_val, 4),
        "entropy": round(entropy_val, 4)
    }
