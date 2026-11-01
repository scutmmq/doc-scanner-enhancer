import React, { useState } from 'react';
import { BarChart3, FileText, Copy, Check, TrendingUp, Award } from 'lucide-react';

interface MetricsDashboardProps {
  metrics: {
    psnr?: number;
    ssim?: number;
    entropy?: number;
  } | null;
  ocrData: {
    text?: string;
    boxes?: any[];
    comparison?: any;
  } | null;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  ocrData
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!ocrData?.text) return;
    navigator.clipboard.writeText(ocrData.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const comp = ocrData?.comparison;
  const rawChars = comp?.raw?.char_count ?? 0;
  const enhChars = comp?.enhanced?.char_count ?? 0;
  const charGain = comp?.relative_gain?.char_gain_percentage;
  const accComp = comp?.accuracy_comparison;

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-4 text-xs font-sans">
      <div className="flex items-center space-x-2 pb-3 border-b border-slate-800 mb-4">
        <BarChart3 className="w-4 h-4 text-emerald-400" />
        <span className="font-semibold text-slate-200">综合质量与 OCR 识别率量化看板</span>
      </div>

      {/* 客观数学指标卡片 (PSNR / SSIM) */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#121826] p-2.5 rounded-lg border border-slate-800 text-center">
          <div className="text-[10px] font-mono text-slate-500 mb-0.5">PSNR (峰值信噪比)</div>
          <div className="text-base font-mono font-bold text-blue-400">
            {metrics?.psnr !== undefined ? `${metrics.psnr} dB` : '--'}
          </div>
        </div>

        <div className="bg-[#121826] p-2.5 rounded-lg border border-slate-800 text-center">
          <div className="text-[10px] font-mono text-slate-500 mb-0.5">SSIM (结构相似度)</div>
          <div className="text-base font-mono font-bold text-emerald-400">
            {metrics?.ssim !== undefined ? metrics.ssim : '--'}
          </div>
        </div>

        <div className="bg-[#121826] p-2.5 rounded-lg border border-slate-800 text-center">
          <div className="text-[10px] font-mono text-slate-500 mb-0.5">信息熵 (Entropy)</div>
          <div className="text-base font-mono font-bold text-purple-400">
            {metrics?.entropy !== undefined ? metrics.entropy : '--'}
          </div>
        </div>
      </div>

      {/* OCR 增益与准确率提升卡片 */}
      <div className="bg-[#121826] p-3 rounded-lg border border-slate-800 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono text-slate-400 flex items-center">
            <Award className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
            下游 RapidOCR 识别可读性增益
          </span>
          {charGain !== undefined && charGain > 0 && (
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              +{charGain}% 检出增益
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <div className="text-[10px] text-slate-500">处理前检出字数</div>
            <div className="text-slate-300 font-bold mt-0.5">{rawChars} 字</div>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-blue-900/40">
            <div className="text-[10px] text-blue-400">增强后检出字数</div>
            <div className="text-blue-300 font-bold mt-0.5">{enhChars} 字</div>
          </div>
        </div>

        {accComp && (
          <div className="mt-2.5 pt-2 border-t border-slate-800 text-xs font-mono flex justify-between items-center text-slate-300">
            <span>字符识别准确率提升:</span>
            <span className="text-emerald-400 font-bold">
              {accComp.raw_accuracy}% → {accComp.enhanced_accuracy}% (+{accComp.accuracy_improvement}%)
            </span>
          </div>
        )}
      </div>

      {/* OCR 提取文本展示与导出 */}
      <div className="flex-1 flex flex-col bg-[#121826] rounded-lg border border-slate-800 p-3 overflow-hidden min-h-[160px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 flex items-center">
            <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            提取文档文本
          </span>
          <button
            onClick={handleCopy}
            disabled={!ocrData?.text}
            className="flex items-center text-[10px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 mr-1 text-emerald-400" /> 已复制
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-1" /> 复制全文
              </>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed select-text bg-[#090c13] p-2.5 rounded border border-slate-800/80">
          {ocrData?.text ? (
            ocrData.text
          ) : (
            <span className="text-slate-600">处理完成后将在此展示提取的文档文本内容...</span>
          )}
        </div>
      </div>
    </div>
  );
};
