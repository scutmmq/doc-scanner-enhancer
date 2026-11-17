import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Sliders,
  FileText,
  Grid,
  AlertCircle,
  Sparkles,
  FolderOpen,
  Layers,
  ChevronDown,
  ClipboardPaste,
  Wand2,
  ScanText,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { DarkroomViewer } from './components/DarkroomViewer';
import {
  ParameterPanel,
  PipelineParams,
  DEFAULT_PIPELINE_PARAMS
} from './components/ParameterPanel';
import { StageStepper, StageItem, DIAG_LABELS } from './components/StageStepper';
import { MetricsDashboard } from './components/MetricsDashboard';
import { SamplingLabPanel } from './components/SamplingLabPanel';

interface SampleMeta {
  filename: string;
  id: string;
  title: string;
  subtitle: string;
  recommended_preset: string;
  recommended_params: Partial<PipelineParams>;
  thumbnail_base64: string;
}

export default function App() {
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [activeSampleName, setActiveSampleName] = useState<string | null>(null);
  const [activeSampleTitle, setActiveSampleTitle] = useState<string>('未命名文档');

  const [rawImageFile, setRawImageFile] = useState<File | null>(null);
  const [rawImageBase64, setRawImageBase64] = useState<string | null>(null);
  const [rectifiedRawBase64, setRectifiedRawBase64] = useState<string | null>(null);
  const [finalImageBase64, setFinalImageBase64] = useState<string | null>(null);
  const [stages, setStages] = useState<StageItem[]>([]);
  const [activeStage, setActiveStage] = useState<StageItem | null>(null);
  const [activeDiagKey, setActiveDiagKey] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [ocrData, setOcrData] = useState<any>(null);
  const [totalElapsedMs, setTotalElapsedMs] = useState<number | null>(null);

  const [params, setParams] = useState<PipelineParams>(DEFAULT_PIPELINE_PARAMS);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rightTab, setRightTab] = useState<'params' | 'metrics' | 'sampling'>('params');
  const [showStageBar, setShowStageBar] = useState<boolean>(true);
  const [showSampleMenu, setShowSampleMenu] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sweepData, setSweepData] = useState<any>(null);
  const [isSweepLoading, setIsSweepLoading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);

  // 静默加载示例元数据（供用户自选试用，不自动弹出打断用户）
  useEffect(() => {
    const fetchSamples = async () => {
      try {
        const res = await fetch('/api/v1/samples');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.samples)) {
          setSamples(data.samples);
        }
      } catch (err) {
        console.warn('未能获取示例图列表:', err);
      }
    };
    fetchSamples();
  }, []);

  // 点击外部关闭示例下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(e.target as Node)) {
        setShowSampleMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 触发后端处理流水线
  const triggerEnhance = useCallback(
    async (
      file: File,
      curParams: PipelineParams,
      sampleName: string | null = activeSampleName
    ) => {
      setIsProcessing(true);
      setErrorMessage(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('params_json', JSON.stringify(curParams));
        if (sampleName) {
          formData.append('sample_name', sampleName);
        }

        const res = await fetch('/api/v1/enhance', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`处理失败 (${res.status}): ${await res.text()}`);
        }

        const data = await res.json();
        if (data.success) {
          setRectifiedRawBase64(data.rectified_raw_base64 || null);
          setFinalImageBase64(data.final_image_base64);
          setStages(data.stages || []);
          setActiveStage(null);
          setActiveDiagKey(null);
          setMetrics(data.metrics || null);
          setOcrData(data.ocr || null);
          setTotalElapsedMs(data.total_elapsed_ms ?? null);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message || '图像处理过程中出现异常');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeSampleName]
  );

  // 加载用户本地或粘贴的图片文件
  const loadUserFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('请上传有效的图片文件（支持 PNG、JPG、WebP、BMP）');
        return;
      }
      setRawImageFile(file);
      setActiveSampleName(null);
      setActiveSampleTitle(file.name || '剪贴板图片');
      setSweepData(null);

      const nextParams: PipelineParams = {
        ...DEFAULT_PIPELINE_PARAMS,
        manual_corners: null,
      };
      setParams(nextParams);

      const reader = new FileReader();
      reader.onload = () => {
        setRawImageBase64(reader.result as string);
        triggerEnhance(file, nextParams, null);
      };
      reader.readAsDataURL(file);
    },
    [triggerEnhance]
  );

  // 全局支持 Ctrl+V / Cmd+V 直接粘贴截图
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const pastedFile = new File([blob], `粘贴截图_${new Date().toLocaleTimeString('zh-CN')}.png`, {
              type: blob.type || 'image/png',
            });
            loadUserFile(pastedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [loadUserFile]);

  // 选择内置示例图片
  const handleSelectSample = async (sample: SampleMeta) => {
    setShowSampleMenu(false);
    setIsProcessing(true);
    setErrorMessage(null);
    setActiveSampleName(sample.filename);
    setActiveSampleTitle(sample.title);
    setSweepData(null);

    const mergedParams: PipelineParams = {
      ...DEFAULT_PIPELINE_PARAMS,
      ...(sample.recommended_params || {}),
      manual_corners: null,
    };
    setParams(mergedParams);

    try {
      const res = await fetch(`/api/v1/samples/${encodeURIComponent(sample.filename)}`);
      if (!res.ok) {
        throw new Error(`加载示例失败 (${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.image_base64) {
        setRawImageBase64(data.image_base64);
        const blobRes = await fetch(data.image_base64);
        const blob = await blobRes.blob();
        const file = new File([blob], sample.filename, { type: 'image/png' });
        setRawImageFile(file);
        await triggerEnhance(file, mergedParams, sample.filename);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '加载示例图片失败');
      setIsProcessing(false);
    }
  };

  // 清空当前工作区，返回引导首页
  const handleResetWorkspace = () => {
    setRawImageFile(null);
    setRawImageBase64(null);
    setRectifiedRawBase64(null);
    setFinalImageBase64(null);
    setStages([]);
    setActiveStage(null);
    setActiveDiagKey(null);
    setMetrics(null);
    setOcrData(null);
    setSweepData(null);
    setActiveSampleName(null);
    setErrorMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadUserFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  // 全局拖拽文件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadUserFile(e.dataTransfer.files[0]);
    }
  };

  // 手动四角点透视矫正回调
  const handleApplyManualCorners = (corners: number[][]) => {
    if (!rawImageFile) return;
    const updated: PipelineParams = {
      ...params,
      enable_geometric: true,
      manual_corners: corners,
    };
    setParams(updated);
    triggerEnhance(rawImageFile, updated, activeSampleName);
  };

  // 采样与量化实时更新
  const handleUpdateSim = (scale: number, bits: number) => {
    const updated: PipelineParams = {
      ...params,
      sampling_scale: scale,
      quantization_bits: bits,
    };
    setParams(updated);
    if (rawImageFile) {
      triggerEnhance(rawImageFile, updated, activeSampleName);
    }
  };

  // 运行采样与量化多梯度测试
  const handleRunSweep = async () => {
    if (!rawImageFile) return;
    setIsSweepLoading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', rawImageFile);
      const res = await fetch('/api/v1/sampling-lab', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`测试运行失败 (${res.status}): ${await res.text()}`);
      }
      const data = await res.json();
      if (data.success) {
        setSweepData({
          sampling_sweep: data.sampling_sweep || [],
          quantization_sweep: data.quantization_sweep || [],
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '分辨率与位深分析运行失败');
    } finally {
      setIsSweepLoading(false);
    }
  };

  const detectedCorners =
    stages.find((s) => s.stage_id === 1)?.metadata?.detected_corners || null;

  const currentDisplayProcessedImage =
    activeDiagKey && activeStage?.diagnostics?.[activeDiagKey]
      ? activeStage.diagnostics[activeDiagKey]
      : activeStage
      ? activeStage.image_base64
      : finalImageBase64;

  const currentDisplayStageName = activeDiagKey
    ? `步骤 (${activeStage?.stage_id}) · ${DIAG_LABELS[activeDiagKey] || activeDiagKey}`
    : activeStage
    ? `步骤 (${activeStage.stage_id}) ${activeStage.stage_name}`
    : '增强后文档';

  const handleDownload = () => {
    const targetImg = currentDisplayProcessedImage || finalImageBase64;
    if (!targetImg) return;
    const link = document.createElement('a');
    link.href = targetImg;
    link.download = `DocScanner_${activeSampleName || Date.now()}.png`;
    link.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen bg-[#070a10] text-slate-100 font-sans overflow-hidden relative"
    >
      {/* 拖拽文件全屏高亮提示层 */}
      {isDraggingOver && (
        <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-950/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-12 h-12 text-blue-400 mb-3 animate-bounce" />
          <div className="text-base font-semibold text-white">松开鼠标即可导入并自动增强该文档照片</div>
          <div className="text-xs text-blue-300 mt-1">支持 PNG / JPG / WebP / BMP 格式</div>
        </div>
      )}

      {/* 隐藏文件选择器 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* 顶部产品导航栏 */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-[#0d121d] border-b border-slate-800/90 select-none z-30">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleResetWorkspace}
            title="返回起始页"
            className="flex items-center space-x-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 group-hover:bg-blue-500 flex items-center justify-center font-mono font-bold text-white shadow-lg shadow-blue-600/25 transition-colors">
              DS
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-wide text-white">DocScanner</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  智能文档扫描与清晰度增强工作台
                </span>
              </div>
              <div className="text-[10px] text-slate-500 hidden md:block">
                去阴影 · 消摩尔纹 · 失焦与手抖复原 · 透视拉直 · 文字提取
              </div>
            </div>
          </button>

          {rawImageBase64 && (
            <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-slate-800 text-xs">
              <span className="text-slate-500">当前文档:</span>
              <span className="font-mono text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 max-w-[200px] truncate">
                {activeSampleTitle}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* 示例图库下拉菜单（低调内置，随时可切换体验） */}
          {samples.length > 0 && (
            <div ref={sampleMenuRef} className="relative">
              <button
                onClick={() => setShowSampleMenu((v) => !v)}
                disabled={isProcessing}
                className="flex items-center px-3 py-1.5 rounded-lg bg-[#121826] hover:bg-[#182033] text-slate-300 border border-slate-800 text-xs transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                <span>试用样张</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-400" />
              </button>

              {showSampleMenu && (
                <div className="absolute right-0 mt-1.5 w-72 bg-[#111726] border border-slate-700/90 rounded-xl shadow-2xl p-2 z-50 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-mono text-slate-400 border-b border-slate-800">
                    选择典型问题样张体验修复效果
                  </div>
                  {samples.map((s) => (
                    <button
                      key={s.filename}
                      onClick={() => handleSelectSample(s)}
                      className={`w-full flex items-center space-x-2.5 p-1.5 rounded-lg text-left transition-colors ${
                        activeSampleName === s.filename
                          ? 'bg-blue-600/20 border border-blue-500/50 text-white'
                          : 'hover:bg-slate-800/70 text-slate-200'
                      }`}
                    >
                      <img
                        src={s.thumbnail_base64}
                        alt={s.title}
                        className="w-7 h-9 object-cover rounded border border-slate-700 flex-shrink-0"
                      />
                      <div className="overflow-hidden">
                        <div className="text-xs font-medium truncate">{s.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{s.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 展开/收起底部流程栏开关 */}
          {rawImageBase64 && stages.length > 0 && (
            <button
              onClick={() => setShowStageBar((v) => !v)}
              className={`hidden sm:flex items-center px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                showStageBar
                  ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                  : 'bg-[#121826] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="显示或隐藏底部处理步骤拆解栏"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
              步骤拆解
            </button>
          )}

          {/* 上传新照片按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center px-3.5 py-1.5 rounded-lg bg-[#161f33] hover:bg-[#1e2a45] text-slate-200 border border-slate-700/80 text-xs font-medium transition-all active:scale-95"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            {rawImageBase64 ? '更换图片' : '上传图片'}
          </button>

          {/* 导出高清图按钮 */}
          {rawImageBase64 && (
            <button
              onClick={handleDownload}
              disabled={!finalImageBase64}
              className="flex items-center px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium shadow-md shadow-blue-600/20 transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              导出图片
            </button>
          )}
        </div>
      </header>

      {/* 错误提示横幅 */}
      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-400 flex items-center justify-between z-20">
          <span className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} className="underline">
            关闭
          </button>
        </div>
      )}

      {/* ====================================================================
          状态 A：未导入图片时的产品欢迎与上手引导页（清晰直观、零突兀感）
      ==================================================================== */}
      {!rawImageBase64 ? (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
          <div className="max-w-4xl w-full space-y-6">
            {/* 核心上传与拖拽卡片 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-700/90 hover:border-blue-500 bg-[#0d121d]/90 hover:bg-[#111827] p-8 sm:p-10 transition-all text-center shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 group-hover:bg-blue-600/25 transition-all">
                <Upload className="w-7 h-7 text-blue-400" />
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                导入文档照片，一键还原清晰扫描件
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
                将手机拍摄的合同、书页、发票、讲义或白板照片拖入此处，自动消除阴影、摩尔纹、模糊与倾斜畸变
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <span className="inline-flex items-center px-5 py-2.5 rounded-xl bg-blue-600 group-hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-600/25 transition-all">
                  <Upload className="w-4 h-4 mr-2" />
                  选择本地照片上传
                </span>
                <span className="inline-flex items-center px-4 py-2.5 rounded-xl bg-[#151d2e] text-slate-300 border border-slate-700/80 text-xs font-mono">
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  支持直接按 ⌘V / Ctrl+V 粘贴截图
                </span>
              </div>
            </div>

            {/* 3 步快速使用指南 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#0d121d] border border-slate-800/90 rounded-xl p-4 flex items-start space-x-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                  01
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">导入或粘贴文档图</div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    支持拖入照片、点击上传或直接粘贴剪贴板截图，系统会自动完成初步扫描增强。
                  </p>
                </div>
              </div>

              <div className="bg-[#0d121d] border border-slate-800/90 rounded-xl p-4 flex items-start space-x-3">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-blue-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                  02
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center">
                    选择针对性修复场景
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    在右侧面板一键切换「强力去阴影」「屏幕去摩尔纹」「失焦/手抖清晰化」或手动拖拽四角校准透视。
                  </p>
                </div>
              </div>

              <div className="bg-[#0d121d] border border-slate-800/90 rounded-xl p-4 flex items-start space-x-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                  03
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">对比细节与提取文字</div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    拖动中央滑块对比修复前后画质，在右侧「文字提取」面板一键复制全文或导出高清图。
                  </p>
                </div>
              </div>
            </div>

            {/* 可选：典型问题样张快捷体验区 */}
            {samples.length > 0 && (
              <div className="bg-[#0d121d] border border-slate-800/90 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      手头没有测试照片？点击下方典型问题样张立即体验：
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    涵盖 6 类常见手机翻拍退化问题
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {samples.map((s) => (
                    <button
                      key={s.filename}
                      onClick={() => handleSelectSample(s)}
                      className="group bg-[#121826] hover:bg-[#172136] border border-slate-800 hover:border-blue-500/60 rounded-lg p-2.5 text-left transition-all flex flex-col justify-between"
                    >
                      <div className="w-full h-24 bg-[#080b11] rounded border border-slate-800/80 overflow-hidden mb-2 flex items-center justify-center">
                        <img
                          src={s.thumbnail_base64}
                          alt={s.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 flex items-center justify-between">
                          <span className="truncate">{s.title}</span>
                          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                          {s.subtitle}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ====================================================================
            状态 B：已载入图片时的专业工作台视图
        ==================================================================== */
        <div className="flex-1 flex overflow-hidden p-2.5 gap-2.5">
          {/* 左侧：主对比视窗 + 可折叠处理步骤栏 */}
          <div className="flex-1 flex flex-col gap-2.5 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <DarkroomViewer
                originalImage={rawImageBase64}
                rectifiedOriginalImage={rectifiedRawBase64}
                processedImage={currentDisplayProcessedImage}
                stageName={currentDisplayStageName}
                isDiagnosticView={Boolean(activeDiagKey)}
                isProcessing={isProcessing}
                ocrBoxes={ocrData?.boxes || []}
                detectedCorners={detectedCorners}
                onApplyManualCorners={handleApplyManualCorners}
              />
            </div>

            {showStageBar && stages.length > 0 && (
              <div className="h-32 flex-shrink-0">
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

          {/* 右侧：功能控制与结果提取面板 */}
          <div className="w-[410px] flex flex-col bg-[#0d121d] rounded-xl border border-slate-800 overflow-hidden flex-shrink-0 shadow-2xl">
            <div className="grid grid-cols-3 p-1 bg-[#121826] border-b border-slate-800 select-none gap-1">
              <button
                onClick={() => setRightTab('params')}
                className={`py-1.5 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
                  rightTab === 'params'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 mr-1" />
                增强与调参
              </button>
              <button
                onClick={() => setRightTab('metrics')}
                className={`py-1.5 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
                  rightTab === 'metrics'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 mr-1" />
                文字与画质
              </button>
              <button
                onClick={() => setRightTab('sampling')}
                className={`py-1.5 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
                  rightTab === 'sampling'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5 mr-1" />
                分辨率工具
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-2">
              {rightTab === 'params' ? (
                <ParameterPanel
                  params={params}
                  onChange={setParams}
                  onApply={(overrideParams) => {
                    const targetParams = overrideParams || params;
                    if (rawImageFile) {
                      triggerEnhance(rawImageFile, targetParams, activeSampleName);
                    }
                  }}
                  isProcessing={isProcessing}
                />
              ) : rightTab === 'metrics' ? (
                <MetricsDashboard
                  metrics={metrics}
                  ocrData={ocrData}
                  totalElapsedMs={totalElapsedMs}
                  sampleTitle={activeSampleTitle}
                />
              ) : (
                <SamplingLabPanel
                  samplingScale={params.sampling_scale}
                  quantizationBits={params.quantization_bits}
                  onUpdateSim={handleUpdateSim}
                  onRunSweep={handleRunSweep}
                  sweepData={sweepData}
                  isSweepLoading={isSweepLoading}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
