import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, Columns, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import gsap from 'gsap';

interface DarkroomViewerProps {
  originalImage: string | null;
  processedImage: string | null;
  stageName?: string;
  isProcessing?: boolean;
}

export const DarkroomViewer: React.FC<DarkroomViewerProps> = ({
  originalImage,
  processedImage,
  stageName = "最终增强文档",
  isProcessing = false
}) => {
  const [sliderPos, setSliderPos] = useState<number>(50); // 百分比
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side'>('slider');
  const [zoom, setZoom] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<boolean>(false);

  const handleMouseDown = () => {
    isDragging.current = true;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pos);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!containerRef.current || e.touches.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pos);
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleMouseMove, handleTouchMove]);

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 overflow-hidden shadow-2xl relative">
      {/* 顶部状态与工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#121826] border-b border-slate-800 text-xs font-mono select-none">
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-slate-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
            视窗模式: <span className="text-slate-200 ml-1 font-semibold">{stageName}</span>
          </span>
          {isProcessing && (
            <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              算法运算中...
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* 模式切换 */}
          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800">
            <button
              onClick={() => setViewMode('slider')}
              className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center ${
                viewMode === 'slider' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 mr-1" /> 滑块对比
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center ${
                viewMode === 'side-by-side' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5 mr-1" /> 双联视窗
            </button>
          </div>

          {/* 缩放微调 */}
          <div className="flex items-center bg-slate-900 rounded border border-slate-800 px-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="p-1 text-slate-400 hover:text-white"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[11px] text-slate-300 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(3.0, z + 0.25))}
              className="p-1 text-slate-400 hover:text-white"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 text-slate-500 hover:text-slate-300 ml-1 border-l border-slate-800"
              title="重置缩放"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 图像渲染核心区域 */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-[#080b11] select-none"
      >
        {!originalImage ? (
          <div className="text-center text-slate-500 flex flex-col items-center">
            <Eye className="w-12 h-12 mb-3 stroke-[1.2] text-slate-600" />
            <p className="text-sm font-medium">请从左侧上传或拍摄一张文档照片</p>
            <p className="text-xs text-slate-600 mt-1">支持透视倾斜、带手指阴影、屏幕翻拍摩尔纹的发票或教材</p>
          </div>
        ) : viewMode === 'side-by-side' ? (
          /* 并排双联视窗 */
          <div className="grid grid-cols-2 gap-4 w-full h-full">
            <div className="flex flex-col items-center justify-center h-full bg-[#0c1018] rounded-lg border border-slate-800/80 p-2 relative overflow-hidden">
              <span className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[11px] text-slate-300 font-mono">
                原始输入 (Before)
              </span>
              <img
                src={originalImage}
                alt="原始输入"
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
            <div className="flex flex-col items-center justify-center h-full bg-[#0c1018] rounded-lg border border-blue-900/30 p-2 relative overflow-hidden">
              <span className="absolute top-2 left-2 px-2 py-1 bg-blue-600/80 backdrop-blur rounded text-[11px] text-white font-mono">
                增强结果 (After)
              </span>
              <img
                src={processedImage || originalImage}
                alt="增强结果"
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          </div>
        ) : (
          /* 滑块实时对比 (Before / After Slider) */
          <div 
            className="relative max-h-full max-w-full flex items-center justify-center cursor-ew-resize overflow-hidden"
            style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
          >
            {/* 底层：原始图像 (Before) */}
            <img
              src={originalImage}
              alt="原始文档"
              className="max-h-[75vh] max-w-full object-contain pointer-events-none block"
            />
            <span className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 backdrop-blur rounded text-[11px] text-slate-300 font-mono z-10">
              原图 (Before)
            </span>

            {/* 顶层：处理后图像 (After) 带裁切蒙版 */}
            {processedImage && (
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
              >
                <img
                  src={processedImage}
                  alt="增强文档"
                  className="max-h-[75vh] max-w-full object-contain pointer-events-none block"
                />
                <span className="absolute bottom-3 right-3 px-2 py-1 bg-blue-600/90 backdrop-blur rounded text-[11px] text-white font-mono z-10">
                  增强后 (After)
                </span>
              </div>
            )}

            {/* 分割线与拖拽手柄 (满足 44x44px 触控标准) */}
            {processedImage && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)] z-20 flex items-center justify-center cursor-ew-resize"
                style={{ left: `${sliderPos}%` }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
              >
                <div className="w-10 h-10 -ml-5 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-[10px] font-bold select-none cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
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
