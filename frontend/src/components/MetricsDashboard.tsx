import React, { useState } from 'react';
import {
  BarChart3,
  FileText,
  Copy,
  Check,
  Award,
  FileDown,
  Loader2,
} from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';

interface MetricsDashboardProps {
  metrics: {
    psnr?: number;
    raw_psnr?: number;
    psnr_gain?: number;
    ssim?: number;
    raw_ssim?: number;
    ssim_gain?: number;
    entropy?: number;
    raw_background_uniformity?: number;
    background_uniformity?: number;
    uniformity_gain?: number;
    contrast_cnr?: number;
    sharpness_index?: number;
    has_ground_truth?: boolean;
  } | null;
  ocrData: {
    text?: string;
    raw_text?: string;
    boxes?: any[];
    comparison?: any;
  } | null;
  totalElapsedMs?: number | null;
  sampleTitle?: string;
  isOcrLoading?: boolean;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  ocrData,
  totalElapsedMs,
  sampleTitle = '当前文档',
  isOcrLoading = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [textTab, setTextTab] = useState<'enhanced' | 'raw'>('enhanced');

  const comp = ocrData?.comparison;
  const rawChars = comp?.raw?.char_count ?? 0;
  const enhChars = comp?.enhanced?.char_count ?? 0;
  const rawConf = comp?.raw?.mean_confidence;
  const enhConf = comp?.enhanced?.mean_confidence;
  const charGain = comp?.relative_gain?.char_gain_percentage;
  const accComp = comp?.accuracy_comparison;

  const displayedText =
    textTab === 'enhanced'
      ? ocrData?.text || comp?.enhanced?.text || ''
      : ocrData?.raw_text || comp?.raw?.text || '';

  const handleCopy = async () => {
    if (!displayedText) return;
    const ok = await copyTextToClipboard(displayedText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportReport = () => {
    const lines: string[] = [
      `# 文档扫描增强与文字识别报告`,
      ``,
      `- **文档名称**: ${sampleTitle}`,
      `- **处理耗时**: ${totalElapsedMs ?? '--'} ms`,
      `- **导出时间**: ${new Date().toLocaleString('zh-CN')}`,
      ``,
      `## 1. 识别提取文本`,
      ``,
      '```text',
      ocrData?.text || comp?.enhanced?.text || '(无文本)',
      '```',
      ``,
      `## 2. 图像质量诊断指标`,
      ``,
      `| 指标项 | 修复前 (Raw) | 增强后 (Enhanced) | 净提升 (Δ) |`,
      `| :--- | :---: | :---: | :---: |`,
      `| **峰值信噪比 (PSNR)** | ${metrics?.raw_psnr !== undefined ? `${metrics.raw_psnr} dB` : '--'} | **${metrics?.psnr !== undefined ? `${metrics.psnr} dB` : '--'}** | ${metrics?.psnr_gain !== undefined ? `+${metrics.psnr_gain} dB` : '--'} |`,
      `| **结构相似度 (SSIM)** | ${metrics?.raw_ssim ?? '--'} | **${metrics?.ssim ?? '--'}** | ${metrics?.ssim_gain !== undefined ? `+${metrics.ssim_gain}` : '--'} |`,
      `| **纸面背景均匀度** | ${metrics?.raw_background_uniformity !== undefined ? `${metrics.raw_background_uniformity}%` : '--'} | **${metrics?.background_uniformity !== undefined ? `${metrics.background_uniformity}%` : '--'}** | ${metrics?.uniformity_gain !== undefined ? `+${metrics.uniformity_gain}%` : '--'} |`,
      `| **文字对比噪比 (CNR)** | -- | **${metrics?.contrast_cnr ?? '--'}** | -- |`,
      `| **图像信息熵 (Entropy)** | -- | **${metrics?.entropy ?? '--'}** | -- |`,
      ``,
      `## 3. 文字识别质量对比`,
      ``,
      `- **修复前识别字数**: ${rawChars} 字 (置信度: ${rawConf ?? '--'}%)`,
      `- **增强后识别字数**: ${enhChars} 字 (置信度: ${enhConf ?? '--'}%)`,
    ];

    if (accComp) {
      lines.push(
        `- **修复前字符准确率**: ${accComp.raw_accuracy}% (CER: ${accComp.raw_cer}, WER: ${accComp.raw_wer ?? '--'})`,
        `- **增强后字符准确率**: **${accComp.enhanced_accuracy}%** (CER: ${accComp.enhanced_cer}, WER: ${accComp.enhanced_wer ?? '--'})`,
        `- **准确率净提升**: **+${accComp.accuracy_improvement}%**`
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doc_report_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-3.5 text-xs font-sans overflow-y-auto space-y-3">
      {/* 第一部分：OCR 文字提取结果（核心实用功能置顶） */}
      <div className="flex-1 flex flex-col bg-[#121826] rounded-lg border border-slate-800 p-3 overflow-hidden min-h-[195px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center space-x-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-200">文档文字识别 (OCR)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-800">
              <button
                onClick={() => setTextTab('enhanced')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  textTab === 'enhanced'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                增强后 ({enhChars})
              </button>
              <button
                onClick={() => setTextTab('raw')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  textTab === 'raw'
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                原图 ({rawChars})
              </button>
            </div>

            <button
              onClick={handleCopy}
              disabled={!displayedText}
              data-fx-magnet="subtle"
              className="optical-fx-primary flex items-center text-[11px] font-mono px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white border border-blue-400/40 shadow-sm shadow-blue-600/40 font-medium transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" /> 复制文本
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto text-[11px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed select-text bg-[#090c13] p-2.5 rounded border border-slate-800/80">
          {displayedText ? (
            displayedText
          ) : isOcrLoading ? (
            <span className="text-blue-400 inline-flex items-center">
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin flex-shrink-0" />
              高清增强图与画质指标已就绪，正在后台异步识别文字并评测 CER/WER 提升...
            </span>
          ) : (
            <span className="text-slate-500">
              导入文档照片后，将自动提取版面文字并在此处显示，支持一键复制...
            </span>
          )}
        </div>
      </div>

      {/* 第二部分：OCR 识别质量对比 */}
      <div className="bg-[#121826] p-3 rounded-lg border border-slate-800 tabular-nums">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-slate-300 flex items-center">
            <Award className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
            文字可读性提升对比
          </span>
          {isOcrLoading ? (
            <span className="inline-flex items-center text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              后台评测中...
            </span>
          ) : accComp ? (
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              +{accComp.accuracy_improvement}% 识别率提升
            </span>
          ) : (
            charGain !== undefined &&
            charGain > 0 && (
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                +{charGain}% 字数检出提升
              </span>
            )
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="text-[10px] text-slate-500">修复前原图</div>
            <div className="text-slate-300 font-bold mt-0.5">
              {accComp ? `${accComp.raw_accuracy}%` : `${rawChars} 字`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {rawChars} 字 · 置信度 {rawConf ?? '--'}%
            </div>
          </div>

          <div className="bg-blue-950/30 p-2 rounded border border-blue-800/50">
            <div className="text-[10px] text-blue-400">增强修复后</div>
            <div className="text-emerald-400 font-bold mt-0.5">
              {accComp ? `${accComp.enhanced_accuracy}%` : `${enhChars} 字`}
            </div>
            <div className="text-[10px] text-blue-300/80 mt-0.5">
              {enhChars} 字 · 置信度 {enhConf ?? '--'}%
            </div>
          </div>
        </div>

        {accComp && (
          <div className="mt-2 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
            <div className="flex justify-between">
              <span>字符错误率 CER:</span>
              <span className="text-slate-200">
                {accComp.raw_cer} → <strong className="text-emerald-400">{accComp.enhanced_cer}</strong>
              </span>
            </div>
            <div className="flex justify-between">
              <span>词错误率 WER:</span>
              <span className="text-slate-200">
                {accComp.raw_wer ?? '--'} →{' '}
                <strong className="text-emerald-400">{accComp.enhanced_wer ?? '--'}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 第三部分：图像质量客观诊断指标 (PSNR / SSIM / 均匀度) */}
      <div className="bg-[#121826] p-3 rounded-lg border border-slate-800 tabular-nums">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium text-slate-300">画质诊断指标</span>
          </div>
          <button
            onClick={handleExportReport}
            disabled={!metrics}
            data-fx-magnet="subtle"
            title="导出完整图文与质量分析报告 (.md)"
            className="flex items-center px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-700/80 hover:border-blue-500/40 text-[10px] font-mono transition-colors"
          >
            <FileDown className="w-3 h-3 mr-1 text-blue-400" />
            导出报告
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
              <span>PSNR</span>
              {metrics?.psnr_gain !== undefined && metrics.psnr_gain > 0 && (
                <span className="text-emerald-400 font-bold">+{metrics.psnr_gain}</span>
              )}
            </div>
            <div className="text-xs font-mono font-bold text-blue-400">
              {metrics?.psnr !== undefined ? `${metrics.psnr} dB` : '--'}
            </div>
            {metrics?.raw_psnr !== undefined && (
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                原图 {metrics.raw_psnr} dB
              </div>
            )}
          </div>

          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
              <span>SSIM</span>
              {metrics?.ssim_gain !== undefined && metrics.ssim_gain > 0 && (
                <span className="text-emerald-400 font-bold">+{metrics.ssim_gain}</span>
              )}
            </div>
            <div className="text-xs font-mono font-bold text-emerald-400">
              {metrics?.ssim !== undefined ? metrics.ssim : '--'}
            </div>
            {metrics?.raw_ssim !== undefined && (
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                原图 {metrics.raw_ssim}
              </div>
            )}
          </div>

          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
              <span>纸面均匀度</span>
              {metrics?.uniformity_gain !== undefined && metrics.uniformity_gain > 0 && (
                <span className="text-emerald-400 font-bold">+{metrics.uniformity_gain}%</span>
              )}
            </div>
            <div className="text-xs font-mono font-bold text-amber-400">
              {metrics?.background_uniformity !== undefined
                ? `${metrics.background_uniformity}%`
                : '--'}
            </div>
            {metrics?.raw_background_uniformity !== undefined && (
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                原图 {metrics.raw_background_uniformity}%
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          <div className="bg-[#0b0f19] px-2 py-1 rounded border border-slate-800/70 flex justify-between">
            <span className="text-slate-500">对比度 CNR:</span>
            <span className="text-slate-300">{metrics?.contrast_cnr ?? '--'}</span>
          </div>
          <div className="bg-[#0b0f19] px-2 py-1 rounded border border-slate-800/70 flex justify-between">
            <span className="text-slate-500">信息熵 H:</span>
            <span className="text-purple-400">{metrics?.entropy ?? '--'}</span>
          </div>
          <div className="bg-[#0b0f19] px-2 py-1 rounded border border-slate-800/70 flex justify-between">
            <span className="text-slate-500">耗时:</span>
            <span className="text-blue-400">
              {totalElapsedMs !== undefined && totalElapsedMs !== null ? `${totalElapsedMs}ms` : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
