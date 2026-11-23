"""
下游 OCR 识别率客观评测引擎 (Downstream OCR Evaluation Engine)
课题一 核心算法流水线阶段 (7)
利用纯本地推理的 RapidOCR (ONNX Runtime) 评测增强前后的可读性提升，严禁使用 OCR 前处理替代传统算法。
支持计算 CER (字符错误率)、WER (词/行错误率)、字符识别准确率 (Accuracy) 与平均识别置信度 (Confidence)。
"""

import os
import re
import hashlib
import threading
from collections import OrderedDict
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
    使用单例/按需懒加载 + 内容哈希 LRU 缓存避免重复 ONNX 推理，并针对低核数云服务器优化线程数。
    """
    _ocr_engine = None
    _engine_lock = threading.Lock()
    _cache_lock = threading.Lock()
    _text_cache: "OrderedDict[str, Tuple[str, List[Dict[str, Any]]]]" = OrderedDict()
    _CACHE_MAX_SIZE = 32

    @classmethod
    def get_engine(cls):
        if cls._ocr_engine is None:
            with cls._engine_lock:
                if cls._ocr_engine is None:
                    try:
                        from rapidocr_onnxruntime import RapidOCR

                        cpu_cnt = os.cpu_count() or 2
                        default_threads = 1 if cpu_cnt <= 4 else min(4, cpu_cnt // 2)
                        intra_threads = int(os.environ.get("OCR_INTRA_THREADS", str(default_threads)))
                        cls._ocr_engine = RapidOCR(
                            intra_op_num_threads=max(1, intra_threads),
                            inter_op_num_threads=1,
                        )
                    except Exception as e:
                        print(f"[警告] 初始化 RapidOCR 失败: {e}")
                        cls._ocr_engine = None
        return cls._ocr_engine

    @staticmethod
    def _image_cache_key(image: np.ndarray, max_dim: int) -> str:
        h = hashlib.blake2b(digest_size=16)
        h.update(f"{image.shape}:{image.dtype}:{max_dim}:".encode("ascii"))
        h.update(np.ascontiguousarray(image).data)
        return h.hexdigest()

    @classmethod
    def extract_text(
        cls,
        image: np.ndarray,
        max_dim: int = 1280,
        use_cache: bool = True,
        target_shape: Optional[Tuple[int, int]] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        对输入图像进行文字提取。

        参数:
            image: 输入 BGR/灰度图
            max_dim: 送入 OCR 推理的长边上限（防止 4K 原图拖慢推理，识别框自动映射回目标坐标）
            use_cache: 是否启用内容哈希 LRU 缓存（同一张原图多次调参时直接 0ms 命中）
            target_shape: 若调用方传入的是已缩放图，可指定最终显示图的 (H, W) 将框坐标等比还原
        返回:
            full_text: 合并后的纯文本字符串
            boxes: 包含识别框坐标 [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]、文本和置信度的列表
        """
        engine = cls.get_engine()
        if engine is None:
            return "", []

        orig_h, orig_w = image.shape[:2]
        out_h, out_w = target_shape if target_shape is not None else (orig_h, orig_w)

        cache_key = None
        if use_cache:
            cache_key = cls._image_cache_key(image, max_dim) + f":{out_h}x{out_w}"
            with cls._cache_lock:
                cached = cls._text_cache.get(cache_key)
                if cached is not None:
                    cls._text_cache.move_to_end(cache_key)
                    return cached

        if len(image.shape) == 2:
            img_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            img_bgr = image

        infer_img = img_bgr
        if max_dim > 0 and max(orig_h, orig_w) > max_dim:
            sc = max_dim / float(max(orig_h, orig_w))
            infer_img = cv2.resize(
                img_bgr,
                (max(1, int(round(orig_w * sc))), max(1, int(round(orig_h * sc)))),
                interpolation=cv2.INTER_AREA,
            )

        infer_h, infer_w = infer_img.shape[:2]
        scale_x = out_w / float(max(infer_w, 1))
        scale_y = out_h / float(max(infer_h, 1))

        result, _ = engine(infer_img, use_cls=False)
        if not result:
            empty_res: Tuple[str, List[Dict[str, Any]]] = ("", [])
            if use_cache and cache_key is not None:
                with cls._cache_lock:
                    cls._text_cache[cache_key] = empty_res
                    while len(cls._text_cache) > cls._CACHE_MAX_SIZE:
                        cls._text_cache.popitem(last=False)
            return empty_res

        text_lines = []
        boxes_meta = []
        for item in result:
            raw_box, text, score = item[0], item[1], float(item[2])
            scaled_box = [
                [round(float(pt[0]) * scale_x, 1), round(float(pt[1]) * scale_y, 1)]
                for pt in raw_box
            ]
            text_lines.append(text)
            boxes_meta.append({
                "box": scaled_box,
                "text": text,
                "score": round(score, 4),
                "confidence": round(score, 4),
            })

        full_text = "\n".join(text_lines)
        final_res = (full_text, boxes_meta)
        if use_cache and cache_key is not None:
            with cls._cache_lock:
                cls._text_cache[cache_key] = final_res
                while len(cls._text_cache) > cls._CACHE_MAX_SIZE:
                    cls._text_cache.popitem(last=False)
        return final_res

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
        ground_truth_text: Optional[str] = None,
        cached_enhanced: Optional[Tuple[str, List[Dict[str, Any]]]] = None,
        enhanced_target_shape: Optional[Tuple[int, int]] = None,
    ) -> Dict[str, Any]:
        """
        对增强前后的图像执行端到端对比评测。
        若已提前算出增强图 OCR（cached_enhanced），直接复用，彻底避免重复推理。
        """
        raw_text, raw_boxes = cls.extract_text(raw_image)
        if cached_enhanced is not None:
            enhanced_text, enhanced_boxes = cached_enhanced
        else:
            enhanced_text, enhanced_boxes = cls.extract_text(
                enhanced_image, target_shape=enhanced_target_shape
            )

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
