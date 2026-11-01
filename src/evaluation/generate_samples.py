"""
测试样本与真实退化场景合成生成器 (Benchmark Dataset Generator)
生成带有不同退化类型 (透视倾斜、阴影、摩尔网纹、散焦模糊) 的文档图像及标准地面真值 (Ground Truth)。
"""

import os
from typing import Tuple
import cv2
import numpy as np

def create_base_document(width=700, height=900) -> Tuple[np.ndarray, str]:
    """生成一张标准的高清清晰文档图与文本标注"""
    doc = np.full((height, width, 3), 250, dtype=np.uint8)
    
    # 绘制文档标题与边框
    cv2.rectangle(doc, (40, 40), (width - 40, height - 40), (220, 220, 220), 1)
    
    # 模拟真实发票/文档内容
    texts = [
        "SOUTH CHINA UNIVERSITY OF TECHNOLOGY",
        "DIGITAL IMAGE PROCESSING COURSE DESIGN",
        "PROJECT 1: DOCUMENT SCANNER & ENHANCER",
        "--------------------------------------------------",
        "STUDENT NAME: MO MINGQIN",
        "INSTRUCTOR: PROF. WO YAN",
        "ALGORITHM PIPELINE VERIFICATION SUITE",
        "STAGE 1: PERSPECTIVE RECTIFICATION",
        "STAGE 2: LUMINANCE DECOUPLING (HSV/YCBCR)",
        "STAGE 3: SHADOW REMOVAL VIA RETINEX DIVISION",
        "STAGE 4: 2D-FFT GAUSSIAN NOTCH FILTERING",
        "STAGE 5: WIENER DECONVOLUTION RESTORATION",
        "STAGE 6: SAUVOLA LOCAL ADAPTIVE BINARIZATION",
        "STAGE 7: RAPIDOCR RECOGNITION BENCHMARK",
        "--------------------------------------------------",
        "FINAL QUALITY SCORE: PSNR > 30DB, SSIM > 0.90",
        "STATUS: FULLY VERIFIED & BENCHMARKED"
    ]
    
    y = 100
    for line in texts:
        cv2.putText(doc, line, (60, y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (30, 30, 30), 2, cv2.LINE_AA)
        y += 45
        
    gt_text = "\n".join(texts)
    return doc, gt_text


def apply_perspective_distortion(img: np.ndarray) -> np.ndarray:
    """施加仿射/透视倾斜"""
    h, w = img.shape[:2]
    canvas = np.full((h + 100, w + 100, 3), 40, dtype=np.uint8)  # 桌面背景
    
    pts_src = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
    pts_dst = np.array([
        [60, 40],
        [w + 40, 80],
        [w - 20, h + 60],
        [40, h + 20]
    ], dtype=np.float32)
    
    M = cv2.getPerspectiveTransform(pts_src, pts_dst)
    warped = cv2.warpPerspective(img, M, (w + 100, h + 100), borderValue=(40, 40, 40))
    return warped


def apply_shadow(img: np.ndarray) -> np.ndarray:
    """施加非均匀光照与强烈手影遮挡"""
    h, w = img.shape[:2]
    # 构造非均匀椭圆/斜线阴影
    y, x = np.ogrid[:h, :w]
    # 模拟左上到右下的强烈光照衰减
    grad = (0.35 + 0.65 * (x + y) / (w + h)).astype(np.float32)
    
    # 模拟手部投下的弧形黑影
    shadow_mask = np.ones((h, w), dtype=np.float32)
    cv2.ellipse(shadow_mask, (int(w * 0.4), int(h * 0.5)), (int(w * 0.35), int(h * 0.25)), -30, 0, 360, 0.35, -1)
    shadow_mask = cv2.GaussianBlur(shadow_mask, (51, 51), 0)
    
    total_attenuation = grad * shadow_mask
    total_attenuation = np.clip(total_attenuation, 0.2, 1.0)
    
    shadowed = (img.astype(np.float32) * total_attenuation[:, :, np.newaxis]).astype(np.uint8)
    return shadowed


def apply_moire_grid(img: np.ndarray) -> np.ndarray:
    """施加周期性高频屏幕翻拍网纹/摩尔纹"""
    h, w = img.shape[:2]
    x = np.arange(w)
    y = np.arange(h)
    xx, yy = np.meshgrid(x, y)
    
    # 两个方向的正弦周期性高频条纹
    grid = 25 * np.sin(2 * np.pi * xx / 6.0) + 20 * np.cos(2 * np.pi * yy / 6.0)
    moire_img = np.clip(img.astype(np.float32) + grid[:, :, np.newaxis], 0, 255).astype(np.uint8)
    return moire_img


def apply_defocus_blur(img: np.ndarray, radius=4) -> np.ndarray:
    """施加散焦模糊"""
    kernel_size = radius * 2 + 1
    kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
    cv2.circle(kernel, (radius, radius), radius, 1.0, -1)
    kernel /= np.sum(kernel)
    return cv2.filter2D(img, -1, kernel)


def generate_benchmark_samples(out_dir="data/samples", gt_dir="data/ground_truth"):
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(gt_dir, exist_ok=True)
    
    base_doc, gt_text = create_base_document()
    
    # 保存 Ground Truth
    cv2.imwrite(os.path.join(gt_dir, "standard_doc_gt.png"), base_doc)
    with open(os.path.join(gt_dir, "standard_doc_gt.txt"), "w", encoding="utf-8") as f:
        f.write(gt_text)
        
    # 样本 1: 强烈手影与光照不均
    sample1 = apply_shadow(base_doc)
    cv2.imwrite(os.path.join(out_dir, "test1_shadow.png"), sample1)
    
    # 样本 2: 屏幕翻拍周期性摩尔网纹
    sample2 = apply_moire_grid(base_doc)
    cv2.imwrite(os.path.join(out_dir, "test2_moire.png"), sample2)
    
    # 样本 3: 散焦模糊文档
    sample3 = apply_defocus_blur(base_doc, radius=3)
    cv2.imwrite(os.path.join(out_dir, "test3_defocus.png"), sample3)
    
    # 样本 4: 综合复杂退化 (透视倾斜 + 阴影 + 摩尔纹)
    sample4 = apply_perspective_distortion(apply_shadow(apply_moire_grid(base_doc)))
    cv2.imwrite(os.path.join(out_dir, "test4_complex_degraded.png"), sample4)
    
    print("✅ 真实退化测试样本库生成完毕:")
    print("  • data/samples/test1_shadow.png")
    print("  • data/samples/test2_moire.png")
    print("  • data/samples/test3_defocus.png")
    print("  • data/samples/test4_complex_degraded.png")
    print("  • data/ground_truth/standard_doc_gt.png & .txt")

if __name__ == "__main__":
    generate_benchmark_samples()
