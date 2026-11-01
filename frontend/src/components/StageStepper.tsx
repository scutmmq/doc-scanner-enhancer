import React from 'react';
import { CheckCircle2, ChevronRight, Activity } from 'lucide-react';

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

export const StageStepper: React.FC<StageStepperProps> = ({
  stages,
  currentStageId,
  onSelectStage,
  selectedDiagKey,
  onSelectDiag
}) => {
  return (
    <div className="bg-[#0d121d] rounded-xl border border-slate-800 p-3 select-none">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold">7 大核心算法阶段流水线流动查看</span>
          <span className="text-[10px] text-slate-500">(点击任意卡片查看该阶段产物与频谱诊断图)</span>
        </div>
        <button
          onClick={() => {
            onSelectStage(null);
            onSelectDiag(null);
          }}
          className={`text-[11px] font-mono px-2.5 py-0.5 rounded transition-colors ${
            currentStageId === null ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          查看最终增强文档
        </button>
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-1">
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
                className={`flex-shrink-0 w-44 p-2 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50 scale-[1.02]'
                    : 'bg-[#121826] border-slate-800 hover:border-slate-700 hover:bg-[#161e30]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                  <span className="text-slate-400 font-bold">阶段 ({stage.stage_id})</span>
                  <span className="text-blue-400">{stage.elapsed_ms}ms</span>
                </div>

                <div className="text-xs font-medium text-slate-200 truncate mb-1.5" title={stage.stage_name}>
                  {stage.stage_name}
                </div>

                {/* 缩略图 */}
                <div className="w-full h-16 bg-[#080b11] rounded border border-slate-800 overflow-hidden flex items-center justify-center relative">
                  <img
                    src={stage.image_base64}
                    alt={stage.stage_name}
                    className="max-h-full max-w-full object-contain"
                  />
                  {isSelected && (
                    <span className="absolute bottom-1 right-1 bg-blue-600 text-[9px] text-white px-1 rounded">
                      视窗中
                    </span>
                  )}
                </div>

                {/* 诊断图快捷按钮 (如 2D-FFT 频谱) */}
                {diagKeys.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-1">
                    {diagKeys.map(k => (
                      <button
                        key={k}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStage(stage);
                          onSelectDiag(k);
                        }}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected && selectedDiagKey === k
                            ? 'bg-amber-500 text-black font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {k === 'orig_spectrum' ? '频谱图' : k === 'estimated_background' ? '光照场' : k}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {idx < stages.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-700 flex-shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
