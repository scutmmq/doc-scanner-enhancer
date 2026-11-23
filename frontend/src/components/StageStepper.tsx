import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Activity, Eye, Hand } from 'lucide-react';
import gsap from 'gsap';

export interface StageItem {
  stage_id: number;
  stage_name: string;
  elapsed_ms: number;
  image_base64: string;
  metadata?: any;
  diagnostics?: Record<string, string>;
}

interface StageStepperProps {
  stages: StageItem[];
  currentStageId: number | null;
  onSelectStage: (stage: StageItem | null) => void;
  selectedDiagKey: string | null;
  onSelectDiag: (diagKey: string | null) => void;
  /** 'horizontal' 为桌面端底部横向轨道（默认，保持 PC 端零变动）；'vertical' 为移动端专业坞「步骤」分栏紧凑纵向列表 */
  layout?: 'horizontal' | 'vertical';
}

export const DIAG_LABELS: Record<string, string> = {
  corner_detection: '四角点检测图',
  channel_montage: '三通道解耦图',
  white_balanced_color: '白平衡纠偏图',
  estimated_background: '3D低频光照场',
  histogram_comparison: '直方图对比',
  orig_spectrum: '2D-FFT原频谱',
  filtered_spectrum: '陷波后频谱',
  psf_visualization: 'PSF点扩散核',
  sharpened_gray: '拉普拉斯锐化',
  threshold_surface: 'Sauvola阈值面',
};

export const StageStepper: React.FC<StageStepperProps> = ({
  stages,
  currentStageId,
  onSelectStage,
  selectedDiagKey,
  onSelectDiag,
  layout = 'horizontal',
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    hasDragged: boolean;
  }>({
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
    hasDragged: false,
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!listRef.current || stages.length === 0) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const cards = listRef.current.querySelectorAll('.stage-card-item');
    gsap.fromTo(
      cards,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.32,
        stagger: 0.04,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      }
    );
  }, [stages]);

  // 全局监听鼠标松开，防止鼠标拖出栏外松开后卡在拖拽态
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (dragState.current.isDown) {
        dragState.current.isDown = false;
        setIsDragging(false);
        // 延迟清零 hasDragged，以便紧随其后的 click 回调能识别刚才发生了拖拽
        window.setTimeout(() => {
          dragState.current.hasDragged = false;
        }, 40);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !listRef.current) return;
    dragState.current.isDown = true;
    dragState.current.startX = e.clientX;
    dragState.current.startScrollLeft = listRef.current.scrollLeft;
    dragState.current.hasDragged = false;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.isDown || !listRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) >= 6) {
      dragState.current.hasDragged = true;
      if (!isDragging) setIsDragging(true);
    }
    if (dragState.current.hasDragged) {
      e.preventDefault();
      listRef.current.scrollLeft = dragState.current.startScrollLeft - dx;
    }
  };

  // 支持鼠标滚轮上下滚动直接转化为横向平移
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
    }
  };

  const nudgeScroll = (delta: number) => {
    listRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (layout === 'vertical') {
    return (
      <div className="bg-[#0d121d] rounded-lg select-none h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800/80 gap-2 flex-shrink-0">
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-300 min-w-0">
            <Activity className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="font-semibold truncate">点击阶段或诊断图，上方实时切换</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectStage(null);
              onSelectDiag(null);
            }}
            className={`text-[11px] font-mono px-2.5 py-1 rounded-lg flex items-center whitespace-nowrap flex-shrink-0 transition-colors ${
              currentStageId === null
                ? 'bg-blue-600 text-white ds-keep-white font-bold shadow'
                : 'bg-slate-900 text-slate-300 border border-slate-700'
            }`}
          >
            <Eye className="w-3 h-3 mr-1" />
            最终成品
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-2">
          {stages.map((stage) => {
            const isSelected = currentStageId === stage.stage_id;
            const diagKeys = Object.keys(stage.diagnostics || {});
            return (
              <div
                key={stage.stage_id}
                onClick={() => {
                  onSelectStage(stage);
                  onSelectDiag(null);
                }}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                    : 'bg-[#121826] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-blue-400 flex-shrink-0">
                      0{stage.stage_id}
                    </span>
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {stage.stage_name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums flex-shrink-0">
                    {stage.elapsed_ms} ms
                  </span>
                </div>

                {diagKeys.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                    {diagKeys.map((k) => {
                      const activeDiag = isSelected && selectedDiagKey === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectStage(stage);
                            onSelectDiag(activeDiag ? null : k);
                          }}
                          className={`min-h-[30px] text-[11px] font-mono px-2.5 py-1 rounded-lg transition-colors ${
                            activeDiag
                              ? 'bg-amber-500 text-slate-950 font-bold shadow'
                              : 'bg-slate-900 text-slate-300 border border-slate-700/80 hover:border-amber-400/50'
                          }`}
                        >
                          {DIAG_LABELS[k] || k}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d121d] rounded-xl border border-slate-800 p-2.5 select-none h-full flex flex-col justify-between">
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 gap-2">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-300 min-w-0">
          <Activity className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="font-semibold truncate">处理流程拆解与中间视图</span>
          <span className="text-[10px] text-slate-500 hidden md:inline-flex items-center whitespace-nowrap">
            <Hand className="w-3 h-3 mr-1 opacity-75" />
            支持长按左右拖动或滚轮横滑
          </span>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <div className="hidden sm:flex items-center space-x-1">
            <button
              type="button"
              onClick={() => nudgeScroll(-240)}
              data-fx-sheen="off"
              aria-label="向左滚动步骤栏"
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => nudgeScroll(240)}
              data-fx-sheen="off"
              aria-label="向右滚动步骤栏"
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              onSelectStage(null);
              onSelectDiag(null);
            }}
            data-fx-magnet="subtle"
            className={`text-[11px] font-mono px-2.5 py-1 rounded-lg flex items-center whitespace-nowrap transition-colors ${
              currentStageId === null
                ? 'optical-fx-primary bg-blue-600 text-white font-bold shadow border border-blue-400/40'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-blue-500/40'
            }`}
          >
            <Eye className="w-3 h-3 mr-1" />
            返回最终成品图
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        className={`flex items-stretch space-x-2 overflow-x-auto pb-0.5 pt-0.5 flex-1 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {stages.map((stage, idx) => {
          const isSelected = currentStageId === stage.stage_id;
          const diagKeys = Object.keys(stage.diagnostics || {});

          return (
            <React.Fragment key={stage.stage_id}>
              <div
                onClick={() => {
                  if (dragState.current.hasDragged) return;
                  onSelectStage(stage);
                  onSelectDiag(null);
                }}
                data-fx-surface=""
                className={`stage-card-item flex-shrink-0 w-52 p-2 rounded-lg border transition-all flex flex-col justify-between ${
                  isDragging ? 'cursor-grabbing' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50'
                    : 'bg-[#121826] border-slate-800 hover:border-slate-700 hover:bg-[#161e30]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono mb-0.5 tabular-nums">
                    <span className="text-slate-400 font-bold">STAGE 0{stage.stage_id}</span>
                    <span className="text-blue-400">{stage.elapsed_ms} ms</span>
                  </div>

                  <div
                    className="text-[11px] font-medium text-slate-200 truncate mb-1"
                    title={stage.stage_name}
                  >
                    {stage.stage_name}
                  </div>
                </div>

                {/* 阶段诊断图快捷胶囊（单行紧凑排列防裁切） */}
                {diagKeys.length > 0 && (
                  <div className="pt-1 border-t border-slate-800/80 flex flex-nowrap gap-1 overflow-x-auto">
                    {diagKeys.map((k) => {
                      const activeDiag = isSelected && selectedDiagKey === k;
                      return (
                        <button
                          key={k}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (dragState.current.hasDragged) return;
                            onSelectStage(stage);
                            onSelectDiag(activeDiag ? null : k);
                          }}
                          title={`查看 ${DIAG_LABELS[k] || k}`}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 transition-colors ${
                            activeDiag
                              ? 'bg-amber-500 text-slate-950 font-bold shadow'
                              : 'bg-slate-900/90 text-slate-400 hover:text-amber-300 border border-slate-800'
                          }`}
                        >
                          {DIAG_LABELS[k] || k}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {idx < stages.length - 1 && (
                <div className="flex items-center">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
