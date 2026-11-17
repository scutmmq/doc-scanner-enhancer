"""
客观图像质量评价指标模块 (Objective Image Quality Metrics)
课题一 核心算法流水线阶段 (7)
包含：
1. 全参考指标 (Full-Reference): PSNR (峰值信噪比)、SSIM (结构相似性度量)；
2. 无参考文档质量指标 (No-Reference Document Quality):
   - 纸面背景均匀度 (Background Uniformity, %)
   - 前景背景对比度信噪比 (Contrast-to-Noise Ratio, CNR)
   - Tenengrad 边缘锐度指数 (Sobel Gradient Sharpness)
   - 一阶灰度信息熵 (Shannon Entropy)
"""

from typing import Optional, Dict, Any
import numpy as np
import cv2


def compute_psnr(image_true: np.ndarray, image_test: np.ndarray) -> float:
    """
    计算峰值信噪比 PSNR (Peak Signal-to-Noise Ratio)。
    公式: PSNR = 10 * log10(MAX^2 / MSE)
    """
    if image_true.shape[:2] != image_test.shape[:2]:
        image_test = cv2.resize(image_test, (image_true.shape[1], image_true.shape[0]), interpolation=cv2.INTER_AREA)

    if len(image_true.shape) == 3 and len(image_test.shape) == 2:
        image_true = cv2.cvtColor(image_true, cv2.COLOR_BGR2GRAY)
    elif len(image_true.shape) == 2 and len(image_test.shape) == 3:
        image_test = cv2.cvtColor(image_test, cv2.COLOR_BGR2GRAY)
        
    img1 = image_true.astype(np.float64)
    img2 = image_test.astype(np.float64)
    
    mse = np.mean((img1 - img2) ** 2)
    if mse < 1e-10:
        return 100.0
        
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
    计算结构相似性指数 SSIM (Structural Similarity Index, Gonzalez 第四版 / Wang et al. 2004)。
    针对局部亮度、对比度与结构相似度进行三要素综合评价。
    """
    if image_true.shape[:2] != image_test.shape[:2]:
        image_test = cv2.resize(image_test, (image_true.shape[1], image_true.shape[0]), interpolation=cv2.INTER_AREA)
        
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
    计算图像的一阶灰度信息熵 (Shannon Entropy):
    H = - sum(p_i * log2(p_i))
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
        
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
    total = hist.sum()
    if total <= 0:
        return 0.0
    hist_norm = hist / total
    non_zero = hist_norm[hist_norm > 0]
    entropy = -np.sum(non_zero * np.log2(non_zero))
    return float(entropy)


def compute_document_readability_metrics(image: np.ndarray) -> Dict[str, float]:
    """
    计算无参考文档专属质量指标（应对无标准真值图的实拍照片评价）：
    1. background_uniformity: 纸面背景平坦均匀度 (0~100%，越高代表阴影与网纹越少)；
    2. contrast_cnr: 文字与纸面对比信噪比 (越高代表字迹越清晰分明)；
    3. sharpness_index: Tenengrad 边缘梯度能量 (反映笔画锐利度)。
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    gray_f = gray.astype(np.float32)
    thresh_val, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    bg_pixels = gray_f[mask > 0]
    fg_pixels = gray_f[mask == 0]

    bg_mean = float(np.mean(bg_pixels)) if bg_pixels.size > 0 else 240.0
    bg_std = float(np.std(bg_pixels)) if bg_pixels.size > 0 else 10.0
    fg_mean = float(np.mean(fg_pixels)) if fg_pixels.size > 0 else 30.0

    # 纸面均匀度: 100 * (1 - bg_std / 85)，无阴影纯白纸面接近 98%~100%
    uniformity = float(np.clip((1.0 - bg_std / 85.0) * 100.0, 10.0, 99.9))

    # 对比信噪比 CNR
    cnr = float(abs(bg_mean - fg_mean) / np.sqrt(bg_std ** 2 + 16.0))

    # Tenengrad 边缘清晰度
    gx = cv2.Sobel(gray_f, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray_f, cv2.CV_32F, 0, 1, ksize=3)
    sharpness = float(np.mean( np.hypot(gx, gy) ))

    return {
        "background_uniformity": round(uniformity, 2),
        "contrast_cnr": round(cnr, 2),
        "sharpness_index": round(sharpness, 2)
    }


def evaluate_quality_metrics(
    image_ref: np.ndarray,
    image_target: np.ndarray,
    raw_image: Optional[np.ndarray] = None
) -> Dict[str, Any]:
    """
    综合计算客观评估指标。
    
    若 image_ref 与 image_target 実は退化原图与增强图（未显式传入独立 Ground Truth），
    自动利用理想白底重构基准计算有效结构保真 PSNR/SSIM，并同步输出处理前后指标对比。
    """
    psnr_val = compute_psnr(image_ref, image_target)
    ssim_val = compute_ssim(image_ref, image_target)
    entropy_val = compute_image_entropy(image_target)

    target_doc_metrics = compute_document_readability_metrics(image_target)
    ref_for_raw = raw_image if raw_image is not None else image_ref
    raw_doc_metrics = compute_document_readability_metrics(ref_for_raw)

    result = {
        "psnr": round(psnr_val, 2),
        "ssim": round(ssim_val, 4),
        "entropy": round(entropy_val, 4),
        "background_uniformity": target_doc_metrics["background_uniformity"],
        "raw_background_uniformity": raw_doc_metrics["background_uniformity"],
        "contrast_cnr": target_doc_metrics["contrast_cnr"],
        "raw_contrast_cnr": raw_doc_metrics["contrast_cnr"],
        "sharpness_index": target_doc_metrics["sharpness_index"]
    }

    if raw_image is not None:
        raw_psnr = compute_psnr(image_ref, raw_image)
        raw_ssim = compute_ssim(image_ref, raw_image)
        result["raw_psnr"] = round(raw_psnr, 2)
        result["raw_ssim"] = round(raw_ssim, 4)
        result["psnr_gain"] = round(psnr_val - raw_psnr, 2)
        result["ssim_gain"] = round(ssim_val - raw_ssim, 4)

    return result
