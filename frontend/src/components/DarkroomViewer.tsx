import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Eye,
  Columns,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ScanText,
  Crop,
  Check,
  X,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface DarkroomViewerProps {
  originalImage: string | null;
  rectifiedOriginalImage?: string | null;
  processedImage: string | null;
  stageName?: string;
  isDiagnosticView?: boolean;
  isProcessing?: boolean;
  progressPercent?: number;
  progressLabel?: string;
  mobileExpanded?: boolean;
  onToggleMobileExpand?: () => void;
  ocrBoxes?: Array<{
    box: number[][];
    text: string;
    confidence: number;
  }>;
  detectedCorners?: number[][] | null;
  onApplyManualCorners?: (corners: number[][]) => void;
}

export const DarkroomViewer: React.FC<DarkroomViewerProps> = ({
  originalImage,
  rectifiedOriginalImage = null,
  processedImage,
  stageName = '增强后文档',
  isDiagnosticView = false,
  isProcessing = false,
  progressPercent = 0,
  progressLabel = '正在执行传统数字图像增强管线...',
  mobileExpanded = false,
  onToggleMobileExpand,
  ocrBoxes = [],
  detectedCorners = null,
  onApplyManualCorners,
}) => {
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'corner-edit'>('slider');
  const [showOcrOverlay, setShowOcrOverlay] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSliderDragging, setIsSliderDragging] = useState<boolean>(false);

  // 原始图像与增强图像的真实像素宽高
  const [origSize, setOrigSize] = useState<{ w: number; h: number }>({ w: 700, h: 900 });
  const [procSize, setProcSize] = useState<{ w: number; h: number }>({ w: 700, h: 900 });

  // 手动四角点状态 (基于原图真实像素坐标: TL, TR, BR, BL)
  const [corners, setCorners] = useState<number[][]>([
    [45, 45],
    [655, 45],
    [655, 855],
    [45, 855],
  ]);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);

  const stageViewportRef = useRef<HTMLDivElement>(null);
  const sliderFrameRef = useRef<HTMLDivElement>(null);
  const cornerSvgRef = useRef<SVGSVGElement>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // 当检测到新的文档四角点或图像尺寸变化时同步初始化角点
  useEffect(() => {
    if (detectedCorners && detectedCorners.length === 4) {
      setCorners(detectedCorners.map((pt) => [Math.round(pt[0]), Math.round(pt[1])]));
    } else if (origSize.w > 0 && origSize.h > 0) {
      const padX = Math.round(origSize.w * 0.06);
      const padY = Math.round(origSize.h * 0.06);
      setCorners([
        [padX, padY],
        [origSize.w - padX, padY],
        [origSize.w - padX, origSize.h - padY],
        [padX, origSize.h - padY],
      ]);
    }
  }, [detectedCorners, origSize.w, origSize.h]);

  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [originalImage, viewMode]);

  // 支持滚轮平滑缩放（Ctrl/普通滚轮统一拦截，防止页面抖动）
  useEffect(() => {
    const el = stageViewportRef.current;
    if (!el || !originalImage || viewMode === 'corner-edit') return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((prev) => Math.round(Math.max(0.5, Math.min(3.0, prev + delta)) * 100) / 100);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [originalImage, viewMode]);

  const updateSliderFromClientX = useCallback((clientX: number) => {
    const frame = sliderFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  }, []);

  const handleMouseUp = useCallback(() => {
    setDraggingCornerIdx(null);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingCornerIdx !== null && cornerSvgRef.current) {
        const rect = cornerSvgRef.current.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const px = Math.round(relX * origSize.w);
        const py = Math.round(relY * origSize.h);
        setCorners((prev) => {
          const next = [...prev];
          next[draggingCornerIdx] = [px, py];
          return next;
        });
      }
    },
    [draggingCornerIdx, origSize.w, origSize.h]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      if (draggingCornerIdx !== null && cornerSvgRef.current) {
        e.preventDefault();
        const rect = cornerSvgRef.current.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        const relY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
        const px = Math.round(relX * origSize.w);
        const py = Math.round(relY * origSize.h);
        setCorners((prev) => {
          const next = [...prev];
          next[draggingCornerIdx] = [px, py];
          return next;
        });
      }
    },
    [draggingCornerIdx, origSize.w, origSize.h]
  );

  useEffect(() => {
    if (draggingCornerIdx === null) return;
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchcancel', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchcancel', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [draggingCornerIdx, handleMouseUp, handleMouseMove, handleTouchMove]);

  // 分割线手柄独立 Pointer Capture（无论是否放大都可独立拖动对比）
  const handleHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDiagnosticView) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSliderDragging(true);
    updateSliderFromClientX(e.clientX);
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSliderDragging) return;
    updateSliderFromClientX(e.clientX);
  };

  const handleHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSliderDragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsSliderDragging(false);
  };

  // 主画布区：zoom <= 1 点击/拖拽直接控制滑块；zoom > 1 拖拽实现平滑平移看细节
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!originalImage || viewMode === 'corner-edit') return;
    if (zoom > 1) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (viewMode === 'slider' && !isDiagnosticView && sliderFrameRef.current?.contains(e.target as Node)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsSliderDragging(true);
      updateSliderFromClientX(e.clientX);
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning && panStartRef.current && stageViewportRef.current) {
      const rect = stageViewportRef.current.getBoundingClientRect();
      const maxPanX = Math.max(120, rect.width * (zoom - 1) * 0.55);
      const maxPanY = Math.max(120, rect.height * (zoom - 1) * 0.55);
      const nextX = panStartRef.current.panX + (e.clientX - panStartRef.current.x);
      const nextY = panStartRef.current.panY + (e.clientY - panStartRef.current.y);
      setPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, nextX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextY)),
      });
      return;
    }
    if (isSliderDragging) {
      updateSliderFromClientX(e.clientX);
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (isSliderDragging) {
      setIsSliderDragging(false);
    }
  };

  const resetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const cornerLabels = ['TL (左上)', 'TR (右上)', 'BR (右下)', 'BL (左下)'];

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 overflow-hidden shadow-2xl relative">
      {/* 顶部状态与工具栏（移动端单行横向可滑胶囊，杜绝竖排换行） */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2 bg-[#121826] border-b border-slate-800 text-xs font-mono select-none gap-2">
        <div className="flex items-center justify-between space-x-2.5 min-w-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <span className="flex items-center text-slate-400 truncate">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse flex-shrink-0"></span>
              当前检视: <span className="text-slate-100 ml-1.5 font-semibold truncate">{stageName}</span>
            </span>
            {origSize.w > 0 && (
              <span className="text-[10px] text-slate-500 hidden md:inline tabular-nums flex-shrink-0">
                [{procSize.w}×{procSize.h} px]
              </span>
            )}
          </div>

          {/* 移动端专属：一键展开/收起固定预览视窗高度 */}
          {onToggleMobileExpand && (
            <button
              type="button"
              onClick={onToggleMobileExpand}
              className="lg:hidden flex items-center px-2 py-1 rounded-md bg-slate-900 border border-slate-700/80 text-[10px] text-slate-200 whitespace-nowrap flex-shrink-0"
              aria-label={mobileExpanded ? '收起预览视窗' : '放大预览视窗'}
            >
              {mobileExpanded ? (
                <>
                  <Minimize2 className="w-3 h-3 mr-1 text-blue-400" /> 收起
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3 mr-1 text-blue-400" /> 放大看图
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-0.5 sm:pb-0 flex-nowrap">
          {/* OCR 识别框叠加开关 */}
          {ocrBoxes && ocrBoxes.length > 0 && viewMode !== 'corner-edit' && (
            <button
              onClick={() => setShowOcrOverlay((v) => !v)}
              data-fx-magnet="subtle"
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-mono border whitespace-nowrap flex-shrink-0 transition-colors flex items-center ${
                showOcrOverlay
                  ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="在增强图像上叠加显示 RapidOCR 文本框与置信度"
            >
              <ScanText className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
              <span>OCR 识别框 ({ocrBoxes.length})</span>
            </button>
          )}

          {/* 视窗模式切换 */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 flex-shrink-0">
            <button
              onClick={() => setViewMode('slider')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap flex-shrink-0 transition-colors flex items-center ${
                viewMode === 'slider'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> 滑块对比
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap flex-shrink-0 transition-colors flex items-center ${
                viewMode === 'side-by-side'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> 双联对比
            </button>
            {onApplyManualCorners && originalImage && (
              <button
                onClick={() => setViewMode(viewMode === 'corner-edit' ? 'slider' : 'corner-edit')}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap flex-shrink-0 transition-colors flex items-center ${
                  viewMode === 'corner-edit'
                    ? 'bg-amber-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="手动拖拽 4 个透视控制角点进行单应性矫正"
              >
                <Crop className="w-3.5 h-3.5 mr-1 flex-shrink-0" /> 四角点校准
              </button>
            )}
          </div>

          {/* 缩放控制 */}
          <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 px-1 tabular-nums flex-shrink-0">
            <button
              onClick={() => setZoom((z) => Math.round(Math.max(0.5, z - 0.25) * 100) / 100)}
              data-fx-sheen="off"
              className="min-w-[30px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-white rounded"
              title="缩小"
              aria-label="缩小图像"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetZoomAndPan}
              data-fx-sheen="off"
              className="px-1 text-[11px] text-slate-300 hover:text-white min-w-[40px] min-h-[32px] flex items-center justify-center"
              title="点击复位 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.round(Math.min(3.0, z + 0.25) * 100) / 100)}
              data-fx-sheen="off"
              className="min-w-[30px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-white rounded"
              title="放大"
              aria-label="放大图像"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetZoomAndPan}
              data-fx-sheen="off"
              className="min-w-[28px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-slate-300 ml-0.5 border-l border-slate-800 rounded"
              title="重置缩放与位置"
              aria-label="重置缩放与位置"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 图像渲染核心暗房标定光学台面（点阵刻度 + 滚轮缩放 + 放大拖拽平移） */}
      <div
        ref={stageViewportRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        onDoubleClick={() => {
          if (viewMode !== 'corner-edit') resetZoomAndPan();
        }}
        className={`ds-optical-stage flex-1 relative overflow-hidden flex items-center justify-center p-4 select-none ${
          zoom > 1 && viewMode !== 'corner-edit'
            ? isPanning
              ? 'cursor-grabbing touch-none'
              : 'cursor-grab touch-none'
            : ''
        }`}
      >
        {zoom > 1 && viewMode !== 'corner-edit' && (
          <div className="ds-keep-white pointer-events-none absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-sm border border-slate-700/80 text-[10px] font-mono text-white">
            滚轮缩放 · 拖拽平移 · 双击复位
          </div>
        )}
        {/* 算法实时运算 SSE 进度条反馈 */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center p-4">
            <div className="bg-[#121826] border border-blue-500/40 rounded-xl px-5 py-4 shadow-2xl w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2.5 text-slate-100 font-semibold truncate">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                  <span className="truncate">{progressLabel || '正在执行增强处理...'}</span>
                </div>
                <span className="text-blue-400 tabular-nums ml-2 flex-shrink-0">
                  {Math.max(5, Math.min(100, Math.round(progressPercent)))}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(8, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                自动退化诊断 · Retinex 去阴影 · 2D-FFT 陷波 · Sauvola 增强
              </div>
            </div>
          </div>
        )}

        {!originalImage ? (
          <div className="text-center text-slate-500 flex flex-col items-center">
            <Eye className="w-12 h-12 mb-3 stroke-[1.2] text-slate-600" />
            <p className="text-sm font-medium text-slate-400">
              请从上方测试样本栏一键载入退化样本，或上传手机拍摄照片
            </p>
            <p className="text-xs text-slate-600 mt-1">
              支持重度阴影、屏幕翻拍摩尔纹、失焦模糊、运动模糊、暖光偏色及 3D 透视倾斜文档
            </p>
          </div>
        ) : viewMode === 'corner-edit' ? (
          /* 手动四角点交互校准模式 */
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="mb-2 flex items-center space-x-3 bg-[#121826] px-3.5 py-1.5 rounded-lg border border-amber-500/40 text-xs font-mono">
              <span className="text-amber-300">
                拖拽画面上的 4 个角点贴合文档纸张外沿，然后点击应用透视变换：
              </span>
              <button
                onClick={() => {
                  if (onApplyManualCorners) {
                    onApplyManualCorners(corners);
                  }
                  setViewMode('slider');
                }}
                data-fx-magnet="subtle"
                className="optical-fx-primary flex items-center px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/25 transition-colors"
              >
                <Check className="w-3.5 h-3.5 mr-1" /> 应用透视矫正
              </button>
              <button
                onClick={() => setViewMode('slider')}
                className="flex items-center px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5 mr-1" /> 取消
              </button>
            </div>

            <div className="relative inline-block max-h-[66vh] max-w-full border border-slate-800 rounded overflow-hidden">
              <img
                src={originalImage}
                alt="透视校准底图"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setOrigSize({ w: img.naturalWidth, h: img.naturalHeight });
                  }
                }}
                className="max-h-[66vh] max-w-full object-contain block pointer-events-none"
              />
              <svg
                ref={cornerSvgRef}
                viewBox={`0 0 ${origSize.w} ${origSize.h}`}
                className="absolute inset-0 w-full h-full touch-none"
              >
                <polygon
                  points={corners.map((p) => `${p[0]},${p[1]}`).join(' ')}
                  fill="rgba(245, 158, 11, 0.16)"
                  stroke="#f59e0b"
                  strokeWidth={Math.max(2, Math.round(origSize.w * 0.004))}
                  strokeDasharray="8 4"
                />
                {corners.map((pt, idx) => (
                  <g
                    key={idx}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingCornerIdx(idx);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setDraggingCornerIdx(idx);
                    }}
                    className="cursor-move"
                  >
                    {/* 移动端大范围透明触控热区圆 */}
                    <circle
                      cx={pt[0]}
                      cy={pt[1]}
                      r={Math.max(26, Math.round(origSize.w * 0.042))}
                      fill="transparent"
                    />
                    <circle
                      cx={pt[0]}
                      cy={pt[1]}
                      r={Math.max(12, Math.round(origSize.w * 0.018))}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth={3}
                    />
                    <text
                      x={pt[0] + 16}
                      y={pt[1] - 12}
                      fill="#fde68a"
                      fontSize={Math.max(14, Math.round(origSize.w * 0.02))}
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {cornerLabels[idx]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        ) : viewMode === 'side-by-side' ? (
          /* 双联对比视窗（桌面左右并排，移动端自动改为上下堆叠更清晰） */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full h-full overflow-y-auto sm:overflow-hidden">
            <div className="flex flex-col items-center justify-center h-full bg-[#0c1018] rounded-lg border border-slate-800/80 p-2 relative overflow-hidden">
              <span className="ds-keep-white absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/75 backdrop-blur rounded text-[11px] text-white font-mono z-10 border border-slate-700">
                原始退化图 (Before)
              </span>
              <img
                src={originalImage}
                alt="原始输入"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth) setOrigSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                className="max-h-full max-w-full object-contain pointer-events-none"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                }}
              />
            </div>

            <div className="flex flex-col items-center justify-center h-full bg-[#0c1018] rounded-lg border border-blue-900/40 p-2 relative overflow-hidden">
              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-blue-600/90 backdrop-blur rounded text-[11px] text-white font-mono z-10 shadow">
                {stageName} (After)
              </span>
              <div
                className="relative inline-block max-h-full max-w-full"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                }}
              >
                <img
                  src={processedImage || originalImage}
                  alt="增强结果"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth) setProcSize({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                  className="max-h-[68vh] max-w-full object-contain block"
                />
                {showOcrOverlay && ocrBoxes.length > 0 && (
                  <svg
                    viewBox={`0 0 ${procSize.w} ${procSize.h}`}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {ocrBoxes.map((item, i) => (
                      <polygon
                        key={i}
                        points={item.box.map((p) => `${p[0]},${p[1]}`).join(' ')}
                        fill="rgba(16, 185, 129, 0.14)"
                        stroke="#10b981"
                        strokeWidth={2}
                      >
                        <title>{`${item.text} (${(item.confidence * 100).toFixed(1)}%)`}</title>
                      </polygon>
                    ))}
                  </svg>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* 滑块实时对比 (Before / After Slider) 或 诊断图独立检视 */
          <div
            ref={sliderFrameRef}
            className={`relative inline-flex items-center justify-center h-full max-h-full max-w-full overflow-hidden rounded-lg border border-slate-700/60 shadow-[var(--doc-shadow)] ${
              zoom > 1
                ? isPanning
                  ? 'cursor-grabbing touch-none'
                  : 'cursor-grab touch-none'
                : isDiagnosticView
                ? 'cursor-default'
                : 'cursor-ew-resize touch-none'
            }`}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {/* 基准层：处理后图像 (After) 或 阶段诊断图 */}
            <img
              src={processedImage || originalImage}
              alt={stageName}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth) setProcSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              className="h-full max-h-full w-auto max-w-full object-contain pointer-events-none block select-none"
            />

            {/* OCR 检测框叠加层 */}
            {showOcrOverlay && !isDiagnosticView && ocrBoxes.length > 0 && (
              <svg
                viewBox={`0 0 ${procSize.w} ${procSize.h}`}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              >
                {ocrBoxes.map((item, i) => (
                  <polygon
                    key={i}
                    points={item.box.map((p) => `${p[0]},${p[1]}`).join(' ')}
                    fill="rgba(16, 185, 129, 0.15)"
                    stroke="#10b981"
                    strokeWidth={2}
                  />
                ))}
              </svg>
            )}

            <span className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 px-1.5 py-0.5 sm:px-2.5 sm:py-1 bg-blue-600/90 backdrop-blur rounded text-[10px] sm:text-[11px] text-white font-mono z-10 shadow max-w-[85%] truncate">
              {isDiagnosticView ? (
                stageName
              ) : (
                <>
                  <span className="sm:hidden">增强后</span>
                  <span className="hidden sm:inline">增强后 (After)</span>
                </>
              )}
            </span>

            {/* 左侧裁切层：原始/透视对齐后退化图 (Before) —— 仅在非独立诊断图时启用滑块叠加 */}
            {processedImage && !isDiagnosticView && (
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none z-10"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                <img
                  src={rectifiedOriginalImage || originalImage}
                  alt="原始文档"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && !rectifiedOriginalImage) {
                      setOrigSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }
                  }}
                  className="w-full h-full object-contain pointer-events-none block select-none"
                />
                <span className="ds-keep-white absolute bottom-2 left-2 sm:bottom-3 sm:left-3 px-1.5 py-0.5 sm:px-2.5 sm:py-1 bg-black/80 backdrop-blur rounded text-[10px] sm:text-[11px] text-white font-mono border border-slate-700">
                  <span className="sm:hidden">原图</span>
                  <span className="hidden sm:inline">修复前 (Before)</span>
                </span>
              </div>
            )}

            {/* 分割线与 44x44px 正圆触控手柄（独立 Pointer Capture，放大后也可单独拖滑块） */}
            {processedImage && !isDiagnosticView && (
              <div
                onPointerDown={handleHandlePointerDown}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                onPointerCancel={handleHandlePointerUp}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setSliderPos((p) => Math.max(0, p - 4));
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setSliderPos((p) => Math.min(100, p + 4));
                  }
                }}
                role="slider"
                tabIndex={0}
                aria-label="左右拖动对比增强前后图像"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderPos)}
                className="absolute top-0 bottom-0 w-8 -translate-x-1/2 z-20 flex items-center justify-center cursor-ew-resize pointer-events-auto touch-none focus:outline-none"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="w-0.5 h-full bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.9)] pointer-events-none" />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute flex-shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-sm font-bold select-none transition-transform"
                  style={{ transform: isSliderDragging ? 'scale(1.1)' : 'scale(1)' }}
                >
                  ⇄
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
