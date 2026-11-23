import React from 'react';
import {
  Sliders,
  RefreshCw,
  Sparkles,
  Sun,
  ShieldCheck,
  Waves,
  Focus,
  Type,
  Palette,
  RotateCcw
} from 'lucide-react';
import { OpticalButton } from './OpticalButton';

export interface PipelineParams {
  output_mode: 'binary' | 'stamp_preserve' | 'color' | 'gray';
  auto_diagnose?: boolean;
  enable_geometric: boolean;
  manual_corners?: number[][] | null;
  color_space: 'hsv' | 'ycbcr';
  enable_white_balance: boolean;
  enable_illumination: boolean;
  illumination_kernel_size: number;
  clahe_clip_limit: number;
  contrast_method: 'stretch_clahe' | 'clahe' | 'hist_eq' | 'stretch' | 'none';
  apply_gamma: boolean;
  denoise_method: 'none' | 'median' | 'bilateral' | 'gaussian';
  denoise_ksize: number;
  enable_frequency_filter: boolean;
  notch_radius: number;
  enable_restoration: boolean;
  blur_type: 'defocus' | 'motion' | 'gaussian';
  defocus_radius: number;
  motion_length: number;
  motion_angle: number;
  wiener_k: number;
  enable_binarization: boolean;
  binarize_method: 'sauvola' | 'otsu' | 'niblack';
  sauvola_window_size: number;
  sauvola_k: number;
  sharpen: boolean;
  sharpen_strength: number;
  soft_blend: boolean;
  sampling_scale: number;
  quantization_bits: number;
}

export const DEFAULT_PIPELINE_PARAMS: PipelineParams = {
  output_mode: 'binary',
  enable_geometric: true,
  manual_corners: null,
  color_space: 'hsv',
  enable_white_balance: true,
  enable_illumination: true,
  illumination_kernel_size: 45,
  clahe_clip_limit: 2.0,
  contrast_method: 'stretch_clahe',
  apply_gamma: true,
  denoise_method: 'none',
  denoise_ksize: 3,
  enable_frequency_filter: true,
  notch_radius: 14.0,
  enable_restoration: false,
  blur_type: 'defocus',
  defocus_radius: 3,
  motion_length: 9,
  motion_angle: 0.0,
  wiener_k: 0.018,
  enable_binarization: true,
  binarize_method: 'sauvola',
  sauvola_window_size: 25,
  sauvola_k: 0.18,
  sharpen: true,
  sharpen_strength: 0.35,
  soft_blend: true,
  sampling_scale: 1.0,
  quantization_bits: 8,
};

interface ParameterPanelProps {
  params: PipelineParams;
  onChange: (newParams: PipelineParams) => void;
  onApply: (overrideParams?: PipelineParams) => void;
  isProcessing: boolean;
}

const SCENE_PRESETS: Array<{
  id: string;
  label: string;
  desc: string;
  patch: Partial<PipelineParams>;
}> = [
  {
    id: 'shadow',
    label: '强力去阴影',
    desc: '针对侧光与手部遮挡阴影，执行形态学背景估计与 Retinex 归一化',
    patch: {
      output_mode: 'binary',
      enable_geometric: false,
      enable_illumination: true,
      illumination_kernel_size: 45,
      contrast_method: 'stretch_clahe',
      enable_frequency_filter: false,
      enable_restoration: false,
      denoise_method: 'none',
      binarize_method: 'sauvola',
    },
  },
  {
    id: 'moire',
    label: '屏幕去摩尔纹',
    desc: '针对显示器翻拍，自动定位 2D-FFT 周期亮峰并陷波滤除',
    patch: {
      output_mode: 'binary',
      enable_geometric: false,
      enable_illumination: true,
      contrast_method: 'stretch_clahe',
      enable_frequency_filter: true,
      notch_radius: 14.0,
      enable_restoration: false,
      denoise_method: 'none',
      binarize_method: 'sauvola',
    },
  },
  {
    id: 'defocus',
    label: '散焦去模糊',
    desc: '圆盘 PSF 点扩散建模 + 正则化维纳反卷积恢复失焦字迹',
    patch: {
      output_mode: 'binary',
      enable_geometric: false,
      enable_illumination: true,
      contrast_method: 'stretch_clahe',
      enable_frequency_filter: false,
      enable_restoration: true,
      blur_type: 'defocus',
      defocus_radius: 3,
      wiener_k: 0.018,
      sharpen: true,
      sharpen_strength: 0.4,
    },
  },
  {
    id: 'motion',
    label: '手抖去重影',
    desc: '线性运动 PSF 核 + 维纳逆滤波消除快门抖动拖尾',
    patch: {
      output_mode: 'binary',
      enable_geometric: false,
      enable_illumination: true,
      contrast_method: 'stretch_clahe',
      enable_frequency_filter: false,
      enable_restoration: true,
      blur_type: 'motion',
      motion_length: 9,
      motion_angle: 0.0,
      wiener_k: 0.016,
      sharpen: true,
      sharpen_strength: 0.4,
    },
  },
  {
    id: 'denoise',
    label: '去偏色与降噪',
    desc: '纸白平衡校正 + 3×3 中值滤波消除椒盐与热噪点',
    patch: {
      output_mode: 'color',
      enable_geometric: false,
      enable_white_balance: true,
      enable_illumination: true,
      contrast_method: 'stretch_clahe',
      denoise_method: 'median',
      denoise_ksize: 3,
      enable_frequency_filter: false,
      enable_restoration: false,
    },
  },
  {
    id: 'complex',
    label: '全自动综合矫正',
    desc: '透视拉直 + 去阴影 + 2D-FFT 去网纹 + 自适应二值化',
    patch: {
      output_mode: 'binary',
      enable_geometric: true,
      enable_white_balance: true,
      enable_illumination: true,
      contrast_method: 'stretch_clahe',
      enable_frequency_filter: true,
      notch_radius: 12.0,
      enable_restoration: false,
      enable_binarization: true,
      binarize_method: 'sauvola',
    },
  },
];

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  params,
  onChange,
  onApply,
  isProcessing,
}) => {
  // 僅更新狀態（用於滑塊拖動過程中的流暢預覽）
  const update = <K extends keyof PipelineParams>(key: K, val: PipelineParams[K]) => {
    onChange({ ...params, [key]: val });
  };

  // 更新狀態並立即觸發後端計算（用於開關、下拉選單與模式按鈕，點擊即生效）
  const updateAndApply = <K extends keyof PipelineParams>(key: K, val: PipelineParams[K]) => {
    const next = { ...params, [key]: val };
    onChange(next);
    onApply(next);
  };

  const applyPreset = (patch: Partial<PipelineParams>) => {
    const merged: PipelineParams = { ...DEFAULT_PIPELINE_PARAMS, ...patch };
    onChange(merged);
    onApply(merged);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-3.5 text-xs font-sans overflow-y-auto">
      {/* 顶部标题与操作 */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-slate-200">场景预设与精细参数</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              onChange(DEFAULT_PIPELINE_PARAMS);
              onApply(DEFAULT_PIPELINE_PARAMS);
            }}
            disabled={isProcessing}
            data-fx-magnet="subtle"
            title="恢复默认参数"
            aria-label="恢复默认参数"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <OpticalButton
            variant="pill"
            magnetic="subtle"
            onClick={() => onApply()}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-lg font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>刷新效果</span>
          </OpticalButton>
        </div>
      </div>

      {/* 场景预设一键切换 */}
      <div className="bg-[#121826] p-2.5 rounded-lg border border-slate-800 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-slate-300 flex items-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
            快捷修复模式 (点击立即生效)
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {SCENE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.patch)}
              disabled={isProcessing}
              data-fx-magnet="subtle"
              title={preset.desc}
              className="py-1.5 px-2 rounded-lg bg-slate-900/90 hover:bg-blue-600/20 hover:border-blue-500/50 border border-slate-800 text-[11px] font-mono text-slate-200 hover:text-blue-300 transition-all text-center truncate"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {/* 输出文档模式 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <label className="block text-[11px] font-medium text-slate-300 mb-2">输出文档样式</label>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'binary', label: '高清黑白扫描' },
              { id: 'stamp_preserve', label: '红章 / 批注彩印' },
              { id: 'gray', label: '柔和增强灰度' },
              { id: 'color', label: '原彩净底保真' },
            ] as const).map((mode) => (
              <button
                key={mode.id}
                onClick={() => updateAndApply('output_mode', mode.id)}
                disabled={isProcessing}
                data-fx-magnet="subtle"
                className={`py-2 px-2 rounded-lg text-center font-mono text-[11px] transition-colors ${
                  params.output_mode === mode.id
                    ? 'optical-fx-primary bg-blue-600 text-white font-bold shadow-[0_6px_18px_-4px_rgba(37,99,235,0.65)] border border-blue-400/50'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-blue-500/40'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 阶段 1: 几何矫正 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center font-medium text-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
              (1) 自动边缘检测与透视拉直
            </span>
            <input
              type="checkbox"
              aria-label="启用透视变换几何矫正"
              checked={params.enable_geometric}
              onChange={(e) => updateAndApply('enable_geometric', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer w-4 h-4"
            />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            自动识别倾斜纸张四角并拉伸为正视图；也可点击主视窗右上角「四角点校准」手动微调。
          </p>
        </div>

        {/* 阶段 2: 色彩空间与白平衡 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-200">
              <Palette className="w-3.5 h-3.5 text-pink-400 mr-1.5" />
              (2) 色彩解耦与纸白纠偏
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 items-center">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">亮度分离空间</label>
              <select
                aria-label="亮度分离色彩空间"
                value={params.color_space}
                onChange={(e) => updateAndApply('color_space', e.target.value as 'hsv' | 'ycbcr')}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
              >
                <option value="hsv">HSV (提取 V 亮度)</option>
                <option value="ycbcr">YCbCr (提取 Y 亮度)</option>
              </select>
            </div>
            <label className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800 mt-4 cursor-pointer">
              <span className="text-[11px] font-mono text-slate-300">自动纸白平衡</span>
              <input
                type="checkbox"
                checked={params.enable_white_balance}
                onChange={(e) => updateAndApply('enable_white_balance', e.target.checked)}
                className="accent-blue-600 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* 阶段 3: 空间域去噪、光照校正与对比度 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-200">
              <Sun className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
              (3) 阴影消除与对比度增强
            </span>
            <input
              type="checkbox"
              aria-label="启用空间域光照校正"
              checked={params.enable_illumination}
              onChange={(e) => updateAndApply('enable_illumination', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer w-4 h-4"
            />
          </div>
          {params.enable_illumination && (
            <div className="space-y-2.5 mt-2 pt-2 border-t border-slate-800/80">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">噪点平滑滤波</label>
                  <select
                    aria-label="空间域平滑去噪算子"
                    value={params.denoise_method}
                    onChange={(e) => updateAndApply('denoise_method', e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                  >
                    <option value="none">关闭 (保持锐利笔画)</option>
                    <option value="median">中值滤波 (去椒盐噪点)</option>
                    <option value="bilateral">双边滤波 (保边降噪)</option>
                    <option value="gaussian">高斯平滑滤波</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">对比度增强方式</label>
                  <select
                    aria-label="对比度增强方式"
                    value={params.contrast_method}
                    onChange={(e) => updateAndApply('contrast_method', e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                  >
                    <option value="stretch_clahe">净白拉伸 + 局部均衡 (推荐)</option>
                    <option value="stretch">纯分位数线性拉伸</option>
                    <option value="clahe">标准 CLAHE 局部均衡</option>
                    <option value="hist_eq">全局直方图均衡 (HE)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                  <span>阴影估计窗口尺度:</span>
                  <span className="text-blue-400">{params.illumination_kernel_size} px</span>
                </div>
                <input
                  type="range"
                  aria-label="阴影估计窗口尺度"
                  min="21"
                  max="91"
                  step="2"
                  value={params.illumination_kernel_size}
                  onChange={(e) => update('illumination_kernel_size', parseInt(e.target.value))}
                  onMouseUp={() => onApply()}
                  onTouchEnd={() => onApply()}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                  <span>局部对比度限幅 (Clip):</span>
                  <span className="text-blue-400">{params.clahe_clip_limit.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  aria-label="CLAHE 局部对比度限幅"
                  min="1.0"
                  max="4.0"
                  step="0.5"
                  value={params.clahe_clip_limit}
                  onChange={(e) => update('clahe_clip_limit', parseFloat(e.target.value))}
                  onMouseUp={() => onApply()}
                  onTouchEnd={() => onApply()}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* 阶段 4: 频域滤波去网纹 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-200">
              <Waves className="w-3.5 h-3.5 text-cyan-400 mr-1.5" />
              (4) 2D-FFT 频域陷波去摩尔纹
            </span>
            <input
              type="checkbox"
              aria-label="启用 2D-FFT 频域陷波滤波"
              checked={params.enable_frequency_filter}
              onChange={(e) => updateAndApply('enable_frequency_filter', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer w-4 h-4"
            />
          </div>
          {params.enable_frequency_filter && (
            <div className="mt-2 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                <span>陷波阻带半径 (D0):</span>
                <span className="text-blue-400">{params.notch_radius} px</span>
              </div>
              <input
                type="range"
                aria-label="高斯陷波阻带半径"
                min="6"
                max="26"
                step="2"
                value={params.notch_radius}
                onChange={(e) => update('notch_radius', parseFloat(e.target.value))}
                onMouseUp={() => onApply()}
                onTouchEnd={() => onApply()}
                className="w-full accent-blue-600"
              />
            </div>
          )}
        </div>

        {/* 阶段 5: 退化建模与维纳滤波 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-200">
              <Focus className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
              (5) 维纳反卷积去模糊复原
            </span>
            <input
              type="checkbox"
              aria-label="启用维纳反卷积去模糊"
              checked={params.enable_restoration}
              onChange={(e) => updateAndApply('enable_restoration', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer w-4 h-4"
            />
          </div>
          {params.enable_restoration && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">模糊退化类型 (PSF)</label>
                <select
                  aria-label="模糊退化类型"
                  value={params.blur_type}
                  onChange={(e) => updateAndApply('blur_type', e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                >
                  <option value="defocus">镜头失焦模糊 (圆盘 PSF)</option>
                  <option value="motion">手抖运动模糊 (线性位移 PSF)</option>
                  <option value="gaussian">光学高斯模糊 (Gaussian PSF)</option>
                </select>
              </div>

              {params.blur_type === 'motion' ? (
                <>
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>抖动拖影长度 (L):</span>
                      <span className="text-blue-400">{params.motion_length} px</span>
                    </div>
                    <input
                      type="range"
                      aria-label="运动模糊像素长度"
                      min="3"
                      max="21"
                      step="2"
                      value={params.motion_length}
                      onChange={(e) => update('motion_length', parseInt(e.target.value))}
                      onMouseUp={() => onApply()}
                      onTouchEnd={() => onApply()}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>抖动方向角度 (θ):</span>
                      <span className="text-blue-400">{params.motion_angle}°</span>
                    </div>
                    <input
                      type="range"
                      aria-label="运动模糊倾角"
                      min="0"
                      max="180"
                      step="5"
                      value={params.motion_angle}
                      onChange={(e) => update('motion_angle', parseFloat(e.target.value))}
                      onMouseUp={() => onApply()}
                      onTouchEnd={() => onApply()}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>失焦弥散半径 (R):</span>
                    <span className="text-blue-400">{params.defocus_radius} px</span>
                  </div>
                  <input
                    type="range"
                    aria-label="散焦弥散圆半径"
                    min="1"
                    max="8"
                    value={params.defocus_radius}
                    onChange={(e) => update('defocus_radius', parseInt(e.target.value))}
                    onMouseUp={() => onApply()}
                    onTouchEnd={() => onApply()}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>维纳平滑系数 (K):</span>
                  <span className="text-blue-400">{params.wiener_k.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  aria-label="维纳噪信比常数"
                  min="0.005"
                  max="0.080"
                  step="0.005"
                  value={params.wiener_k}
                  onChange={(e) => update('wiener_k', parseFloat(e.target.value))}
                  onMouseUp={() => onApply()}
                  onTouchEnd={() => onApply()}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* 阶段 6: 二值化与锐化 */}
        <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center font-medium text-slate-200">
              <Type className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              (6) 字迹锐化与自适应二值化
            </span>
            <input
              type="checkbox"
              aria-label="启用自适应二值化"
              checked={params.enable_binarization}
              onChange={(e) => updateAndApply('enable_binarization', e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer w-4 h-4"
            />
          </div>
          {params.enable_binarization && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">二值化阈值算法</label>
                <select
                  aria-label="阈值分割算法"
                  value={params.binarize_method}
                  onChange={(e) => updateAndApply('binarize_method', e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                >
                  <option value="sauvola">Sauvola 局部动态阈值 (推荐)</option>
                  <option value="otsu">Otsu 全局大津阈值</option>
                  <option value="niblack">Niblack 局部标准差阈值</option>
                </select>
              </div>
              {params.binarize_method === 'sauvola' && (
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                    <span>笔画粗细/敏感度系数 k:</span>
                    <span className="text-blue-400">{params.sauvola_k.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Sauvola 敏感度系数 k"
                    min="0.08"
                    max="0.36"
                    step="0.02"
                    value={params.sauvola_k}
                    onChange={(e) => update('sauvola_k', parseFloat(e.target.value))}
                    onMouseUp={() => onApply()}
                    onTouchEnd={() => onApply()}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                  <span>边缘锐化强度:</span>
                  <span className="text-blue-400">{params.sharpen_strength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  aria-label="拉普拉斯高提升锐化强度"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={params.sharpen_strength}
                  onChange={(e) => update('sharpen_strength', parseFloat(e.target.value))}
                  onMouseUp={() => onApply()}
                  onTouchEnd={() => onApply()}
                  className="w-full accent-blue-600"
                />
              </div>
              <label className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800 cursor-pointer">
                <span className="text-[11px] font-mono text-slate-300">
                  笔画抗锯齿柔化 (消除边缘毛刺)
                </span>
                <input
                  type="checkbox"
                  checked={params.soft_blend}
                  onChange={(e) => updateAndApply('soft_blend', e.target.checked)}
                  className="accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
