"""
下游 OCR 识别率客观评测引擎 (Downstream OCR Evaluation Engine)
课题一 核心算法流水线阶段 (7)
利用纯本地推理的 RapidOCR (ONNX Runtime) 评测增强前后的可读性提升，严禁使用 OCR 前处理替代传统算法。
支持计算 CER (字符错误率)、WER (词/行错误率)、字符识别准确率 (Accuracy) 与平均识别置信度 (Confidence)。
"""

import re
from typing import Tuple, Dict, Any, Optional, List
import numpy as np
import cv2
import Levenshtein


def _normalize_for_eval(text: str) -> str:
    """清理空白符及纯分割横线，统一全角/半角括号与大小写，确保编辑距离客观反映文字识别率"""
    lines = []
    for line in text.splitlines():
        s = line.strip()
        # 忽略纯破折号/分隔符装饰行
        if not s or re.fullmatch(r"[-_=*~·.]+", s):
            continue
        lines.append(s)
    joined = "".join(lines)
    joined = joined.replace("（", "(").replace("）", ")").replace("：", ":").replace("，", ",")
    joined = re.sub(r"\s+", "", joined)
    return joined.upper()


class OCREvaluator:
    """
    OCR 客观识别率评测器。
    使用单例/按需懒加载避免重复初始化 ONNX 权重。
    """
    _ocr_engine = None

    @classmethod
    def get_engine(cls):
        if cls._ocr_engine is None:
            try:
                from rapidocr_onnxruntime import RapidOCR
                cls._ocr_engine = RapidOCR()
            except Exception as e:
                print(f"[警告] 初始化 RapidOCR 失败: {e}")
                cls._ocr_engine = None
        return cls._ocr_engine

    @classmethod
    def extract_text(cls, image: np.ndarray) -> Tuple[str, List[Dict[str, Any]]]:
        """
        对输入图像进行文字提取。
        
        返回:
            full_text: 合并后的纯文本字符串
            boxes: 包含识别框坐标 [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]、文本和置信度的列表
        """
        engine = cls.get_engine()
        if engine is None:
            return "", []

        if len(image.shape) == 2:
            img_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            img_bgr = image

        result, _ = engine(img_bgr)
        if not result:
            return "", []

        text_lines = []
        boxes_meta = []
        for item in result:
            box, text, score = item[0], item[1], float(item[2])
            text_lines.append(text)
            boxes_meta.append({
                "box": box,
                "text": text,
                "score": round(score, 4)
            })

        full_text = "\n".join(text_lines)
        return full_text, boxes_meta

    @staticmethod
    def calculate_text_accuracy(gt_text: str, pred_text: str) -> Dict[str, float]:
        """
        利用 Levenshtein 编辑距离计算字符识别准确率 (Accuracy)、字错率 (CER) 和词错率 (WER)。
        
        数学定义:
            CER = (Substitutions + Deletions + Insertions) / Total_GT_Chars
            Accuracy = max(0, (1 - CER) * 100%)
        """
        gt_clean = _normalize_for_eval(gt_text)
        pred_clean = _normalize_for_eval(pred_text)

        if not gt_clean:
            return {"cer": 0.0, "wer": 0.0, "accuracy": 100.0, "edit_distance": 0}

        dist = Levenshtein.distance(gt_clean, pred_clean)
        cer = dist / len(gt_clean)
        accuracy = max(0.0, (1.0 - cer) * 100.0)

        # 计算词级/Token级错误率 WER
        gt_words = [w for w in re.split(r"[\s:;,()]+", gt_text.upper()) if w and not re.fullmatch(r"[-_=]+", w)]
        pred_words = [w for w in re.split(r"[\s:;,()]+", pred_text.upper()) if w and not re.fullmatch(r"[-_=]+", w)]
        if gt_words:
            # 使用词序列编辑距离
            word_dist = Levenshtein.distance(gt_words, pred_words)
            wer = min(1.0, word_dist / len(gt_words))
        else:
            wer = cer

        return {
            "cer": round(cer, 4),
            "wer": round(wer, 4),
            "accuracy": round(accuracy, 2),
            "edit_distance": dist,
            "gt_length": len(gt_clean),
            "pred_length": len(pred_clean)
        }

    @classmethod
    def evaluate_comparison(
        cls,
        raw_image: np.ndarray,
        enhanced_image: np.ndarray,
        ground_truth_text: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        对增强前后的图像执行端到端对比评测。
        
        参数:
            raw_image: 拍摄原始图 (手机倾斜/阴影/模糊/摩尔纹/偏色)
            enhanced_image: 经本系统全流程增强后的图像
            ground_truth_text: 标准文本真实值 (若有)
        返回:
            综合评测对比字典 (包含 OCR 文本、识别率增益、CER/WER、置信度对比)
        """
        raw_text, raw_boxes = cls.extract_text(raw_image)
        enhanced_text, enhanced_boxes = cls.extract_text(enhanced_image)

        raw_conf = float(np.mean([b["score"] for b in raw_boxes])) * 100.0 if raw_boxes else 0.0
        enh_conf = float(np.mean([b["score"] for b in enhanced_boxes])) * 100.0 if enhanced_boxes else 0.0

        raw_chars = len(_normalize_for_eval(raw_text))
        enh_chars = len(_normalize_for_eval(enhanced_text))

        report: Dict[str, Any] = {
            "raw": {
                "text": raw_text,
                "box_count": len(raw_boxes),
                "char_count": raw_chars,
                "mean_confidence": round(raw_conf, 2)
            },
            "enhanced": {
                "text": enhanced_text,
                "box_count": len(enhanced_boxes),
                "char_count": enh_chars,
                "mean_confidence": round(enh_conf, 2)
            }
        }

        gain = ((enh_chars - raw_chars) / max(raw_chars, 1)) * 100.0
        report["relative_gain"] = {
            "char_gain_percentage": round(gain, 1),
            "confidence_gain": round(enh_conf - raw_conf, 2)
        }

        if ground_truth_text:
            raw_acc = cls.calculate_text_accuracy(ground_truth_text, raw_text)
            enh_acc = cls.calculate_text_accuracy(ground_truth_text, enhanced_text)
            delta_acc = enh_acc["accuracy"] - raw_acc["accuracy"]
            report["accuracy_comparison"] = {
                "raw_accuracy": raw_acc["accuracy"],
                "enhanced_accuracy": enh_acc["accuracy"],
                "accuracy_improvement": round(delta_acc, 2),
                "raw_cer": raw_acc["cer"],
                "enhanced_cer": enh_acc["cer"],
                "raw_wer": raw_acc["wer"],
                "enhanced_wer": enh_acc["wer"]
            }

        return report
