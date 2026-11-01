"""
下游 OCR 识别率客观评测引擎 (Downstream OCR Evaluation Engine)
课题一 核心算法流水线阶段 (7)
利用纯本地推理的 RapidOCR (ONNX Runtime) 评测增强前后的可读性提升，严禁使用 OCR 前处理替代传统算法。
"""

from typing import Tuple, Dict, Any, Optional, List
import numpy as np
import cv2
import Levenshtein


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
            boxes: 包含识别框和置信度的列表
        """
        engine = cls.get_engine()
        if engine is None:
            return "", []

        # 确保输入为 uint8 BGR 或 RGB
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
                "score": round(score, 3)
            })

        full_text = "\n".join(text_lines)
        return full_text, boxes_meta

    @staticmethod
    def calculate_text_accuracy(gt_text: str, pred_text: str) -> Dict[str, float]:
        """
        利用 Levenshtein 编辑距离计算字符识别准确率 (Accuracy)、字错率 (CER) 和词错率 (WER)。
        
        CER = (Substitutions + Deletions + Insertions) / Total_GT_Chars
        Accuracy = max(0, 1 - CER)
        """
        # 清理多余空字符
        gt_clean = "".join(gt_text.split())
        pred_clean = "".join(pred_text.split())

        if not gt_clean:
            return {"cer": 0.0, "accuracy": 100.0, "edit_distance": 0}

        dist = Levenshtein.distance(gt_clean, pred_clean)
        cer = dist / len(gt_clean)
        accuracy = max(0.0, (1.0 - cer) * 100.0)

        return {
            "cer": round(cer, 4),
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
            raw_image: 拍摄原始图 (手机倾斜/阴影/模糊)
            enhanced_image: 经本系统全流程增强后的图像
            ground_truth_text: 标准文本真实值 (若有)
        返回:
            综合评测对比字典 (包含 OCR 文本、识别率增益、字符数对比)
        """
        raw_text, raw_boxes = cls.extract_text(raw_image)
        enhanced_text, enhanced_boxes = cls.extract_text(enhanced_image)

        report = {
            "raw": {
                "text": raw_text,
                "box_count": len(raw_boxes),
                "char_count": len(raw_text.replace("\n", ""))
            },
            "enhanced": {
                "text": enhanced_text,
                "box_count": len(enhanced_boxes),
                "char_count": len(enhanced_text.replace("\n", ""))
            }
        }

        # 如果提供了地面真值，计算严格的绝对准确率提升
        if ground_truth_text:
            raw_acc = cls.calculate_text_accuracy(ground_truth_text, raw_text)
            enh_acc = cls.calculate_text_accuracy(ground_truth_text, enhanced_text)
            delta_acc = enh_acc["accuracy"] - raw_acc["accuracy"]
            report["accuracy_comparison"] = {
                "raw_accuracy": raw_acc["accuracy"],
                "enhanced_accuracy": enh_acc["accuracy"],
                "accuracy_improvement": round(delta_acc, 2),
                "raw_cer": raw_acc["cer"],
                "enhanced_cer": enh_acc["cer"]
            }
        else:
            # 若无真值，以检测字符量和置信度作为置信基准
            raw_chars = report["raw"]["char_count"]
            enh_chars = report["enhanced"]["char_count"]
            gain = ((enh_chars - raw_chars) / max(raw_chars, 1)) * 100.0
            report["relative_gain"] = {
                "char_gain_percentage": round(gain, 1)
            }

        return report
