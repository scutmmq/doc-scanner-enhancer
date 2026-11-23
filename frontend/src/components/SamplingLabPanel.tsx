import React from 'react';
import { Grid, Play } from 'lucide-react';
import { OpticalButton } from './OpticalButton';

interface SamplingSweepItem {
  scale_factor: number;
  effective_dpi: number;
  resolution: string;
  psnr: number;
  ssim: number;
  ocr_accuracy: number;
  char_count: number;
}

interface QuantizationSweepItem {
  bits: number;
  levels: number;
  psnr: number;
  ssim: number;
  entropy: number;
  ocr_accuracy: number;
  char_count: number;
}

interface SamplingLabPanelProps {
  samplingScale: number;
  quantizationBits: number;
  onUpdateSim: (scale: number, bits: number) => void;
  onRunSweep: () => Promise<void>;
  sweepData: {
    sampling_sweep: SamplingSweepItem[];
    quantization_sweep: QuantizationSweepItem[];
  } | null;
  isSweepLoading: boolean;
}

export const SamplingLabPanel: React.FC<SamplingLabPanelProps> = ({
  samplingScale,
  quantizationBits,
  onUpdateSim,
  onRunSweep,
  sweepData,
  isSweepLoading,
}) => {
  const effectiveDpi = Math.round(300 * samplingScale);
  const grayLevels = 1 << quantizationBits;

  return (
    <div className="flex flex-col h-full bg-[#0d121d] rounded-xl border border-slate-800 p-3.5 text-xs font-sans overflow-y-auto space-y-4">
      {/* 标题栏 */}
      <div className="pb-2.5 border-b border-slate-800">
        <div className="flex items-center space-x-1.5 text-slate-100 font-semibold">
          <Grid className="w-4 h-4 text-blue-400" />
          <span>分辨率 (DPI) 与灰度位深重采样</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          调整空间采样率与色深级数，测试不同压缩程度下的文档清晰度与文字识别表现
        </p>
      </div>

      {/* 实时重采样与量化控制器 */}
      <div className="bg-[#121826] p-3 rounded-lg border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-200">实时重采样与色深设置</span>
          {(samplingScale < 0.99 || quantizationBits < 8) && (
            <button
              onClick={() => onUpdateSim(1.0, 8)}
              className="text-[10px] font-mono text-blue-400 hover:underline"
            >
              恢复原图精度 (300 DPI / 8-bit)
            </button>
          )}
        </div>

        {/* 空间采样率 DPI */}
        <div>
          <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
            <span>空间采样分辨率:</span>
            <span className="text-blue-400 font-bold tabular-nums">
              {Math.round(samplingScale * 100)}% ({effectiveDpi} DPI)
            </span>
          </div>
          <input
            type="range"
            min="0.20"
            max="1.00"
            step="0.05"
            value={samplingScale}
            onChange={(e) => onUpdateSim(parseFloat(e.target.value), quantizationBits)}
            aria-label="空间采样率比例"
            className="w-full accent-blue-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
            <span>60 DPI (低清缩略)</span>
            <span>150 DPI (均衡)</span>
            <span>300 DPI (印刷级)</span>
          </div>
        </div>

        {/* 幅度量化位数 Bits */}
        <div>
          <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
            <span>灰度位深 (Bit-Depth):</span>
            <span className="text-emerald-400 font-bold tabular-nums">
              {quantizationBits}-bit ({grayLevels} 级灰阶)
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="8"
            step="1"
            value={quantizationBits}
            onChange={(e) => onUpdateSim(samplingScale, parseInt(e.target.value))}
            aria-label="灰度量化位数"
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
            <span>1-bit (黑白二值)</span>
            <span>4-bit (16 级灰阶)</span>
            <span>8-bit (256 级全灰阶)</span>
          </div>
        </div>
      </div>

      {/* 一键运行多梯度可读性测试 */}
      <OpticalButton
        variant="primary"
        magnetic="subtle"
        onClick={onRunSweep}
        disabled={isSweepLoading}
        className="w-full min-h-[44px] py-2 px-3 rounded-xl font-medium"
      >
        <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
        <span>{isSweepLoading ? '正在测试不同分辨率与位深下的识别率...' : '生成多分辨率与位深可读性对比表'}</span>
      </OpticalButton>

      {/* 测试结果数据表 */}
      {sweepData && (
        <div className="space-y-3">
          <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono font-semibold text-blue-400 mb-2 flex items-center justify-between">
              <span>不同采样分辨率 (DPI) 下的识别表现</span>
              <span className="text-[10px] text-slate-500">8-bit 位深</span>
            </div>
            <table className="w-full text-[11px] font-mono tabular-nums text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1">等效 DPI</th>
                  <th className="py-1">像素尺寸</th>
                  <th className="py-1">PSNR</th>
                  <th className="py-1 text-right">文字识别率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {sweepData.sampling_sweep.map((row) => (
                  <tr key={row.effective_dpi} className="hover:bg-slate-800/30">
                    <td className="py-1.5 font-semibold text-slate-300">
                      {row.effective_dpi}{' '}
                      <span className="text-slate-500">({Math.round(row.scale_factor * 100)}%)</span>
                    </td>
                    <td className="py-1.5 text-slate-400">{row.resolution}</td>
                    <td className="py-1.5 text-blue-400">
                      {row.psnr >= 99 ? '∞' : `${row.psnr}dB`}
                    </td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${row.ocr_accuracy >= 90
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : row.ocr_accuracy >= 65
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                      >
                        {row.ocr_accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              建议扫描分辨率保持在 <code className="text-blue-300">150 DPI</code> 以上；低于{' '}
              <code className="text-amber-300">105 DPI</code> 时细小文字笔画容易粘连，导致识别率显著下降。
            </p>
          </div>

          <div className="bg-[#121826] p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono font-semibold text-emerald-400 mb-2 flex items-center justify-between">
              <span>不同灰度位深 (Bits) 下的图像质量与识别表现</span>
              <span className="text-[10px] text-slate-500">300 DPI</span>
            </div>
            <table className="w-full text-[11px] font-mono tabular-nums text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1">位深 (灰阶)</th>
                  <th className="py-1">信息熵 H</th>
                  <th className="py-1">SSIM</th>
                  <th className="py-1 text-right">文字识别率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {sweepData.quantization_sweep.map((row) => (
                  <tr key={row.bits} className="hover:bg-slate-800/30">
                    <td className="py-1.5 font-semibold text-slate-300">
                      {row.bits}-bit <span className="text-slate-500">({row.levels}级)</span>
                    </td>
                    <td className="py-1.5 text-purple-400">{row.entropy}</td>
                    <td className="py-1.5 text-emerald-400">{row.ssim}</td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${row.ocr_accuracy >= 90
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : row.ocr_accuracy >= 65
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                      >
                        {row.ocr_accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
