import React, { useState, useRef } from 'react';
import { Upload, Download, Sparkles, Sliders, BarChart3, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { DarkroomViewer } from './components/DarkroomViewer';
import { ParameterPanel, PipelineParams } from './components/ParameterPanel';
import { StageStepper, StageItem } from './components/StageStepper';
import { MetricsDashboard } from './components/MetricsDashboard';

const DEFAULT_PARAMS: PipelineParams = {
  output_mode: 'binary',
  enable_geometric: true,
  enable_illumination: true,
  illumination_kernel_size: 45,
  clahe_clip_limit: 2.0,
  apply_gamma: true,
  enable_frequency_filter: true,
  notch_radius: 12.0,
  enable_restoration: false,
  blur_type: 'defocus',
  defocus_radius: 4,
  wiener_k: 0.015,
  enable_binarization: true,
  binarize_method: 'sauvola',
  sauvola_window_size: 25,
  sauvola_k: 0.2,
  sharpen: true,
  sharpen_strength: 0.4,
};

export default function App() {
  const [rawImageFile, setRawImageFile] = useState<File | null>(null);
  const [rawImageBase64, setRawImageBase64] = useState<string | null>(null);
  const [finalImageBase64, setFinalImageBase64] = useState<string | null>(null);
  const [stages, setStages] = useState<StageItem[]>([]);
  const [activeStage, setActiveStage] = useState<StageItem | null>(null);
  const [activeDiagKey, setActiveDiagKey] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [ocrData, setOcrData] = useState<any>(null);
  const [params, setParams] = useState<PipelineParams>(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rightTab, setRightTab] = useState<'params' | 'metrics'>('metrics');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 文件选取与读取
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadNewFile(e.target.files[0]);
    }
  };

  const loadNewFile = (file: File) => {
    setRawImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageBase64(reader.result as string);
      // 立即触发全自动一键增强
      triggerEnhance(file, params);
    };
    reader.readAsDataURL(file);
  };

  // 触发后端算法处理
  const triggerEnhance = async (file: File, curParams: PipelineParams) => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('params_json', JSON.stringify(curParams));

      const res = await fetch('/api/v1/enhance', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`请求失败 (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      if (data.success) {
        setFinalImageBase64(data.final_image_base64);
        setStages(data.stages || []);
        setActiveStage(null);
        setActiveDiagKey(null);
        setMetrics(data.metrics || null);
        setOcrData(data.ocr || null);
        setRightTab('metrics');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '处理过程中出现异常');
    } finally {
      setIsProcessing(false);
    }
  };

  // 当前视窗应该展示的处理后图像
  const currentDisplayProcessedImage = activeDiagKey && activeStage?.diagnostics?.[activeDiagKey]
    ? activeStage.diagnostics[activeDiagKey]
    : activeStage
    ? activeStage.image_base64
    : finalImageBase64;

  const currentDisplayStageName = activeDiagKey
    ? `${activeStage?.stage_name} - ${activeDiagKey}`
    : activeStage
    ? `阶段 (${activeStage.stage_id}) ${activeStage.stage_name}`
    : "最终高清可读文档";

  // 一键下载最终图像
  const handleDownload = () => {
    if (!finalImageBase64) return;
    const link = document.createElement('a');
    link.href = finalImageBase64;
    link.download = `enhanced_doc_${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070a10] text-slate-100 font-sans overflow-hidden">
      {/* 顶部专业工具导航栏 */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#0d121d] border-b border-slate-800 select-none z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
            D
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-wide text-white">DocScanner-Enhancer</span>
              <span className="text-[10px] font-mono bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded border border-blue-800/60">
                SCUT 数字图像处理 · 课题一
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              纯传统数字图像处理算法驱动 · 手机文档扫描与可读性增强系统
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* 上传按钮 */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center px-3.5 py-1.5 rounded-lg bg-[#161f33] hover:bg-[#1e2a45] text-slate-200 border border-slate-700/80 text-xs font-medium transition-all active:scale-95"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            导入手机拍摄照片
          </button>

          {/* 导出按钮 */}
          <button
            onClick={handleDownload}
            disabled={!finalImageBase64}
            className="flex items-center px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium shadow-md shadow-blue-600/20 transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            导出高清文档
          </button>
        </div>
      </header>

      {/* 错误提示横幅 */}
      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-400 flex items-center justify-between">
          <span className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} className="underline">关闭</button>
        </div>
      )}

      {/* 主体工作台三栏布局 */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* 左侧：视窗主区域 + 底部阶段流转器 */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {/* 中央双重视窗滑块对比 */}
          <div className="flex-1 overflow-hidden">
            <DarkroomViewer
              originalImage={rawImageBase64}
              processedImage={currentDisplayProcessedImage}
              stageName={currentDisplayStageName}
              isProcessing={isProcessing}
            />
          </div>

          {/* 底部 7 阶段中间态流动查看器 */}
          {stages.length > 0 && (
            <div className="h-36 flex-shrink-0">
              <StageStepper
                stages={stages}
                currentStageId={activeStage ? activeStage.stage_id : null}
                onSelectStage={setActiveStage}
                selectedDiagKey={activeDiagKey}
                onSelectDiag={setActiveDiagKey}
              />
            </div>
          )}
        </div>

        {/* 右侧：Tab 面板（参数微调 / 量化与 OCR 看板） */}
        <div className="w-96 flex flex-col bg-[#0d121d] rounded-xl border border-slate-800 overflow-hidden flex-shrink-0 shadow-2xl">
          {/* Tab 切换栏 */}
          <div className="grid grid-cols-2 p-1 bg-[#121826] border-b border-slate-800 select-none">
            <button
              onClick={() => setRightTab('metrics')}
              className={`py-2 text-xs font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
                rightTab === 'metrics'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              量化与 OCR 结果
            </button>
            <button
              onClick={() => setRightTab('params')}
              className={`py-2 text-xs font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
                rightTab === 'params'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 mr-1.5" />
              专家参数调节
            </button>
          </div>

          {/* Tab 内容区 */}
          <div className="flex-1 overflow-hidden p-2">
            {rightTab === 'metrics' ? (
              <MetricsDashboard metrics={metrics} ocrData={ocrData} />
            ) : (
              <ParameterPanel
                params={params}
                onChange={setParams}
                onApply={() => {
                  if (rawImageFile) triggerEnhance(rawImageFile, params);
                }}
                isProcessing={isProcessing}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
