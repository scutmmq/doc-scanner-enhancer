"""
几何校正与透视变换模块 (Geometric Rectification)
课题一 核心算法流水线阶段 (1)
纯传统数字图像处理实现：基于 Canny 边缘检测、Otsu 区域分割回退、凸包/轮廓多边形逼近 (Douglas-Peucker) 与单应性透视变换矩阵 (Homography)。
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


def _is_full_image_border(pts: np.ndarray, w: int, h: int, margin: float = 8.0) -> bool:
    """判断检测到的四边形是否仅仅是图像自身的外边框（避免对无畸变正射图做冗余插值）"""
    expected = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    dists = np.linalg.norm(pts - expected, axis=1)
    return bool(np.all(dists <= margin))


def _is_internal_axis_aligned_frame(pts: np.ndarray, image: np.ndarray) -> bool:
    """
    判断候选四边形是否仅为正射文档内部的装饰内框/表格线：
    若四条边完全水平/垂直（倾角偏差 <= 4px），且图像最外圈边缘本身已经是浅色纸面而非深色桌面背景，
    则说明输入图像已是正射文档，不应裁剪掉页面白边。
    """
    tl, tr, br, bl = pts
    is_axis_aligned = (
        abs(tl[1] - tr[1]) <= 4.0
        and abs(br[1] - bl[1]) <= 4.0
        and abs(tl[0] - bl[0]) <= 4.0
        and abs(tr[0] - br[0]) <= 4.0
    )
    if not is_axis_aligned:
        return False

    # 检查图像最外侧 6px 边框的平均灰度：深色桌面通常 < 75，而纸面 > 85
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    border_pixels = np.concatenate([
        gray[:6, :].ravel(),
        gray[-6:, :].ravel(),
        gray[:, :6].ravel(),
        gray[:, -6:].ravel()
    ])
    return float(np.mean(border_pixels)) > 75.0


def _fit_quad_from_contours(
    contours,
    total_area: float,
    min_area_ratio: float,
    w: int,
    h: int,
    image: Optional[np.ndarray] = None
) -> Optional[np.ndarray]:
    """从候选轮廓列表中通过原始轮廓及凸包多边形逼近提取最佳凸四边形"""
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for cnt in contours[:5]:
        area = cv2.contourArea(cnt)
        if area < total_area * min_area_ratio:
            break

        # 依次尝试原始轮廓与凸包轮廓的多边形逼近
        for candidate in (cnt, cv2.convexHull(cnt)):
            perimeter = cv2.arcLength(candidate, True)
            if perimeter <= 0:
                continue
            for eps in (0.015, 0.02, 0.03, 0.04, 0.05):
                approx = cv2.approxPolyDP(candidate, eps * perimeter, True)
                if len(approx) == 4 and cv2.isContourConvex(approx):
                    quad_area = cv2.contourArea(approx)
                    if quad_area < total_area * min_area_ratio:
                        continue
                    pts = order_points(approx.reshape(4, 2).astype("float32"))
                    if _is_full_image_border(pts, w, h):
                        continue
                    if image is not None and _is_internal_axis_aligned_frame(pts, image):
                        continue
                    return pts
    return None


def detect_document_corners(
    image: np.ndarray,
    canny_thresh1: float = 50.0,
    canny_thresh2: float = 150.0,
    min_area_ratio: float = 0.20
) -> Optional[np.ndarray]:
    """
    自动检测文档拍摄图像中的 4 个角点。
    
    算法步骤:
    1. 灰度化与高斯双边/低通滤波（降噪，去除细碎纹理干扰）；
    2. 策略 A: Canny 双阈值边缘检测 + 形态学闭运算连接断裂轮廓 + 凸包 Douglas-Peucker 拟合；
    3. 策略 B: 若边缘断裂严重，采用 Otsu 全局阈值分离浅色纸张与深色桌面背景，再做凸包四边形拟合；
    4. 选取面积最大且符合非全图边框约束的凸四边形作为文档边界。
    """
    h, w = image.shape[:2]
    total_area = float(h * w)
    
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
        
    # 高斯平滑压制高频网纹与文字内部边缘
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # 策略 A: Canny 边缘检测 + 闭运算
    edged = cv2.Canny(blurred, canny_thresh1, canny_thresh2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    pts = _fit_quad_from_contours(contours, total_area, min_area_ratio, w, h, image=image)
    if pts is not None:
        return pts

    # 策略 B: Otsu 亮暗分割提取纸面主体区域（应对强阴影导致局部边缘梯度弱化的情况）
    _, otsu_mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu_closed = cv2.morphologyEx(otsu_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    contours_b, _ = cv2.findContours(otsu_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    pts_b = _fit_quad_from_contours(contours_b, total_area, min_area_ratio, w, h, image=image)
    if pts_b is not None:
        return pts_b

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
    max_w = max(int(round(width_a)), int(round(width_b)))
    
    # 计算目标图像的最大高度
    height_a = np.hypot(tr[0] - br[0], tr[1] - br[1])
    height_b = np.hypot(tl[0] - bl[0], tl[1] - bl[1])
    max_h = max(int(round(height_a)), int(round(height_b)))
    
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
    
    # 计算单应矩阵并执行双三次/双线性插值变换
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(
        image, M, (max_w, max_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )
    
    return warped, M


def render_geometric_diagnostics(
    image: np.ndarray,
    corners: np.ndarray,
    is_transformed: bool
) -> np.ndarray:
    """
    生成几何阶段诊断可视化图：叠加 Canny 边缘响应、凸包四边形轮廓与四角点坐标标记。
    用于课程设计报告过程论述插图与前端调试。
    """
    if len(image.shape) == 2:
        vis = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        gray = image
    else:
        vis = image.copy()
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    # 浅青色叠加 Canny 边缘
    vis[edges > 0] = (230, 210, 40)

    pts = order_points(corners).astype(np.int32)
    color = (80, 220, 100) if is_transformed else (180, 180, 180)
    cv2.polylines(vis, [pts.reshape((-1, 1, 2))], isClosed=True, color=color, thickness=3, lineType=cv2.LINE_AA)

    labels = ["TL", "TR", "BR", "BL"]
    for idx, (pt, label) in enumerate(zip(pts, labels)):
        x, y = int(pt[0]), int(pt[1])
        cv2.circle(vis, (x, y), 8, (30, 100, 255), -1, cv2.LINE_AA)
        cv2.circle(vis, (x, y), 10, (255, 255, 255), 2, cv2.LINE_AA)
        offset_x = 12 if idx in (0, 3) else -55
        offset_y = 22 if idx in (0, 1) else -12
        cv2.putText(
            vis, f"{label}({x},{y})",
            (max(4, min(vis.shape[1] - 90, x + offset_x)), max(18, min(vis.shape[0] - 8, y + offset_y))),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA
        )

    return vis


def rectify_document(
    image: np.ndarray,
    manual_corners: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, bool]:
    """
    文档几何校正全流程接口。
    
    若提供了 manual_corners，则直接根据指定坐标矫正；
    若未提供，则尝试自动检测；若自动检测失败（或图像本身已是正射无畸变文档），则返回原图及图片四角。
    
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
        pts = order_points(np.asarray(manual_corners, dtype="float32"))
        if _is_full_image_border(pts, w, h):
            return image.copy(), pts, False
        warped, _ = perspective_transform(image, pts)
        return warped, pts, True
        
    detected = detect_document_corners(image)
    if detected is not None:
        warped, _ = perspective_transform(image, detected)
        return warped, detected, True
    else:
        return image.copy(), fallback_corners, False
