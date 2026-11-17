"""
命令行全流程批处理与单步调试工具 (DocScanner-Enhancer CLI)
华南理工大学《数字图像处理》课程设计 · 课题一
支持自动化测试单张或批量手机文档图像，生成分步阶段图、诊断图、客观指标与 OCR 汇总对比表。
"""

import os
import argparse
import json
from typing import Optional, Dict, Any, List
import cv2
import numpy as np

from src.pipeline import DocumentScannerPipeline, PipelineConfig
from src.evaluation.metrics import evaluate_quality_metrics
from src.evaluation.ocr_evaluator import OCREvaluator
from src.evaluation.generate_samples import SAMPLE_CATALOG


def parse_args():
    parser = argparse.ArgumentParser(description="手机文档扫描与可读性增强系统 CLI")
    parser.add_argument("--input", "-i", type=str, required=True, help="输入图片路径或文件夹")
    parser.add_argument("--output-dir", "-o", type=str, default="data/outputs", help="输出保存目录")
    parser.add_argument("--mode", type=str, choices=["binary", "color", "gray"], default=None, help="输出模式")
    parser.add_argument("--gt-text", type=str, default=None, help="文档的标准真实文本或路径 (Ground Truth)")
    parser.add_argument("--gt-image", type=str, default=None, help="标准无损扫描参考图路径 (Ground Truth Image)")
    parser.add_argument("--save-stages", action="store_true", default=True, help="是否保存各阶段过程图")
    parser.add_argument("--skip-ocr", action="store_true", default=False, help="跳过 OCR 识别")
    return parser.parse_args()


def _resolve_ground_truth(
    image_path: str,
    gt_text_arg: Optional[str],
    gt_img_arg: Optional[str]
):
    fname = os.path.basename(image_path)
    gt_text = gt_text_arg
    gt_img = cv2.imread(gt_img_arg) if gt_img_arg and os.path.exists(gt_img_arg) else None

    if fname in SAMPLE_CATALOG:
        default_gt_txt = os.path.join("data", "ground_truth", "standard_doc_gt.txt")
        default_gt_img = os.path.join("data", "ground_truth", "standard_doc_gt.png")
        if gt_text is None and os.path.exists(default_gt_txt):
            with open(default_gt_txt, "r", encoding="utf-8") as f:
                gt_text = f.read()
        if gt_img is None and os.path.exists(default_gt_img):
            gt_img = cv2.imread(default_gt_img)
    elif gt_text and os.path.exists(gt_text):
        with open(gt_text, "r", encoding="utf-8") as f:
            gt_text = f.read()

    return gt_text, gt_img


def process_single_image(
    image_path: str,
    output_dir: str,
    output_mode: Optional[str] = None,
    gt_text: Optional[str] = None,
    gt_image_path: Optional[str] = None,
    save_stages: bool = True,
    perform_ocr: bool = True
) -> Optional[Dict[str, Any]]:
    print(f"\n=======================================================")
    print(f"🚀 开始处理图像: {image_path}")
    print(f"=======================================================")
    
    raw_img = cv2.imread(image_path)
    if raw_img is None:
        print(f"[错误] 无法读取图片: {image_path}")
        return None

    os.makedirs(output_dir, exist_ok=True)
    fname = os.path.basename(image_path)
    base_name = os.path.splitext(fname)[0]
    sample_out_dir = os.path.join(output_dir, base_name)
    os.makedirs(sample_out_dir, exist_ok=True)

    # 若属于内置标准测试集，自动加载对应的最佳推荐参数配置
    preset_params = dict(SAMPLE_CATALOG.get(fname, {}).get("recommended_params", {}))
    if output_mode is not None:
        preset_params["output_mode"] = output_mode
    config = PipelineConfig(**preset_params)
    pipeline = DocumentScannerPipeline(config=config)

    res = pipeline.process(raw_img, collect_stages=save_stages, perform_ocr=perform_ocr)
    final_img = res["final_image"]

    # 1. 保存最终图
    final_path = os.path.join(sample_out_dir, f"{base_name}_enhanced.png")
    cv2.imwrite(final_path, final_img)
    print(f"✅ 最终高清可读文档已保存至: {final_path}")

    # 2. 保存各阶段中间过程图与学术诊断图
    if save_stages:
        for stage in res["stages"]:
            s_name = f"stage{stage.stage_id}_{stage.stage_name}"
            stage_path = os.path.join(sample_out_dir, f"{s_name}.png")
            cv2.imwrite(stage_path, stage.output_image)
            print(f"  [阶段 {stage.stage_id}] {stage.stage_name} 耗时: {stage.elapsed_ms}ms -> {os.path.basename(stage_path)}")

            for diag_k, diag_v in stage.diagnostic_images.items():
                diag_path = os.path.join(sample_out_dir, f"stage{stage.stage_id}_diag_{diag_k}.png")
                cv2.imwrite(diag_path, diag_v)

    # 3. 计算客观指标与 OCR 对比
    resolved_gt_text, resolved_gt_img = _resolve_ground_truth(image_path, gt_text, gt_image_path)
    if resolved_gt_img is not None:
        metrics = evaluate_quality_metrics(resolved_gt_img, final_img, raw_image=raw_img)
    else:
        metrics = evaluate_quality_metrics(res["rectified_raw_image"], final_img, raw_image=raw_img)

    print("\n📊 客观图像质量评价:")
    if "raw_psnr" in metrics:
        print(f"  • PSNR (峰值信噪比): {metrics['raw_psnr']} dB -> {metrics['psnr']} dB (+{metrics['psnr_gain']} dB)")
        print(f"  • SSIM (结构相似度): {metrics['raw_ssim']} -> {metrics['ssim']} (+{metrics['ssim_gain']})")
    else:
        print(f"  • PSNR (峰值信噪比): {metrics['psnr']} dB")
        print(f"  • SSIM (结构相似度): {metrics['ssim']}")
    print(f"  • 纸面均匀度 (Uniformity): {metrics['raw_background_uniformity']}% -> {metrics['background_uniformity']}%")
    print(f"  • 信息熵 (Entropy): {metrics['entropy']}")

    ocr_report = {}
    if perform_ocr:
        print("\n🔍 下游 RapidOCR 量化对比:")
        ocr_report = OCREvaluator.evaluate_comparison(raw_img, final_img, ground_truth_text=resolved_gt_text)
        raw_chars = ocr_report["raw"]["char_count"]
        enh_chars = ocr_report["enhanced"]["char_count"]
        print(f"  • 原始图识别字符数: {raw_chars} (置信度: {ocr_report['raw']['mean_confidence']}%)")
        print(f"  • 增强后识别字符数: {enh_chars} (置信度: {ocr_report['enhanced']['mean_confidence']}%)")

        if "accuracy_comparison" in ocr_report:
            comp = ocr_report["accuracy_comparison"]
            print(f"  • 原始图识别准确率: {comp['raw_accuracy']}% (CER: {comp['raw_cer']})")
            print(f"  • 增强后识别准确率: {comp['enhanced_accuracy']}% (CER: {comp['enhanced_cer']})")
            print(f"  🎯 准确率净增益 (+Δ): +{comp['accuracy_improvement']}%")
        elif "relative_gain" in ocr_report:
            print(f"  🎯 字符检出增益: +{ocr_report['relative_gain']['char_gain_percentage']}%")

    # 4. 生成 JSON 报告
    summary = {
        "image_file": fname,
        "title": SAMPLE_CATALOG.get(fname, {}).get("title", fname),
        "total_elapsed_ms": res["total_elapsed_ms"],
        "metrics": metrics,
        "ocr_report": ocr_report
    }
    json_path = os.path.join(sample_out_dir, "evaluation_report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n📑 评测报告已保存至: {json_path}")
    return summary


def write_batch_markdown_summary(summaries: List[Dict[str, Any]], output_dir: str):
    if not summaries:
        return
    md_path = os.path.join(output_dir, "benchmark_summary.md")
    lines = [
        "# 手机文档扫描与可读性增强系统 — 客观质量与 OCR 识别率量化对比总表\n",
        "| 样本文件 | 退化场景说明 | 处理前 PSNR (dB) | 增强后 PSNR (dB) | 处理前 SSIM | 增强后 SSIM | 处理前 OCR 准确率 | 增强后 OCR 准确率 | 识别率净提升 (+Δ) | 耗时 (ms) |",
        "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    ]
    for s in summaries:
        m = s["metrics"]
        acc = s.get("ocr_report", {}).get("accuracy_comparison", {})
        raw_psnr = m.get("raw_psnr", "--")
        enh_psnr = m.get("psnr", "--")
        raw_ssim = m.get("raw_ssim", "--")
        enh_ssim = m.get("ssim", "--")
        raw_acc = f"{acc.get('raw_accuracy', '--')}%" if acc else "--"
        enh_acc = f"{acc.get('enhanced_accuracy', '--')}%" if acc else "--"
        gain_acc = f"+{acc.get('accuracy_improvement', '--')}%" if acc else "--"
        lines.append(
            f"| `{s['image_file']}` | {s['title']} | {raw_psnr} | **{enh_psnr}** | {raw_ssim} | **{enh_ssim}** | {raw_acc} | **{enh_acc}** | **{gain_acc}** | {s['total_elapsed_ms']} |"
        )
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\n🏆 批量评测 Markdown 汇总大表已生成: {md_path}")


def main():
    args = parse_args()
    if os.path.isdir(args.input):
        valid_exts = [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]
        files = sorted([
            os.path.join(args.input, f) for f in os.listdir(args.input)
            if os.path.splitext(f)[1].lower() in valid_exts
        ])
        summaries = []
        for f in files:
            res = process_single_image(
                f, args.output_dir, args.mode, args.gt_text,
                args.gt_image, args.save_stages, not args.skip_ocr
            )
            if res:
                summaries.append(res)
        write_batch_markdown_summary(summaries, args.output_dir)
    else:
        process_single_image(
            args.input, args.output_dir, args.mode, args.gt_text,
            args.gt_image, args.save_stages, not args.skip_ocr
        )


if __name__ == "__main__":
    main()
