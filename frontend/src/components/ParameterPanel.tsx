import React from 'react';
import { Sliders, RefreshCw, Sparkles, Sun, ShieldCheck, Waves, Focus, Type } from 'lucide-react';

export interface PipelineParams {
  output_mode: 'binary' | 'color';
  enable_geometric: boolean;
  enable_illumination: boolean;
  illumination_kernel_size: number;
  clahe_clip_limit: number;
  apply_gamma: boolean;
  enable_frequency_filter: boolean;
  notch_radius: number;
  enable_restoration: boolean;
  blur_type: 'defocus' | 'motion';
  defocus_radius: number;
  wiener_k: number;
  enable_binarization: boolean;
  binarize_method: 'sauvola' | 'otsu' | 'niblack';
  sauvola_window_size: number;
  sauvola_k: number;
  sharpen: boolean;
  sharpen_strength: number;
}

interface ParameterPanelProps {
  params: PipelineParams;
  onChange: (newParams: PipelineParams) => void;
  onApply: () => void;
  isProcessing: boolean;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  params,
  onChange,
  onApply,
  isProcessing
}) => {
  const update = <K extends keyof PipelineParams>(key: K, val: PipelineParams[K]) => {
    onChange({ ...params, [key]: val });
  };

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-4 text-xs font-sans overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-slate-200">算法流水线参数微调</span>
        </div>
        <button
          onClick={onApply}
          disabled={isProcessing}
          className="flex items-center px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium shadow-md transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isProcessing ? 'animate-spin' : ''}`} />
          重新计算
        </button>
      </div>

      <div className="space-y-5">
        {/* 输出模式 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <label className="block text-[11px] font-mono text-slate-400 mb-2">输出文档形态</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => update('output_mode', 'binary')}
              className={`py-1.5 px-3 rounded text-center font-mono text-xs transition-colors ${
                params.output_mode === 'binary' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              高清二值化 (黑白)
            </button>
            <button
              onClick={() => update('output_mode', 'color')}
              className={`py-1.5 px-3 rounded text-center font-mono text-xs transition-colors ${
                params.output_mode === 'color' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              色彩保真 (增强彩图)
            </button>
          </div>
        </div>

        {/* 阶段 1: 几何矫正 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
              (1) 透视变换几何校正
            </span>
            <input
              type="checkbox"
              checked={params.enable_geometric}
              onChange={e => update('enable_geometric', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            基于 Canny 边缘提取与凸包四边形拟合，消除倾斜俯仰角。
          </p>
        </div>

        {/* 阶段 3: 空间域光照与阴影 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-300">
              <Sun className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
              (3) 空间域去阴影与 CLAHE
            </span>
            <input
              type="checkbox"
              checked={params.enable_illumination}
              onChange={e => update('enable_illumination', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
          </div>
          {params.enable_illumination && (
            <div className="space-y-3 mt-3 pt-2 border-t border-slate-800/80">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>背景估计核尺寸 (Kernel):</span>
                  <span className="text-blue-400">{params.illumination_kernel_size} px</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="91"
                  step="2"
                  value={params.illumination_kernel_size}
                  onChange={e => update('illumination_kernel_size', parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>CLAHE 局部限幅 (Clip Limit):</span>
                  <span className="text-blue-400">{params.clahe_clip_limit}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="4.0"
                  step="0.5"
                  value={params.clahe_clip_limit}
                  onChange={e => update('clahe_clip_limit', parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* 阶段 4: 频域滤波去网纹 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-300">
              <Waves className="w-3.5 h-3.5 text-cyan-400 mr-1.5" />
              (4) 2D-FFT 频域陷波去摩尔纹
            </span>
            <input
              type="checkbox"
              checked={params.enable_frequency_filter}
              onChange={e => update('enable_frequency_filter', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
          </div>
          {params.enable_frequency_filter && (
            <div className="mt-2 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>高斯陷波半径 (D0):</span>
                <span className="text-blue-400">{params.notch_radius} px</span>
              </div>
              <input
                type="range"
                min="4"
                max="24"
                step="2"
                value={params.notch_radius}
                onChange={e => update('notch_radius', parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          )}
        </div>

        {/* 阶段 5: 退化去模糊 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-300">
              <Focus className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
              (5) 维纳反卷积去模糊
            </span>
            <input
              type="checkbox"
              checked={params.enable_restoration}
              onChange={e => update('enable_restoration', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
          </div>
          {params.enable_restoration && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>散焦弥散半径 (R):</span>
                <span className="text-blue-400">{params.defocus_radius}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                value={params.defocus_radius}
                onChange={e => update('defocus_radius', parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          )}
        </div>

        {/* 阶段 6: 二值化与锐化 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-300">
              <Type className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              (6) Sauvola 局部自适应二值化
            </span>
            <input
              type="checkbox"
              checked={params.enable_binarization}
              onChange={e => update('enable_binarization', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
          </div>
          {params.enable_binarization && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">二值化方法</label>
                <select
                  value={params.binarize_method}
                  onChange={e => update('binarize_method', e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                >
                  <option value="sauvola">Sauvola 局部自适应 (推荐)</option>
                  <option value="otsu">Otsu 全局大津法</option>
                  <option value="niblack">Niblack 局部阈值</option>
                </select>
              </div>
              {params.binarize_method === 'sauvola' && (
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span>Sauvola 敏感度 k:</span>
                    <span className="text-blue-400">{params.sauvola_k}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.4"
                    step="0.05"
                    value={params.sauvola_k}
                    onChange={e => update('sauvola_k', parseFloat(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
