import React, { useEffect, useRef } from 'react';
import { ChevronRight, Activity, Eye } from 'lucide-react';
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
}) => {
  const listRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="bg-[#0d121d] rounded-xl border border-slate-800 p-2.5 select-none h-full flex flex-col justify-between">
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold">处理流程拆解与中间视图</span>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            (点击任意步骤或下方标签，可检视对应阶段的图层与分析图)
          </span>
        </div>
        <button
          onClick={() => {
            onSelectStage(null);
            onSelectDiag(null);
          }}
          data-fx-magnet="subtle"
          className={`text-[11px] font-mono px-2.5 py-0.5 rounded-lg flex items-center transition-colors ${
            currentStageId === null
              ? 'optical-fx-primary bg-blue-600 text-white font-bold shadow border border-blue-400/40'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-blue-500/40'
          }`}
        >
          <Eye className="w-3 h-3 mr-1" />
          返回最终成品图
        </button>
      </div>

      <div
        ref={listRef}
        className="flex items-stretch space-x-2 overflow-x-auto pb-0.5 pt-0.5 flex-1"
      >
        {stages.map((stage, idx) => {
          const isSelected = currentStageId === stage.stage_id;
          const diagKeys = Object.keys(stage.diagnostics || {});

          return (
            <React.Fragment key={stage.stage_id}>
              <div
                onClick={() => {
                  onSelectStage(stage);
                  onSelectDiag(null);
                }}
                data-fx-surface=""
                className={`stage-card-item flex-shrink-0 w-52 p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
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
                            onSelectStage(stage);
                            onSelectDiag(activeDiag ? null : k);
                          }}
                          title={`查看 ${DIAG_LABELS[k] || k}`}
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 transition-colors ${
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
