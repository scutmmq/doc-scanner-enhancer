"""
图像采样、量化与分辨率对 OCR 可读性影响分析模块 (Sampling & Quantization Analysis)
对应《数字图像处理》课程设计任务书课题一第 1 项核心要求：
“分析图像采样、量化、分辨率对 OCR 可读性的影响”（Gonzalez 第四版 2.4 节）。

纯传统数字图像处理实现：
1. 空间下采样与等效打印/扫描分辨率 (DPI) 退化模拟；
2. 幅度均匀量化 (8-bit 256 级 -> 1-bit 2 级，伪轮廓效应 False Contouring 分析)；
3. 采样率与量化级数对 PSNR、SSIM 及下游 OCR 识别准确率 (CER) 的系统化消融分析曲线。
"""

from typing import Tuple, Dict, Any, List, Optional
import numpy as np
import cv2


def simulate_spatial_sampling(
    image: np.ndarray,
    scale_factor: float = 0.5,
    base_dpi: int = 300,
    interpolation_up: str = "nearest"
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    模拟图像空间采样率（分辨率 DPI）变化。
    
    数学模型:
        对连续或高分辨率离散图像 f(x, y) 按采样间隔 (Delta_x, Delta_y) = (1/s, 1/s) 进行抽取，
        再零阶保持（最近邻）或一阶保持（双线性）重建至原图物理尺寸以便直观观察空间混叠与马赛克效应。
    """
    h, w = image.shape[:2]
    s = float(np.clip(scale_factor, 0.10, 1.0))
    if s >= 0.999:
        return image.copy(), {
            "scale_factor": 1.0,
            "effective_dpi": base_dpi,
            "sampled_resolution": f"{w}x{h}"
        }

    target_w = max(16, int(round(w * s)))
    target_h = max(16, int(round(h * s)))

    # 下采样抽取
    downsampled = cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_AREA)

    # 重建至原物理画幅供对比与评测
    up_flag = cv2.INTER_NEAREST if interpolation_up == "nearest" else cv2.INTER_LINEAR
    reconstructed = cv2.resize(downsampled, (w, h), interpolation=up_flag)

    return reconstructed, {
        "scale_factor": round(s, 2),
        "effective_dpi": int(round(base_dpi * s)),
        "sampled_resolution": f"{target_w}x{target_h}"
    }


def simulate_gray_quantization(
    image: np.ndarray,
    bits: int = 4
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    模拟图像灰度级均匀量化 (Uniform Intensity Quantization)。
    
    数学模型:
        设量化位数为 b in [1, 8]，则离散灰度级数 L = 2^b。
        量化步长 q = 256 / L，量化映射:
        I_q(x, y) = floor(I(x, y) / q) * (255 / (L - 1))
    """
    b = int(np.clip(bits, 1, 8))
    levels = 1 << b  # 2^b
    if b == 8:
        return image.copy(), {"bits": 8, "levels": 256}

    img_f = image.astype(np.float32)
    step = 256.0 / float(levels)
    quantized_idx = np.floor(img_f / step)
    quantized_idx = np.clip(quantized_idx, 0, levels - 1)
    quantized = np.round(quantized_idx * (255.0 / float(levels - 1))).astype(np.uint8)

    return quantized, {"bits": b, "levels": levels}


def apply_sampling_and_quantization(
    image: np.ndarray,
    scale_factor: float = 1.0,
    bits: int = 8,
    base_dpi: int = 300
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    同时施加空间采样率调整与幅度灰度级量化。
    """
    sampled_img, s_meta = simulate_spatial_sampling(image, scale_factor=scale_factor, base_dpi=base_dpi)
    quant_img, q_meta = simulate_gray_quantization(sampled_img, bits=bits)
    meta = {**s_meta, **q_meta}
    return quant_img, meta


def run_sampling_quantization_sweep(
    image: np.ndarray,
    gt_text: Optional[str] = None,
    perform_ocr: bool = True
) -> Dict[str, List[Dict[str, Any]]]:
    """
    执行系统化的“分辨率采样消融实验”与“量化位数消融实验”，
    直接生成可供前端可视化折线图与课程设计报告表格使用的定量数据。
    """
    from src.evaluation.metrics import compute_psnr, compute_ssim, compute_image_entropy
    from src.evaluation.ocr_evaluator import OCREvaluator

    if len(image.shape) == 3:
        base_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        base_gray = image.copy()

    # 若未提供外部 gt_text，则以原高清图的 OCR 识别结果作为基准参照文本
    ref_text = gt_text
    if perform_ocr and not ref_text:
        ref_text, _ = OCREvaluator.extract_text(base_gray)

    # 1. 空间采样率（分辨率 DPI）梯度实验 (固定 8-bit 量化)
    sampling_scales = [1.0, 0.75, 0.50, 0.35, 0.25]
    sampling_curve = []
    for s in sampling_scales:
        sim_img, meta = simulate_spatial_sampling(base_gray, scale_factor=s, base_dpi=300)
        psnr_val = compute_psnr(base_gray, sim_img)
        ssim_val = compute_ssim(base_gray, sim_img)
        ocr_acc = 100.0
        char_cnt = 0
        if perform_ocr:
            pred_text, _ = OCREvaluator.extract_text(sim_img)
            char_cnt = len("".join(pred_text.split()))
            if ref_text:
                acc_info = OCREvaluator.calculate_text_accuracy(ref_text, pred_text)
                ocr_acc = acc_info["accuracy"]
        sampling_curve.append({
            "scale_factor": meta["scale_factor"],
            "effective_dpi": meta["effective_dpi"],
            "resolution": meta["sampled_resolution"],
            "psnr": round(psnr_val, 2),
            "ssim": round(ssim_val, 4),
            "ocr_accuracy": round(ocr_acc, 2),
            "char_count": char_cnt
        })

    # 2. 灰度量化位数梯度实验 (固定 100% 300 DPI 采样率)
    bit_depths = [8, 6, 4, 3, 2, 1]
    quantization_curve = []
    for b in bit_depths:
        q_img, meta = simulate_gray_quantization(base_gray, bits=b)
        psnr_val = compute_psnr(base_gray, q_img)
        ssim_val = compute_ssim(base_gray, q_img)
        entropy_val = compute_image_entropy(q_img)
        ocr_acc = 100.0
        char_cnt = 0
        if perform_ocr:
            pred_text, _ = OCREvaluator.extract_text(q_img)
            char_cnt = len("".join(pred_text.split()))
            if ref_text:
                acc_info = OCREvaluator.calculate_text_accuracy(ref_text, pred_text)
                ocr_acc = acc_info["accuracy"]
        quantization_curve.append({
            "bits": meta["bits"],
            "levels": meta["levels"],
            "psnr": round(psnr_val, 2),
            "ssim": round(ssim_val, 4),
            "entropy": round(entropy_val, 4),
            "ocr_accuracy": round(ocr_acc, 2),
            "char_count": char_cnt
        })

    return {
        "sampling_sweep": sampling_curve,
        "quantization_sweep": quantization_curve
    }

