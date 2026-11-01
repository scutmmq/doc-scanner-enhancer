"""
命令行全流程批处理与单步调试工具 (DocScanner-Enhancer CLI)
华南理工大学《数字图像处理》课程设计 · 课题一
支持自动化测试单张或批量手机文档图像，生成分步阶段图、客观指标与 OCR 对比报告。
"""

import os
import argparse
import json
import cv2
import numpy as np

from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics
from src.evaluation.ocr_evaluator import OCREvaluator


def parse_args():
    parser = argparse.ArgumentParser(description="手机文档扫描与可读性增强系统 CLI")
    parser.add_argument("--input", "-i", type=str, required=True, help="输入图片路径或文件夹")
    parser.add_argument("--output-dir", "-o", type=str, default="data/outputs", help="输出保存目录")
    parser.add_argument("--mode", type=str, choices=["binary", "color"], default="binary", help="输出模式")
    parser.add_argument("--gt-text", type=str, default=None, help="文档的标准真实文本 (Ground Truth)")
    parser.add_argument("--save-stages", action="store_true", default=True, help="是否保存各阶段过程图")
    parser.add_argument("--skip-ocr", action="store_true", default=False, help="跳过 OCR 识别")
    return parser.parse_args()


def process_single_image(
    image_path: str,
    output_dir: str,
    output_mode: str = "binary",
    gt_text: str = None,
    save_stages: bool = True,
    perform_ocr: bool = True
):
    print(f"\n=======================================================")
    print(f"🚀 开始处理图像: {image_path}")
    print(f"=======================================================")
    
    raw_img = cv2.imread(image_path)
    if raw_img is None:
        print(f"[错误] 无法读取图片: {image_path}")
        return

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    sample_out_dir = os.path.join(output_dir, base_name)
    os.makedirs(sample_out_dir, exist_ok=True)

    config = PipelineConfig(output_mode=output_mode)
    pipeline = DocumentScannerPipeline(config=config)

    res = pipeline.process(raw_img, collect_stages=save_stages, perform_ocr=perform_ocr)
    final_img = res["final_image"]

    # 1. 保存最终图
    final_path = os.path.join(sample_out_dir, f"{base_name}_enhanced.png")
    cv2.imwrite(final_path, final_img)
    print(f"✅ 最终高清可读文档已保存至: {final_path}")

    # 2. 保存各阶段中间过程图
    if save_stages:
        for stage in res["stages"]:
            s_name = f"stage{stage.stage_id}_{stage.stage_name}"
            stage_path = os.path.join(sample_out_dir, f"{s_name}.png")
            cv2.imwrite(stage_path, stage.output_image)
            print(f"  [阶段 {stage.stage_id}] {stage.stage_name} 耗时: {stage.elapsed_ms}ms -> {os.path.basename(stage_path)}")

            # 保存阶段诊断图（如频域频谱图、背景估计场等）
            for diag_k, diag_v in stage.diagnostic_images.items():
                diag_path = os.path.join(sample_out_dir, f"stage{stage.stage_id}_diag_{diag_k}.png")
                cv2.imwrite(diag_path, diag_v)

    # 3. 计算客观指标与 OCR 对比
    metrics = evaluate_quality_metrics(raw_img, final_img)
    print("\n📊 客观图像质量评价:")
    print(f"  • PSNR (峰值信噪比): {metrics['psnr']} dB")
    print(f"  • SSIM (结构相似度): {metrics['ssim']}")
    print(f"  • 信息熵 (Entropy): {metrics['entropy']}")

    ocr_report = {}
    if perform_ocr:
        print("\n🔍 下游 RapidOCR 量化对比:")
        ocr_report = OCREvaluator.evaluate_comparison(raw_img, final_img, ground_truth_text=gt_text)
        raw_chars = ocr_report["raw"]["char_count"]
        enh_chars = ocr_report["enhanced"]["char_count"]
        print(f"  • 原始图识别字符数: {raw_chars}")
        print(f"  • 增强后识别字符数: {enh_chars}")

        if "accuracy_comparison" in ocr_report:
            comp = ocr_report["accuracy_comparison"]
            print(f"  • 原始图识别准确率: {comp['raw_accuracy']}%")
            print(f"  • 增强后识别准确率: {comp['enhanced_accuracy']}%")
            print(f"  🎯 准确率净增益 (+Δ): +{comp['accuracy_improvement']}%")
        elif "relative_gain" in ocr_report:
            print(f"  🎯 字符检出增益: +{ocr_report['relative_gain']['char_gain_percentage']}%")

    # 4. 生成 Markdown 与 JSON 报告
    summary = {
        "image_file": os.path.basename(image_path),
        "total_elapsed_ms": res["total_elapsed_ms"],
        "metrics": metrics,
        "ocr_report": ocr_report
    }
    json_path = os.path.join(sample_out_dir, "evaluation_report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n📑 评测报告已保存至: {json_path}")


def main():
    args = parse_args()
    if os.path.isdir(args.input):
        valid_exts = [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]
        files = [os.path.join(args.input, f) for f in os.listdir(args.input)
                 if os.path.splitext(f)[1].lower() in valid_exts]
        for f in files:
            process_single_image(
                f, args.output_dir, args.mode, args.gt_text,
                args.save_stages, not args.skip_ocr
            )
    else:
        process_single_image(
            args.input, args.output_dir, args.mode, args.gt_text,
            args.save_stages, not args.skip_ocr
        )


if __name__ == "__main__":
    main()
