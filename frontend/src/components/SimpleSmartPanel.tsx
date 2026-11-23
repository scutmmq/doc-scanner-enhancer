import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Stamp,
  FileText,
  Palette,
  Contrast,
  Waves,
  Focus,
  Crop,
  Copy,
  Check,
  Download,
  Sliders,
  Wand2,
} from 'lucide-react';
import { PipelineParams } from './ParameterPanel';
import { OpticalButton } from './OpticalButton';

export interface DiagnosisIssue {
  code: string;
  label: string;
  severity: 'high' | 'medium' | 'info';
  action: string;
  metric: string;
}

export interface DiagnosisReport {
  issues: DiagnosisIssue[];
  summary_text: string;
  recommended_params: Partial<PipelineParams>;
  metrics: Record<string, any>;
  elapsed_ms: number;
}

interface SimpleSmartPanelProps {
  params: PipelineParams;
  diagnosis: DiagnosisReport | null;
  ocrText: string;
  totalElapsedMs: number | null;
  isProcessing: boolean;
  onUpdateAndApply: (patch: Partial<PipelineParams>) => void;
  onAutoOptimize: () => void;
  onDownload: () => void;
  onSwitchToExpert: () => void;
}

const STYLE_CARDS: Array<{
  id: PipelineParams['output_mode'];
  title: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
  accent: string;
}> = [
  {
    id: 'binary',
    title: '高清黑白扫描',
    desc: '净白纸底 + 锐利黑字，适合打印与归档',
    icon: Contrast,
    accent: 'text-blue-400',
  },
  {
    id: 'stamp_preserve',
    title: '红章 / 批注彩印',
    desc: '白底黑字同时保留鲜艳红章与蓝笔批注',
    icon: Stamp,
    accent: 'text-red-400',
  },
  {
    id: 'gray',
    title: '柔和灰度阅读',
    desc: '保留笔画平滑层次，适合书页讲义阅读',
    icon: FileText,
    accent: 'text-slate-300',
  },
  {
    id: 'color',
    title: '原彩净底保真',
    desc: '消除偏色与阴影，完整保留配图与色块',
    icon: Palette,
    accent: 'text-amber-400',
  },
];

export const SimpleSmartPanel: React.FC<SimpleSmartPanelProps> = ({
  params,
  diagnosis,
  ocrText,
  totalElapsedMs,
  isProcessing,
  onUpdateAndApply,
  onAutoOptimize,
  onDownload,
  onSwitchToExpert,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyText = async () => {
    if (!ocrText.trim()) return;
    try {
      await navigator.clipboard.writeText(ocrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const hasColorStamp = Boolean(diagnosis?.metrics?.has_color_stamp);

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-3 space-y-3 overflow-y-auto">
      {/* 1. 纯传统信号自动诊断报告卡 */}
      <div className="rounded-xl bg-[#111827] border border-slate-800 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-white">智能退化诊断</span>
          </div>
          {totalElapsedMs !== null && (
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              耗时 {(totalElapsedMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {diagnosis?.summary_text || '系统正在分析光照阴影、屏幕摩尔纹、倾斜角度与清晰度特征...'}
        </p>

        {diagnosis && diagnosis.issues.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diagnosis.issues.map((issue) => (
              <span
                key={issue.code}
                title={issue.action}
                className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] border ${
                  issue.severity === 'high'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : issue.severity === 'info'
                    ? 'bg-red-500/10 border-red-500/30 text-red-200'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                }`}
              >
                {issue.severity === 'info' ? (
                  <Stamp className="w-3 h-3 mr-1 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                )}
                <span>{issue.label}</span>
                <span className="ml-1.5 font-mono text-[10px] opacity-75">{issue.metric}</span>
              </span>
            ))}
          </div>
        ) : diagnosis ? (
          <div className="inline-flex items-center text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            未检出严重畸变或干扰，已执行标准高清增强
          </div>
        ) : null}

        <OpticalButton
          variant="primary"
          magnetic="subtle"
          onClick={onAutoOptimize}
          disabled={isProcessing}
          className="w-full min-h-[44px] rounded-xl text-xs font-semibold"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5 transition-transform duration-300 group-hover:rotate-12" />
          <span>一键按诊断结论自动优化</span>
        </OpticalButton>
      </div>

      {/* 2. 四大成片风格直选 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">选择扫描成片风格</span>
          {hasColorStamp && params.output_mode !== 'stamp_preserve' && (
            <span className="text-[10px] text-red-300 font-medium">检测到印章，推荐彩印模式</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STYLE_CARDS.map((card) => {
            const Icon = card.icon;
            const active = params.output_mode === card.id;
            return (
              <button
                key={card.id}
                onClick={() => onUpdateAndApply({ output_mode: card.id })}
                disabled={isProcessing}
                data-fx-magnet="subtle"
                className={`p-3 rounded-xl border text-left transition-all min-h-[76px] flex flex-col justify-between ${
                  active
                    ? 'bg-blue-600/15 border-blue-500 text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.45)]'
                    : 'bg-[#111827] hover:bg-[#161f33] border-slate-800 hover:border-blue-500/40 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-4 h-4 ${card.accent}`} />
                  {active && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-600 text-white">
                      当前
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-semibold leading-tight">{card.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{card.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 常见废片专项急救开关 */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-200">专项废片急救</span>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() =>
              onUpdateAndApply({
                enable_frequency_filter: !params.enable_frequency_filter,
                notch_radius: 14.0,
              })
            }
            disabled={isProcessing}
            data-fx-magnet="subtle"
            className={`min-h-[44px] px-2 py-2 rounded-lg border text-[11px] flex flex-col items-center justify-center transition-colors ${
              params.enable_frequency_filter
                ? 'bg-blue-600/15 border-blue-500/60 text-blue-200 font-medium shadow-[0_6px_18px_-6px_rgba(37,99,235,0.5)]'
                : 'bg-[#111827] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="w-3.5 h-3.5 mb-1" />
            <span>去摩尔纹</span>
          </button>

          <button
            onClick={() =>
              onUpdateAndApply({
                enable_restoration: !params.enable_restoration,
                blur_type: params.blur_type || 'defocus',
              })
            }
            disabled={isProcessing}
            data-fx-magnet="subtle"
            className={`min-h-[44px] px-2 py-2 rounded-lg border text-[11px] flex flex-col items-center justify-center transition-colors ${
              params.enable_restoration
                ? 'bg-blue-600/15 border-blue-500/60 text-blue-200 font-medium shadow-[0_6px_18px_-6px_rgba(37,99,235,0.5)]'
                : 'bg-[#111827] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Focus className="w-3.5 h-3.5 mb-1" />
            <span>去模糊重影</span>
          </button>

          <button
            onClick={() =>
              onUpdateAndApply({
                enable_geometric: !params.enable_geometric,
              })
            }
            disabled={isProcessing}
            data-fx-magnet="subtle"
            className={`min-h-[44px] px-2 py-2 rounded-lg border text-[11px] flex flex-col items-center justify-center transition-colors ${
              params.enable_geometric
                ? 'bg-blue-600/15 border-blue-500/60 text-blue-200 font-medium shadow-[0_6px_18px_-6px_rgba(37,99,235,0.5)]'
                : 'bg-[#111827] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop className="w-3.5 h-3.5 mb-1" />
            <span>透视拉直</span>
          </button>
        </div>
      </div>

      {/* 4. 提取文字预览与一键复制/下载 */}
      <div className="flex-1 min-h-[140px] flex flex-col rounded-xl bg-[#111827] border border-slate-800 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">识别出的文档文字</span>
          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
            {ocrText ? `${ocrText.replace(/\s+/g, '').length} 字` : '等待识别'}
          </span>
        </div>

        <div className="flex-1 bg-[#080b12] border border-slate-800/80 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 leading-relaxed overflow-y-auto min-h-[76px] max-h-36 whitespace-pre-wrap break-all select-text">
          {ocrText?.trim() || '当前页面未提取到文字内容，可尝试调整清晰度或切换风格后重试。'}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <OpticalButton
            variant="subtle"
            magnetic="subtle"
            onClick={handleCopyText}
            disabled={!ocrText?.trim()}
            className="min-h-[44px] px-3 rounded-xl text-xs font-medium"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                <span>已复制文字</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                <span>复制文字</span>
              </>
            )}
          </OpticalButton>

          <OpticalButton
            variant="primary"
            magnetic="subtle"
            onClick={onDownload}
            disabled={isProcessing}
            className="min-h-[44px] px-3 rounded-xl text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            <span>下载扫描件</span>
          </OpticalButton>
        </div>
      </div>

      {/* 底部切换到专业算法视图入口 */}
      <button
        onClick={onSwitchToExpert}
        data-fx-magnet="subtle"
        className="w-full min-h-[40px] rounded-xl border border-slate-800/90 hover:border-blue-500/40 bg-[#0b101b] hover:bg-[#111827] text-[11px] text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
      >
        <Sliders className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
        需要手动微调 7 阶段参数或查看 FFT 频谱？切换至专业视图
      </button>
    </div>
  );
};
