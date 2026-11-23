import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  RotateCcw,
  CheckCircle2,
  Info,
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

type ModuleGroupId = 'output' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6';

const SCENE_PRESETS: Array<{
  id: string;
  label: string;
  desc: string;
  summary: string;
  patch: Partial<PipelineParams>;
}> = [
  {
    id: 'shadow',
    label: '强力去阴影',
    desc: '针对侧光与手部遮挡阴影，执行形态学背景估计与 Retinex 归一化',
    summary: '开启阴影背景消除 + 净白拉伸均衡 + Sauvola 黑白扫描；关闭透视/摩尔纹/去模糊',
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
    summary: '开启 2D-FFT 频域陷波 (D0=14px) + 阴影光照校正；关闭透视与去模糊',
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
    summary: '开启维纳去模糊 (圆盘 PSF R=3, K=0.018) + 锐化 0.40；关闭频域与降噪',
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
    summary: '开启维纳去模糊 (线性运动 L=9, θ=0°, K=0.016) + 锐化 0.40；关闭频域与降噪',
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
    summary: '切换为原彩净底输出 + 开启纸白平衡 + 开启 3×3 中值滤波降噪',
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
    summary: '联动开启 (1)透视拉直 + (2)白平衡 + (3)去阴影 + (4)2D-FFT陷波 (D0=12px) + (6)二值化',
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

function diffChangedModules(prev: PipelineParams, next: PipelineParams): Set<ModuleGroupId> {
  const changed = new Set<ModuleGroupId>();
  if (prev.output_mode !== next.output_mode) changed.add('output');
  if (prev.enable_geometric !== next.enable_geometric) changed.add('s1');
  if (prev.color_space !== next.color_space || prev.enable_white_balance !== next.enable_white_balance) {
    changed.add('s2');
  }
  if (
    prev.enable_illumination !== next.enable_illumination ||
    prev.illumination_kernel_size !== next.illumination_kernel_size ||
    prev.clahe_clip_limit !== next.clahe_clip_limit ||
    prev.contrast_method !== next.contrast_method ||
    prev.denoise_method !== next.denoise_method
  ) {
    changed.add('s3');
  }
  if (
    prev.enable_frequency_filter !== next.enable_frequency_filter ||
    prev.notch_radius !== next.notch_radius
  ) {
    changed.add('s4');
  }
  if (
    prev.enable_restoration !== next.enable_restoration ||
    prev.blur_type !== next.blur_type ||
    prev.defocus_radius !== next.defocus_radius ||
    prev.motion_length !== next.motion_length ||
    prev.motion_angle !== next.motion_angle ||
    prev.wiener_k !== next.wiener_k
  ) {
    changed.add('s5');
  }
  if (
    prev.enable_binarization !== next.enable_binarization ||
    prev.binarize_method !== next.binarize_method ||
    prev.sauvola_k !== next.sauvola_k ||
    prev.sharpen_strength !== next.sharpen_strength ||
    prev.soft_blend !== next.soft_blend
  ) {
    changed.add('s6');
  }
  return changed;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  params,
  onChange,
  onApply,
  isProcessing,
}) => {
  const [presetNotice, setPresetNotice] = useState<{ title: string; summary: string } | null>(null);
  const [highlightedModules, setHighlightedModules] = useState<Set<ModuleGroupId>>(new Set());
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  // 判断当前参数是否精确命中 6 个快捷预设之一；否则即为“自定义手动精调”
  const matchedPresetId = useMemo(() => {
    for (const preset of SCENE_PRESETS) {
      const merged = { ...DEFAULT_PIPELINE_PARAMS, ...preset.patch };
      const keysToCompare: Array<keyof PipelineParams> = [
        'output_mode',
        'enable_geometric',
        'enable_white_balance',
        'enable_illumination',
        'illumination_kernel_size',
        'contrast_method',
        'denoise_method',
        'enable_frequency_filter',
        'notch_radius',
        'enable_restoration',
        'blur_type',
        'defocus_radius',
        'motion_length',
        'motion_angle',
        'wiener_k',
        'enable_binarization',
        'binarize_method',
        'sauvola_k',
        'sharpen_strength',
        'soft_blend',
      ];
      const allEqual = keysToCompare.every((k) => {
        const a = params[k];
        const b = merged[k];
        if (typeof a === 'number' && typeof b === 'number') {
          return Math.abs(a - b) < 1e-4;
        }
        return a === b;
      });
      if (allEqual) return preset.id;
    }
    return null;
  }, [params]);

  const triggerModuleHighlight = (changed: Set<ModuleGroupId>, title: string, summary: string) => {
    setHighlightedModules(changed);
    setPresetNotice({ title, summary });
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setHighlightedModules(new Set());
    }, 2200);
  };

  // 仅更新状态（用于滑块拖动过程中的流畅预览）
  const update = <K extends keyof PipelineParams>(key: K, val: PipelineParams[K]) => {
    setPresetNotice(null);
    onChange({ ...params, [key]: val });
  };

  // 更新状态并立即触发后端计算（只改当前这一项，不动其他手动配置）
  const updateAndApply = <K extends keyof PipelineParams>(key: K, val: PipelineParams[K]) => {
    setPresetNotice(null);
    const next = { ...params, [key]: val };
    onChange(next);
    onApply(next);
  };

  // 一键应用预设（会批量重置并联动覆盖下方对应参数，同时高亮闪现被修改的模块）
  const applyPreset = (preset: (typeof SCENE_PRESETS)[number]) => {
    const merged: PipelineParams = {
      ...DEFAULT_PIPELINE_PARAMS,
      ...preset.patch,
      manual_corners: params.manual_corners ?? null,
    };
    const changed = diffChangedModules(params, merged);
    onChange(merged);
    onApply(merged);
    triggerModuleHighlight(changed, `已应用「${preset.label}」一键配置`, preset.summary);
  };

  const handleResetDefault = () => {
    const changed = diffChangedModules(params, DEFAULT_PIPELINE_PARAMS);
    onChange(DEFAULT_PIPELINE_PARAMS);
    onApply(DEFAULT_PIPELINE_PARAMS);
    triggerModuleHighlight(
      changed,
      '已恢复默认参数配置',
      '所有 6 阶段开关、滤波核尺度与阈值系数均已重置回初始值'
    );
  };

  const moduleRing = (id: ModuleGroupId) =>
    highlightedModules.has(id)
      ? 'ring-2 ring-blue-500/75 border-blue-500/80 shadow-[0_0_20px_-4px_var(--accent-glow)]'
      : 'border-slate-800';

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
            onClick={handleResetDefault}
            disabled={isProcessing}
            data-fx-magnet="subtle"
            title="恢复默认参数"
            aria-label="恢复默认参数"
            className="min-w-[34px] min-h-[34px] p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 flex items-center justify-center transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <OpticalButton
            variant="pill"
            magnetic="subtle"
            onClick={() => onApply()}
            disabled={isProcessing}
            className="min-h-[34px] px-3 py-1.5 rounded-lg font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>刷新效果</span>
          </OpticalButton>
        </div>
      </div>

      {/* 场景预设一键切换（带命中状态高亮 + 自定义状态徽标 + 联动变更提示） */}
      <div className="bg-[#121826] p-2.5 rounded-lg border border-slate-800 mb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-300 flex items-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 mr-1.5 flex-shrink-0" />
            一键场景配置 (会覆盖下方参数)
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${
              matchedPresetId
                ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-300'
            }`}
          >
            {matchedPresetId ? '预设模式' : '已手动自定义'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {SCENE_PRESETS.map((preset) => {
            const isMatched = matchedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                disabled={isProcessing}
                data-fx-magnet="subtle"
                title={preset.desc}
                className={`min-h-[36px] py-1.5 px-2 rounded-lg border text-[11px] font-mono transition-all text-center truncate flex items-center justify-center ${
                  isMatched
                    ? 'optical-fx-primary bg-blue-600 text-white border-blue-400/60 font-semibold shadow-sm'
                    : 'bg-slate-900/90 hover:bg-blue-600/15 hover:border-blue-500/50 border-slate-800 text-slate-200 hover:text-blue-300'
                }`}
              >
                <span className="truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {presetNotice && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-2.5 py-2 text-[10px] leading-relaxed text-blue-200 flex items-start space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-white">{presetNotice.title}</div>
              <div className="opacity-85 mt-0.5">{presetNotice.summary}</div>
            </div>
          </div>
        )}
      </div>

      {/* 手动精细配置区说明条 */}
      <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 px-0.5 mb-2">
        <Info className="w-3 h-3 text-slate-500 flex-shrink-0" />
        <span>以下为增量手动精调：每次仅修改当前单项，松开滑块自动生效</span>
      </div>

      <div className="space-y-3">
        {/* 输出文档模式 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('output')}`}>
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
                className={`min-h-[38px] py-2 px-2 rounded-lg text-center font-mono text-[11px] transition-colors ${
                  params.output_mode === mode.id
                    ? 'optical-fx-primary bg-blue-600 text-white font-bold shadow-[0_6px_18px_-4px_var(--accent-glow)] border border-blue-400/50'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-blue-500/40'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 阶段 1: 几何矫正 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s1')}`}>
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
            拍正的文档建议关闭以保留完整白边；斜拍文档可开启或用主视窗「四角点校准」手拖。
          </p>
        </div>

        {/* 阶段 2: 色彩空间与白平衡 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s2')}`}>
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
                className="w-full min-h-[34px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-[11px]"
              >
                <option value="hsv">HSV (提取 V 亮度)</option>
                <option value="ycbcr">YCbCr (提取 Y 亮度)</option>
              </select>
            </div>
            <label className="flex items-center justify-between bg-slate-900/80 px-2.5 min-h-[34px] rounded-lg border border-slate-800 mt-4 cursor-pointer">
              <span className="text-[11px] font-mono text-slate-300">自动纸白平衡</span>
              <input
                type="checkbox"
                checked={params.enable_white_balance}
                onChange={(e) => updateAndApply('enable_white_balance', e.target.checked)}
                className="accent-blue-600 rounded cursor-pointer w-4 h-4"
              />
            </label>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            开启纸白平衡可纠正暖黄台灯/冷蓝灯光色偏，保留红章或原彩时建议保持开启。
          </p>
        </div>

        {/* 阶段 3: 空间域去噪、光照校正与对比度 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s3')}`}>
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
            <div className="space-y-3 mt-2 pt-2 border-t border-slate-800/80">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">噪点平滑滤波</label>
                  <select
                    aria-label="空间域平滑去噪算子"
                    value={params.denoise_method}
                    onChange={(e) => updateAndApply('denoise_method', e.target.value as any)}
                    className="w-full min-h-[34px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-[11px]"
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
                    className="w-full min-h-[34px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-[11px]"
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
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>← 跟紧小块锐利阴影</span>
                  <span>保护粗大黑体标题不掏空 →</span>
                </div>
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
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>← 纸底更纯净少灰斑</span>
                  <span>淡铅笔字更浓黑 →</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 阶段 4: 频域滤波去网纹 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s4')}`}>
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
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>← 轻柔滤除、护细字</span>
                <span>强力消除重网纹 →</span>
              </div>
            </div>
          )}
        </div>

        {/* 阶段 5: 退化建模与维纳滤波 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s5')}`}>
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
          {!params.enable_restoration && (
            <p className="text-[10px] text-slate-500">
              清晰照片无需开启；仅在拍虚失焦或手抖重影时勾选。
            </p>
          )}
          {params.enable_restoration && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">模糊退化类型 (PSF)</label>
                <select
                  aria-label="模糊退化类型"
                  value={params.blur_type}
                  onChange={(e) => updateAndApply('blur_type', e.target.value as any)}
                  className="w-full min-h-[34px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-[11px]"
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
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>← 更锐利 (白边/噪点略增)</span>
                  <span>画面更平滑干净 →</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 阶段 6: 二值化与锐化 */}
        <div className={`bg-[#121826] p-3 rounded-lg border transition-all ${moduleRing('s6')}`}>
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
                  className="w-full min-h-[34px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-[11px]"
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
                  <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                    <span>← 字迹更浓粗 (救淡字)</span>
                    <span>纸底更净白 (去黑点) →</span>
                  </div>
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
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>← 柔和自然</span>
                  <span>字迹轮廓更锐利 →</span>
                </div>
              </div>
              <label className="flex items-center justify-between bg-slate-900/80 px-2.5 min-h-[36px] rounded-lg border border-slate-800 cursor-pointer">
                <span className="text-[11px] font-mono text-slate-300">
                  笔画抗锯齿柔化 (消除边缘毛刺)
                </span>
                <input
                  type="checkbox"
                  checked={params.soft_blend}
                  onChange={(e) => updateAndApply('soft_blend', e.target.checked)}
                  className="accent-blue-600 rounded cursor-pointer w-4 h-4"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
