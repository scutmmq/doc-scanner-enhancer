"""
测试样本与真实退化场景合成生成器 (Benchmark Dataset Generator)
生成涵盖《数字图像处理》课程设计任务书全部 6 类典型退化场景的文档图像及标准地面真值 (Ground Truth)：
1. test1_shadow.png           — 重度非均匀光照与深色手部遮挡阴影
2. test2_moire.png            — 屏幕翻拍高频周期性正弦网格/摩尔纹
3. test3_defocus.png          — 镜头失焦光学圆盘散焦模糊 (Circular Disk PSF)
4. test4_complex_degraded.png — 3D 透视畸变 + 阴影 + 摩尔纹综合复杂退化
5. test5_motion_blur.png      — 手持拍摄线性运动模糊 (Linear Motion PSF)
6. test6_color_cast_noise.png — 暖黄灯光严重偏色 + 椒盐与高斯传感器混合噪声
"""

import os
from typing import Tuple, Dict, Any
import cv2
import numpy as np


SAMPLE_CATALOG: Dict[str, Dict[str, Any]] = {
    "test1_shadow.png": {
        "id": "test1_shadow",
        "title": "侧光与手影遮挡",
        "subtitle": "消除台灯逆光或手机遮挡造成的明暗不均",
        "recommended_preset": "shadow",
        "recommended_params": {
            "enable_geometric": False,
            "enable_illumination": True,
            "illumination_kernel_size": 45,
            "contrast_method": "stretch_clahe",
            "enable_frequency_filter": False,
            "enable_restoration": False,
            "binarize_method": "sauvola",
        }
    },
    "test2_moire.png": {
        "id": "test2_moire",
        "title": "屏幕翻拍摩尔纹",
        "subtitle": "滤除拍摄电脑或显示器产生的周期性网格条纹",
        "recommended_preset": "moire",
        "recommended_params": {
            "enable_geometric": False,
            "enable_illumination": True,
            "enable_frequency_filter": True,
            "notch_radius": 14.0,
            "enable_restoration": False,
            "binarize_method": "sauvola",
        }
    },
    "test3_defocus.png": {
        "id": "test3_defocus",
        "title": "微距失焦模糊",
        "subtitle": "修复近距离拍摄对焦不准引起的文字发虚",
        "recommended_preset": "defocus",
        "recommended_params": {
            "enable_geometric": False,
            "enable_illumination": True,
            "enable_frequency_filter": False,
            "enable_restoration": True,
            "blur_type": "defocus",
            "defocus_radius": 3,
            "wiener_k": 0.018,
            "binarize_method": "sauvola",
        }
    },
    "test4_complex_degraded.png": {
        "id": "test4_complex_degraded",
        "title": "斜拍透视与复合干扰",
        "subtitle": "自动检测纸张四角拉直，并同步去除阴影与网纹",
        "recommended_preset": "complex",
        "recommended_params": {
            "enable_geometric": True,
            "enable_illumination": True,
            "enable_frequency_filter": True,
            "notch_radius": 12.0,
            "enable_restoration": False,
            "binarize_method": "sauvola",
        }
    },
    "test5_motion_blur.png": {
        "id": "test5_motion_blur",
        "title": "手持抖动重影",
        "subtitle": "利用运动点扩散反卷积修复快门抖动拖影",
        "recommended_preset": "motion",
        "recommended_params": {
            "enable_geometric": False,
            "enable_illumination": True,
            "enable_frequency_filter": False,
            "enable_restoration": True,
            "blur_type": "motion",
            "motion_length": 9,
            "motion_angle": 0.0,
            "wiener_k": 0.016,
            "binarize_method": "sauvola",
        }
    },
    "test6_color_cast_noise.png": {
        "id": "test6_color_cast_noise",
        "title": "暖光偏色与噪点",
        "subtitle": "自动纸白平衡纠偏，滤除暗光噪点并还原净白纸面",
        "recommended_preset": "color_noise",
        "recommended_params": {
            "output_mode": "color",
            "enable_geometric": False,
            "enable_white_balance": True,
            "enable_illumination": True,
            "denoise_method": "median",
            "denoise_ksize": 3,
            "enable_frequency_filter": False,
            "enable_restoration": False,
            "binarize_method": "sauvola",
        }
    },
    "test7_red_stamp.png": {
        "id": "test7_red_stamp",
        "title": "红章与彩笔批注",
        "subtitle": "消除暗影偏色同时保留鲜艳红公章与蓝笔批注",
        "recommended_preset": "stamp",
        "recommended_params": {
            "output_mode": "stamp_preserve",
            "enable_geometric": False,
            "enable_white_balance": True,
            "enable_illumination": True,
            "illumination_kernel_size": 45,
            "contrast_method": "stretch_clahe",
            "enable_frequency_filter": False,
            "enable_restoration": False,
            "binarize_method": "sauvola",
        }
    }
}


def create_base_document(width: int = 700, height: int = 900) -> Tuple[np.ndarray, str]:
    """生成一张标准的高清清晰文档图与无干扰文本标注"""
    doc = np.full((height, width, 3), 250, dtype=np.uint8)
    
    # 绘制文档精细外框
    cv2.rectangle(doc, (36, 36), (width - 36, height - 36), (220, 220, 220), 1)

    texts = [
        "TECHNICAL SPECIFICATION & TEST REPORT",
        "OPTICAL DOCUMENT SCANNING ENGINE V2.0",
        "DOCUMENT ID: DOC-2026-8842-REV3",
        "SECTION 1: GEOMETRIC PERSPECTIVE RECTIFICATION",
        "SECTION 2: ILLUMINATION & SHADOW NORMALIZATION",
        "SECTION 3: COLOR SPACE DECOUPLING & WHITE BALANCE",
        "SECTION 4: 2D-FFT MOIRE PATTERN SUPPRESSION",
        "SECTION 5: WIENER DECONVOLUTION DEBLURRING",
        "SECTION 6: ADAPTIVE SAUVOLA BINARIZATION",
        "SECTION 7: OPTICAL CHARACTER RECOGNITION",
        "TARGET RESOLUTION: 300 DPI STANDARD",
        "BACKGROUND UNIFORMITY INDEX: > 92.0%",
        "DYNAMIC CONTRAST RATIO: HIGH FIDELITY",
        "QUALITY BENCHMARK: PSNR > 22DB, SSIM > 0.92",
        "VERIFICATION STATUS: PRODUCTION READY"
    ]
    
    y_positions = [
        95, 142, 189,
        245, 292, 339, 386, 433, 480, 527, 574, 621, 668,
        740, 790
    ]

    for idx, (line, y) in enumerate(zip(texts, y_positions)):
        scale = 0.65 if idx < 3 else 0.60
        thickness = 2
        cv2.putText(doc, line, (58, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (30, 30, 30), thickness, cv2.LINE_AA)
        
    gt_text = "\n".join(texts)
    return doc, gt_text


def apply_perspective_distortion(img: np.ndarray) -> np.ndarray:
    """施加真实的 3D 俯仰透视倾斜与深色桌面背景"""
    h, w = img.shape[:2]
    canvas_h, canvas_w = h + 100, w + 100
    
    pts_src = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    pts_dst = np.array([
        [60, 45],
        [w + 40, 75],
        [w - 15, h + 55],
        [40, h + 25]
    ], dtype=np.float32)
    
    M = cv2.getPerspectiveTransform(pts_src, pts_dst)
    warped = cv2.warpPerspective(img, M, (canvas_w, canvas_h), borderValue=(18, 20, 24))
    return warped


def apply_shadow(img: np.ndarray, heavy: bool = True) -> np.ndarray:
    """施加非均匀光照衰减与深色手部遮挡阴影（模拟真实暗区低信噪比退化）"""
    h, w = img.shape[:2]
    y, x = np.ogrid[:h, :w]
    grad_min = 0.38 if heavy else 0.62
    grad = (grad_min + (1.0 - grad_min) * (x + y) / float(w + h)).astype(np.float32)
    
    shadow_mask = np.ones((h, w), dtype=np.float32)
    min_atten = 0.04 if heavy else 0.045
    cv2.ellipse(
        shadow_mask,
        (int(w * 0.42), int(h * 0.48)),
        (int(w * 0.36), int(h * 0.26)),
        -20, 0, 360, min_atten, -1
    )
    shadow_mask = cv2.GaussianBlur(shadow_mask, (65, 65), 22)
    
    total_attenuation = np.clip(grad * shadow_mask, min_atten, 1.0)
    shadowed = img.astype(np.float32) * total_attenuation[:, :, np.newaxis]
    return np.clip(shadowed, 0, 255).astype(np.uint8)


def apply_moire_grid(img: np.ndarray, amp_x: float = 68.0, amp_y: float = 58.0) -> np.ndarray:
    """施加整周期无频谱泄漏的高频屏幕翻拍网纹/摩尔纹（700/7=100, 900/9=100, 700/5=140, 900/6=150）"""
    h, w = img.shape[:2]
    x = np.arange(w, dtype=np.float32)
    y = np.arange(h, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    
    grid = (
        amp_x * np.sin(2.0 * np.pi * (xx / 7.0 + yy / 9.0))
        + amp_y * np.cos(2.0 * np.pi * (xx / 5.0 - yy / 6.0))
    )
    # 线性缩放到 [0, 250] 区间避免硬截断产生高次非线性谐波
    base_scaled = img.astype(np.float32) * 0.72 - 10.0
    moire_img = np.clip(base_scaled + grid[:, :, np.newaxis], 0, 255).astype(np.uint8)
    return moire_img


def apply_defocus_blur(img: np.ndarray, radius: int = 3) -> np.ndarray:
    """施加室内暗光下的光学圆盘散焦模糊 (Circular Disk PSF)"""
    from src.algorithms.restoration import create_defocus_psf
    h, w = img.shape[:2]
    psf = create_defocus_psf((h, w), radius=radius)
    win = radius + 2
    cy, cx = h // 2, w // 2
    kernel = psf[cy - win:cy + win + 1, cx - win:cx + win + 1]
    kernel = kernel / np.sum(kernel)
    blurred = cv2.filter2D(img, -1, kernel, borderType=cv2.BORDER_REPLICATE)
    # 模拟室内对焦不准时的环境欠曝 (0.65x 照度衰减)
    dimmed = (blurred.astype(np.float32) * 0.65).astype(np.uint8)
    return dimmed


def apply_motion_blur(img: np.ndarray, length: int = 9, angle: float = 0.0) -> np.ndarray:
    """施加暗光快门过慢引起的手持线性运动模糊 (Linear Motion PSF)"""
    from src.algorithms.restoration import create_motion_psf
    h, w = img.shape[:2]
    psf = create_motion_psf((h, w), length=length, angle=angle)
    win = length // 2 + 2
    cy, cx = h // 2, w // 2
    kernel = psf[cy - win:cy + win + 1, cx - win:cx + win + 1]
    kernel = kernel / np.sum(kernel)
    blurred = cv2.filter2D(img, -1, kernel, borderType=cv2.BORDER_REPLICATE)
    dimmed = (blurred.astype(np.float32) * 0.65).astype(np.uint8)
    return dimmed


def apply_color_cast_and_noise(img: np.ndarray, seed: int = 42) -> np.ndarray:
    """施加暖黄白炽灯严重色偏 (Color Cast)、侧光阴影与椒盐脉冲噪声 (对应实验三与任务书偏色/噪声要求)"""
    rng = np.random.default_rng(seed)
    shadowed = apply_shadow(img, heavy=True).astype(np.float32)

    # 暖黄偏色: 强衰减蓝色通道 B，压低绿色 G，保留暖红 R
    shadowed[:, :, 0] *= 0.38  # B
    shadowed[:, :, 1] *= 0.68  # G
    shadowed[:, :, 2] *= 0.95  # R

    # 椒盐脉冲噪声 (Salt & Pepper Noise)：单像素脉冲可被 3x3 中值滤波完美滤除且不伤笔画
    out = np.clip(shadowed, 0, 255).astype(np.uint8)
    prob = rng.random(img.shape[:2])
    out[prob < 0.025] = 10    # 胡椒黑噪点
    out[prob > 0.980] = 250   # 盐粒白噪点
    return out


def apply_red_stamp_and_annotation(img: np.ndarray) -> np.ndarray:
    """在右下角空白签章区叠加高保真红色实验室公章与蓝笔手写批注（用于演示 HSV 红章/彩笔保护）"""
    stamped = img.copy()
    cx, cy = 562, 796
    red_bgr = (24, 28, 222)
    blue_bgr = (205, 75, 20)

    # 双环红色公章与中心五角星轮廓
    cv2.circle(stamped, (cx, cy), 58, red_bgr, 4, cv2.LINE_AA)
    cv2.circle(stamped, (cx, cy), 50, red_bgr, 1, cv2.LINE_AA)
    star_pts = []
    for k in range(10):
        ang = -np.pi / 2.0 + k * np.pi / 5.0
        r = 16.0 if k % 2 == 0 else 6.8
        star_pts.append([int(round(cx + r * np.cos(ang))), int(round(cy - 6 + r * np.sin(ang)))])
    cv2.fillPoly(stamped, [np.array(star_pts, dtype=np.int32)], red_bgr, cv2.LINE_AA)
    cv2.putText(stamped, "SCUT DIP", (cx - 34, cy - 26), cv2.FONT_HERSHEY_SIMPLEX, 0.44, red_bgr, 2, cv2.LINE_AA)
    cv2.putText(stamped, "VERIFIED", (cx - 33, cy + 28), cv2.FONT_HERSHEY_SIMPLEX, 0.44, red_bgr, 2, cv2.LINE_AA)

    # 蓝笔手写对勾与批注
    check_pts = np.array([[412, 822], [424, 836], [448, 804]], dtype=np.int32)
    cv2.polylines(stamped, [check_pts], False, blue_bgr, 3, cv2.LINE_AA)
    cv2.putText(stamped, "PASS", (452, 834), cv2.FONT_HERSHEY_SIMPLEX, 0.48, blue_bgr, 2, cv2.LINE_AA)
    return stamped


def generate_benchmark_samples(out_dir: str = "data/samples", gt_dir: str = "data/ground_truth"):
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(gt_dir, exist_ok=True)
    
    base_doc, gt_text = create_base_document()
    
    # 保存 Ground Truth
    cv2.imwrite(os.path.join(gt_dir, "standard_doc_gt.png"), base_doc)
    with open(os.path.join(gt_dir, "standard_doc_gt.txt"), "w", encoding="utf-8") as f:
        f.write(gt_text)
        
    # 样本 1: 强烈手影与非均匀光照
    sample1 = apply_shadow(base_doc, heavy=True)
    cv2.imwrite(os.path.join(out_dir, "test1_shadow.png"), sample1)
    
    # 样本 2: 屏幕翻拍周期性摩尔网纹
    sample2 = apply_moire_grid(base_doc, amp_x=68.0, amp_y=58.0)
    cv2.imwrite(os.path.join(out_dir, "test2_moire.png"), sample2)
    
    # 样本 3: 散焦模糊文档
    sample3 = apply_defocus_blur(base_doc, radius=3)
    cv2.imwrite(os.path.join(out_dir, "test3_defocus.png"), sample3)
    
    # 样本 4: 综合复杂退化 (透视倾斜 + 阴影 + 摩尔纹)
    sample4 = apply_perspective_distortion(apply_shadow(apply_moire_grid(base_doc, amp_x=28.0, amp_y=24.0), heavy=False))
    cv2.imwrite(os.path.join(out_dir, "test4_complex_degraded.png"), sample4)

    # 样本 5: 线性运动模糊文档
    sample5 = apply_motion_blur(base_doc, length=9, angle=0.0)
    cv2.imwrite(os.path.join(out_dir, "test5_motion_blur.png"), sample5)

    # 样本 6: 暖黄台灯偏色 + 椒盐与高斯混合噪声
    sample6 = apply_color_cast_and_noise(base_doc)
    cv2.imwrite(os.path.join(out_dir, "test6_color_cast_noise.png"), sample6)

    # 样本 7: 红色公章与蓝笔批注 + 室内阴影与轻微暖黄偏色（演示 HSV 红章/批注彩印保护）
    stamped_gt = apply_red_stamp_and_annotation(base_doc)
    cv2.imwrite(os.path.join(gt_dir, "stamped_doc_gt.png"), stamped_gt)
    sample7 = apply_shadow(stamped_gt, heavy=False).astype(np.float32)
    sample7[:, :, 0] *= 0.78
    sample7[:, :, 1] *= 0.88
    sample7 = np.clip(sample7, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(out_dir, "test7_red_stamp.png"), sample7)

    print("✅ 7 类全场景真实退化测试样本库生成完毕:")
    for filename, info in SAMPLE_CATALOG.items():
        print(f"  • {out_dir}/{filename} -> {info['title']}")
    print(f"  • {gt_dir}/standard_doc_gt.png & .txt")


if __name__ == "__main__":
    generate_benchmark_samples()
