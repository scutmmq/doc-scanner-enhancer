"""
几何校正与透视变换模块 (Geometric Rectification)
课题一 核心算法流水线阶段 (1)
纯传统数字图像处理实现：基于 Canny 边缘检测、凸包/轮廓多边形逼近与单应性透视变换矩阵 (Homography)。
"""

from typing import Tuple, Optional
import numpy as np
import cv2


def order_points(pts: np.ndarray) -> np.ndarray:
    """
    将 4 个顶点坐标按照顺时针排序：[左上 (TL), 右上 (TR), 右下 (BR), 左下 (BL)]
    
    参数:
        pts: 形状为 (4, 2) 的坐标点集合
    返回:
        rect: 排序后的 (4, 2) 坐标数组
    """
    rect = np.zeros((4, 2), dtype="float32")
    
    # 左上角点的 x + y 之和最小，右下角点的 x + y 之和最大
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    
    # 右上角点的 y - x 之差最小 (或 x - y 最大)，左下角点差值最大
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    
    return rect


def detect_document_corners(
    image: np.ndarray,
    canny_thresh1: float = 50.0,
    canny_thresh2: float = 150.0,
    min_area_ratio: float = 0.15
) -> Optional[np.ndarray]:
    """
    自动检测文档拍摄图像中的 4 个角点。
    
    算法步骤:
    1. 灰度化与高斯低通滤波（降噪，去除细碎纹理干扰）；
    2. Canny 双阈值边缘检测；
    3. 形态学闭运算连接断裂的边缘轮廓；
    4. 提取外轮廓，利用 Douglas-Peucker 多边形逼近算法拟合四边形；
    5. 选取面积最大且符合凸四边形约束的候选作为文档边界。
    """
    h, w = image.shape[:2]
    total_area = h * w
    
    # 转灰度
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
        
    # 高斯平滑
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # 边缘检测
    edged = cv2.Canny(blurred, canny_thresh1, canny_thresh2)
    
    # 闭运算连接微小缺口
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # 轮廓检测
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # 按轮廓面积降序排序
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < total_area * min_area_ratio:
            break
            
        perimeter = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * perimeter, True)
        
        # 寻找严格的 4 边凸多边形
        if len(approx) == 4 and cv2.isContourConvex(approx):
            pts = approx.reshape(4, 2).astype("float32")
            return order_points(pts)
            
    # 若未能自动检测到合理的四边形，返回 None
    return None


def perspective_transform(
    image: np.ndarray,
    corners: np.ndarray
) -> Tuple[np.ndarray, np.ndarray]:
    """
    基于四角点进行透视矫正（拉伸为正视矩形）。
    
    参数:
        image: 输入图像 (H, W, C) 或 (H, W)
        corners: 4个顶点 [TL, TR, BR, BL]
    返回:
        warped: 变换后的俯视正射文档图像
        M: 3x3 透视变换矩阵
    """
    pts = order_points(corners)
    (tl, tr, br, bl) = pts
    
    # 计算目标图像的最大宽度
    width_a = np.hypot(br[0] - bl[0], br[1] - bl[1])
    width_b = np.hypot(tr[0] - tl[0], tr[1] - tl[1])
    max_w = max(int(width_a), int(width_b))
    
    # 计算目标图像的最大高度
    height_a = np.hypot(tr[0] - br[0], tr[1] - br[1])
    height_b = np.hypot(tl[0] - bl[0], tl[1] - bl[1])
    max_h = max(int(height_a), int(height_b))
    
    # 确保宽高合理
    max_w = max(max_w, 100)
    max_h = max(max_h, 100)
    
    # 构建目标矩形坐标系 [TL, TR, BR, BL]
    dst = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1]
    ], dtype="float32")
    
    # 计算单应矩阵并执行变换
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(image, M, (max_w, max_h), flags=cv2.INTER_LINEAR)
    
    return warped, M


def rectify_document(
    image: np.ndarray,
    manual_corners: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, bool]:
    """
    文档几何校正全流程接口。
    
    若提供了 manual_corners，则直接根据指定坐标矫正；
    若未提供，则尝试自动检测；若自动检测失败，则返回原图及图片四角。
    
    返回:
        (rectified_img, corners, is_auto_detected)
    """
    h, w = image.shape[:2]
    fallback_corners = np.array([
        [0, 0],
        [w - 1, 0],
        [w - 1, h - 1],
        [0, h - 1]
    ], dtype="float32")
    
    if manual_corners is not None:
        warped, _ = perspective_transform(image, manual_corners)
        return warped, manual_corners, False
        
    detected = detect_document_corners(image)
    if detected is not None:
        warped, _ = perspective_transform(image, detected)
        return warped, detected, True
    else:
        # 回退使用全图边界
        return image.copy(), fallback_corners, False
