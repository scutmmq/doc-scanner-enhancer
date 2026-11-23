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
  ArrowRight,
  QrCode,
  Play,
  Camera,
  Wand2,
  Palette,
} from 'lucide-react';
import { DarkroomViewer } from './components/DarkroomViewer';
import {
  ParameterPanel,
  PipelineParams,
  DEFAULT_PIPELINE_PARAMS,
} from './components/ParameterPanel';
import { StageStepper, StageItem, DIAG_LABELS } from './components/StageStepper';
import { MetricsDashboard } from './components/MetricsDashboard';
import { SamplingLabPanel } from './components/SamplingLabPanel';
import { HeroIntro } from './components/HeroIntro';
import { PhoneRelayModal } from './components/PhoneRelayModal';
import { MobileCaptureView } from './components/MobileCaptureView';
import { SimpleSmartPanel, DiagnosisReport } from './components/SimpleSmartPanel';
import { OpticalButton } from './components/OpticalButton';

interface SampleMeta {
  filename: string;
  id: string;
  title: string;
  subtitle: string;
  recommended_preset: string;
  recommended_params: Partial<PipelineParams>;
  thumbnail_base64: string;
}

type StudioTheme = 'darkroom' | 'paper' | 'leica';

const STUDIO_THEMES: Array<{
  id: StudioTheme;
  label: string;
  desc: string;
  swatches: [string, string];
}> = [
  { id: 'darkroom', label: '暗房光学', desc: '深邃玄黑 · 工程钴蓝', swatches: ['#0b101b', '#3b82f6'] },
  { id: 'paper', label: '宣纸晴空', desc: '暖白极简 · 日间编辑台', swatches: ['#f6f4ee', '#1d4ed8'] },
  { id: 'leica', label: '徕卡暖金', desc: '暖石墨黑 · 阳极氧化黄铜', swatches: ['#1a1714', '#f59e0b'] },
];

function getInitialTheme(): StudioTheme {
  if (typeof window === 'undefined') return 'darkroom';
  try {
    const saved = window.localStorage.getItem('docscanner_theme');
    if (saved === 'paper' || saved === 'leica' || saved === 'darkroom') return saved;
  } catch {
    // ignore storage errors
  }
  return 'darkroom';
}

function getInitialCaptureSession(): string | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const sid = sp.get('capture_session');
  return sid && sid.trim() ? sid.trim() : null;
}

export default function App() {
  // 手机扫码拍传会话路由检测
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(getInitialCaptureSession);

  // 开屏光学动画状态（首次进入展示，会话内记住；顶栏随时可点击「重温开屏」重播）
  const [showHero, setShowHero] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (getInitialCaptureSession()) return false;
    try {
      return window.sessionStorage.getItem('docscanner_seen_hero') !== '1';
    } catch {
      return true;
    }
  });

  // 手机扫码拍传弹窗开关
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);

  // 工作台双模式：默认 'simple' (极简智能模式，新手零负担)，可一键切至 'expert' (专业视图，完整 7 阶段与调参)
  const [workspaceMode, setWorkspaceMode] = useState<'simple' | 'expert'>('simple');
  const [uiTheme, setUiTheme] = useState<StudioTheme>(getInitialTheme);
  const [showThemeMenu, setShowThemeMenu] = useState<boolean>(false);

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
  const [diagnosis, setDiagnosis] = useState<DiagnosisReport | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [ocrData, setOcrData] = useState<any>(null);
  const [totalElapsedMs, setTotalElapsedMs] = useState<number | null>(null);

  const [params, setParams] = useState<PipelineParams>(DEFAULT_PIPELINE_PARAMS);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('正在初始化图像管线...');

  const [rightTab, setRightTab] = useState<'params' | 'metrics' | 'sampling'>('params');
  const [showStageBar, setShowStageBar] = useState<boolean>(true);
  const [showSampleMenu, setShowSampleMenu] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sweepData, setSweepData] = useState<any>(null);
  const [isSweepLoading, setIsSweepLoading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraRef = useRef<HTMLInputElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // 同步当前主题至 HTML 根元素并持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    try {
      window.localStorage.setItem('docscanner_theme', uiTheme);
    } catch {
      // ignore storage restrictions
    }
  }, [uiTheme]);

  const dismissHero = useCallback(() => {
    setShowHero(false);
    try {
      window.sessionStorage.setItem('docscanner_seen_hero', '1');
    } catch {
      // ignore storage restrictions
    }
  }, []);

  // 静默加载示例元数据
  useEffect(() => {
    if (captureSessionId) return;
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
  }, [captureSessionId]);

  // 点击外部关闭示例与主题下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(e.target as Node)) {
        setShowSampleMenu(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 应用服务端返回的完整增强结果
  const applyEnhancePayload = useCallback((data: any, syncAppliedParams: boolean) => {
    if (!data?.success) return;
    setRectifiedRawBase64(data.rectified_raw_base64 || null);
    setFinalImageBase64(data.final_image_base64);
    setStages(data.stages || []);
    setActiveStage(null);
    setActiveDiagKey(null);
    setDiagnosis(data.diagnosis || null);
    setMetrics(data.metrics || null);
    setOcrData(data.ocr || null);
    setTotalElapsedMs(data.total_elapsed_ms ?? null);
    if (syncAppliedParams && data.applied_params) {
      setParams((prev) => ({
        ...prev,
        ...data.applied_params,
        auto_diagnose: false,
      }));
    }
  }, []);

  // 触发后端处理流水线（优先使用 SSE 实时阶段进度流 `/api/v1/enhance-stream`）
  const triggerEnhance = useCallback(
    async (
      file: File,
      curParams: PipelineParams,
      sampleName: string | null = activeSampleName
    ) => {
      setIsProcessing(true);
      setProgressPercent(6);
      setProgressLabel('正在上传图像并初始化处理管线...');
      setErrorMessage(null);

      const syncApplied = Boolean(curParams.auto_diagnose);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('params_json', JSON.stringify(curParams));
        if (sampleName) {
          formData.append('sample_name', sampleName);
        }

        const res = await fetch('/api/v1/enhance-stream', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`处理失败 (${res.status}): ${await res.text()}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream') && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let gotResult = false;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // 解析标准 SSE 事件块（双换行分隔）
            const frames = buffer.split('\n\n');
            buffer = frames.pop() || '';

            for (const frame of frames) {
              if (!frame.trim() || frame.startsWith(':')) continue;
              let evtName = 'message';
              const dataLines: string[] = [];
              for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) {
                  evtName = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                  dataLines.push(line.slice(5).trim());
                }
              }
              const rawData = dataLines.join('\n');
              if (!rawData) continue;
              const parsed = JSON.parse(rawData);

              if (evtName === 'progress') {
                setProgressPercent(Number(parsed.percent ?? 15));
                if (parsed.label) setProgressLabel(String(parsed.label));
              } else if (evtName === 'result') {
                gotResult = true;
                setProgressPercent(100);
                setProgressLabel('增强处理完成');
                applyEnhancePayload(parsed, syncApplied);
              } else if (evtName === 'error') {
                throw new Error(parsed.detail || '流式处理返回错误');
              }
            }
          }

          if (!gotResult) {
            throw new Error('处理流意外中断，未收到完整结果');
          }
        } else {
          // 兼容非流式回退
          const data = await res.json();
          applyEnhancePayload(data, syncApplied);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message || '图像处理过程中出现异常');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeSampleName, applyEnhancePayload]
  );

  // 加载用户本地、剪贴板或手机扫码传回的图片文件（首次自动启用纯传统信号自动诊断）
  const loadUserFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('请上传有效的图片文件（支持 PNG、JPG、WebP、BMP）');
        return;
      }
      dismissHero();
      setRawImageFile(file);
      setActiveSampleName(null);
      setActiveSampleTitle(file.name || '剪贴板图片');
      setSweepData(null);

      const nextParams: PipelineParams = {
        ...DEFAULT_PIPELINE_PARAMS,
        manual_corners: null,
        auto_diagnose: true,
      };
      setParams(nextParams);

      const reader = new FileReader();
      reader.onload = () => {
        setRawImageBase64(reader.result as string);
        triggerEnhance(file, nextParams, null);
      };
      reader.readAsDataURL(file);
    },
    [dismissHero, triggerEnhance]
  );

  // 全局支持 Ctrl+V / Cmd+V 直接粘贴截图
  useEffect(() => {
    if (captureSessionId) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const pastedFile = new File(
              [blob],
              `粘贴截图_${new Date().toLocaleTimeString('zh-CN')}.png`,
              { type: blob.type || 'image/png' }
            );
            loadUserFile(pastedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [captureSessionId, loadUserFile]);

  // 选择内置示例图片
  const handleSelectSample = async (sample: SampleMeta) => {
    setShowSampleMenu(false);
    setIsProcessing(true);
    setProgressPercent(10);
    setProgressLabel(`正在载入样张：${sample.title}...`);
    setErrorMessage(null);
    setActiveSampleName(sample.filename);
    setActiveSampleTitle(sample.title);
    setSweepData(null);

    const mergedParams: PipelineParams = {
      ...DEFAULT_PIPELINE_PARAMS,
      ...(sample.recommended_params || {}),
      manual_corners: null,
      auto_diagnose: false,
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
    setDiagnosis(null);
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
      auto_diagnose: false,
      enable_geometric: true,
      manual_corners: corners,
    };
    setParams(updated);
    triggerEnhance(rawImageFile, updated, activeSampleName);
  };

  // 极简模式单步更新并生效
  const handleSimpleUpdateAndApply = (patch: Partial<PipelineParams>) => {
    const updated: PipelineParams = {
      ...params,
      ...patch,
      auto_diagnose: false,
    };
    setParams(updated);
    if (rawImageFile) {
      triggerEnhance(rawImageFile, updated, activeSampleName);
    }
  };

  // 一键按传统诊断结论重新优化
  const handleAutoOptimize = () => {
    if (!rawImageFile) return;
    const next: PipelineParams = {
      ...DEFAULT_PIPELINE_PARAMS,
      manual_corners: params.manual_corners ?? null,
      auto_diagnose: true,
    };
    setParams(next);
    triggerEnhance(rawImageFile, next, activeSampleName);
  };

  // 采样与量化实时更新
  const handleUpdateSim = (scale: number, bits: number) => {
    const updated: PipelineParams = {
      ...params,
      auto_diagnose: false,
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

  // 若手机扫码访问 ?capture_session=xxx，直接进入移动端专用无线拍传伴侣页
  if (captureSessionId) {
    return (
      <MobileCaptureView
        sessionId={captureSessionId}
        onSwitchToWorkbench={() => {
          setCaptureSessionId(null);
          setShowHero(false);
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    );
  }

  const detectedCorners =
    stages.find((s) => s.stage_id === 1)?.metadata?.detected_corners || null;

  const currentDisplayProcessedImage =
    workspaceMode === 'expert' && activeDiagKey && activeStage?.diagnostics?.[activeDiagKey]
      ? activeStage.diagnostics[activeDiagKey]
      : workspaceMode === 'expert' && activeStage
      ? activeStage.image_base64
      : finalImageBase64;

  const currentDisplayStageName =
    workspaceMode === 'expert' && activeDiagKey
      ? `步骤 (${activeStage?.stage_id}) · ${DIAG_LABELS[activeDiagKey] || activeDiagKey}`
      : workspaceMode === 'expert' && activeStage
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

  const currentThemeMeta = STUDIO_THEMES.find((t) => t.id === uiTheme) || STUDIO_THEMES[0];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="ds-workbench-shell flex flex-col min-h-screen lg:h-screen w-screen bg-[#070a10] text-slate-100 font-sans lg:overflow-hidden relative"
    >
      {/* 首次进入全屏光学暗房开屏引导（随时可在顶栏点击「重温开屏」重播） */}
      {showHero && (
        <HeroIntro
          onEnterWorkbench={dismissHero}
          onOpenPhoneRelay={() => {
            dismissHero();
            setShowPhoneModal(true);
          }}
        />
      )}

      {/* 手机扫码无线拍传弹窗 */}
      <PhoneRelayModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onPhotoReceived={loadUserFile}
      />

      {/* 拖拽文件全屏高亮提示层 */}
      {isDraggingOver && (
        <div className="fixed inset-3 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-950/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-12 h-12 text-blue-400 mb-3 animate-bounce" />
          <div className="text-base font-semibold text-white">松开鼠标即可导入并自动诊断增强</div>
          <div className="text-xs text-blue-300 mt-1">支持 PNG / JPG / WebP / BMP 格式，最高支持 4K 手机原图</div>
        </div>
      )}

      {/* 隐藏文件选择器与手机直拍相机选择器 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={mobileCameraRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* 顶部产品导航栏 */}
      <header className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-[#0d121d] border-b border-slate-800/90 select-none z-30 gap-2 flex-wrap">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleResetWorkspace}
            title="返回起始页"
            className="flex items-center space-x-2.5 text-left group min-h-[40px]"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 group-hover:bg-blue-500 flex items-center justify-center font-mono font-bold text-white shadow-lg shadow-blue-600/25 transition-colors">
              DS
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-wide text-white">DocScanner</span>
                <span className="text-[11px] text-slate-400 hidden 2xl:inline">
                  智能文档扫描工作台
                </span>
              </div>
              <div className="text-[10px] text-slate-500 hidden 2xl:block">
                自动诊断 · 去阴影 · 消摩尔纹 · 红章保真 · 失焦复原 · 文字提取
              </div>
            </div>
          </button>

          {rawImageBase64 && (
            <div className="hidden 2xl:flex items-center space-x-2 pl-3 border-l border-slate-800 text-xs">
              <span className="text-slate-500">当前文档:</span>
              <span className="font-mono text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 max-w-[180px] truncate">
                {activeSampleTitle}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap justify-end">
          {/* 极简模式 / 专业视图 一键双模式切换（有图时最醒目，无图也可预选） */}
          <div
            className="flex bg-[#090d16] p-0.5 rounded-lg border border-slate-800"
            role="group"
            aria-label="切换极简模式或专业视图"
          >
            <button
              onClick={() => {
                setWorkspaceMode('simple');
                setActiveStage(null);
                setActiveDiagKey(null);
              }}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center transition-colors ${
                workspaceMode === 'simple'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              <span>极简模式</span>
            </button>
            <button
              onClick={() => setWorkspaceMode('expert')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center transition-colors ${
                workspaceMode === 'expert'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 mr-1" />
              <span>专业视图</span>
            </button>
          </div>

          {/* 主题外观一键切换（暗房光学 / 宣纸晴空 / 徕卡暖金） */}
          <div ref={themeMenuRef} className="relative">
            <button
              onClick={() => setShowThemeMenu((v) => !v)}
              data-fx-magnet="subtle"
              className="flex items-center px-2.5 py-1.5 rounded-lg bg-[#121826] hover:bg-[#192338] text-slate-200 border border-slate-800 text-xs transition-colors"
              title="切换工作台视觉主题风格"
            >
              <span className="flex items-center -space-x-1 mr-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/30"
                  style={{ backgroundColor: currentThemeMeta.swatches[0] }}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/30"
                  style={{ backgroundColor: currentThemeMeta.swatches[1] }}
                />
              </span>
              <span className="hidden sm:inline">{currentThemeMeta.label}</span>
              <Palette className="w-3.5 h-3.5 sm:hidden" />
              <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-1.5 w-56 bg-[#111726] border border-slate-700/90 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
                <div className="px-2 py-1 text-[10px] font-mono text-slate-400 border-b border-slate-800">
                  切换工作台风格主题
                </div>
                {STUDIO_THEMES.map((t) => {
                  const active = uiTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setUiTheme(t.id);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                        active
                          ? 'bg-blue-600/20 border border-blue-500/50 text-white'
                          : 'hover:bg-slate-800/70 text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="flex items-center -space-x-1 flex-shrink-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-500/40 shadow-sm"
                            style={{ backgroundColor: t.swatches[0] }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-500/40 shadow-sm"
                            style={{ backgroundColor: t.swatches[1] }}
                          />
                        </span>
                        <div>
                          <div className="text-xs font-semibold leading-tight">{t.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                        </div>
                      </div>
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 手机扫码无线拍传 */}
          <button
            onClick={() => setShowPhoneModal(true)}
            data-fx-magnet="subtle"
            className="flex items-center px-3 py-1.5 rounded-lg bg-[#121826] hover:bg-[#192338] text-slate-200 border border-slate-800 hover:border-amber-400/40 text-xs transition-colors"
            title="用手机扫码直接拍照传到电脑工作台"
          >
            <QrCode className="w-3.5 h-3.5 sm:mr-1.5 text-amber-400" />
            <span className="hidden sm:inline">手机拍传</span>
          </button>

          {/* 重温开屏动画按钮 */}
          <button
            onClick={() => setShowHero(true)}
            data-fx-magnet="subtle"
            className="hidden md:flex items-center px-2.5 py-1.5 rounded-lg bg-[#121826] hover:bg-[#182033] text-slate-300 border border-slate-800 hover:border-blue-400/40 text-xs transition-colors"
            title="重温光学暗房开屏演示动画"
          >
            <Play className="w-3 h-3 mr-1.5 text-blue-400" />
            <span>重温开屏</span>
          </button>

          {/* 示例图库下拉菜单 */}
          {samples.length > 0 && (
            <div ref={sampleMenuRef} className="relative">
              <button
                onClick={() => setShowSampleMenu((v) => !v)}
                disabled={isProcessing}
                data-fx-magnet="subtle"
                className="flex items-center px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#121826] hover:bg-[#182033] text-slate-300 border border-slate-800 hover:border-slate-700 text-xs transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 sm:mr-1.5 text-amber-400" />
                <span className="hidden sm:inline">试用样张</span>
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

          {/* 展开/收起底部流程栏开关（仅专业视图下显示） */}
          {workspaceMode === 'expert' && rawImageBase64 && stages.length > 0 && (
            <button
              onClick={() => setShowStageBar((v) => !v)}
              data-fx-magnet="subtle"
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
            data-fx-magnet="subtle"
            className="flex items-center px-3 py-1.5 rounded-lg bg-[#161f33] hover:bg-[#1e2a45] text-slate-200 border border-slate-700/80 hover:border-blue-400/50 text-xs font-medium transition-all"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            <span>{rawImageBase64 ? '更换图片' : '上传图片'}</span>
          </button>

          {/* 导出高清图按钮 */}
          {rawImageBase64 && (
            <OpticalButton
              variant="pill"
              magnetic="subtle"
              onClick={handleDownload}
              disabled={!finalImageBase64}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">导出图片</span>
            </OpticalButton>
          )}
        </div>
      </header>

      {/* 错误提示横幅 */}
      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-400 flex items-center justify-between z-20">
          <span className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} className="underline ml-3 flex-shrink-0">
            关闭
          </button>
        </div>
      )}

      {/* ====================================================================
          状态 A：未导入图片时的工作台欢迎与上手引导页
      ==================================================================== */}
      {!rawImageBase64 ? (
        <div className="ds-optical-stage flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col items-center justify-center">
          <div className="max-w-4xl w-full space-y-6">
            {/* 核心上传与拖拽卡片 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              data-fx-surface=""
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-700/90 hover:border-blue-500 bg-[#0d121d]/90 hover:bg-[#111827] p-7 sm:p-10 transition-all text-center shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 group-hover:bg-blue-600/25 transition-all">
                <Upload className="w-7 h-7 text-blue-400" />
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                导入文档照片，自动诊断并还原清晰扫描件
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-xl mx-auto leading-relaxed">
                支持拖入 4K 手机原图、粘贴截图或手机扫码无线拍传。自动检测阴影、屏幕摩尔纹、失焦抖动、透视倾斜与红章批注并匹配最佳修复方案。
              </p>

              <div
                className="mt-6 flex flex-wrap items-center justify-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <OpticalButton
                  variant="primary"
                  magnetic="strong"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[48px] px-6 rounded-full text-xs sm:text-sm font-semibold"
                >
                  <Upload className="w-4 h-4 mr-2 transition-transform duration-300 group-hover:-translate-y-0.5" />
                  <span>选择本地照片上传</span>
                </OpticalButton>

                {/* 移动端直接调用后置相机 */}
                <OpticalButton
                  variant="primary"
                  magnetic="strong"
                  onClick={() => mobileCameraRef.current?.click()}
                  className="sm:hidden min-h-[48px] px-6 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 border-emerald-400/50"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  <span>直接拍照扫描</span>
                </OpticalButton>

                {/* 电脑端扫码无线拍传 */}
                <OpticalButton
                  variant="glass"
                  magnetic="strong"
                  onClick={() => setShowPhoneModal(true)}
                  className="hidden sm:inline-flex min-h-[48px] px-6 rounded-full text-xs sm:text-sm font-medium"
                >
                  <QrCode className="w-4 h-4 mr-2 text-amber-400 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                  <span>手机扫码拍传</span>
                </OpticalButton>

                <span className="hidden md:inline-flex min-h-[48px] items-center px-4 rounded-full bg-[#0a0f1a]/80 text-slate-400 border border-slate-800 text-xs font-mono">
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  ⌘V / Ctrl+V 直接粘贴
                </span>
              </div>
            </div>

            {/* 典型问题样张快捷体验区 */}
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
                      data-fx-magnet="subtle"
                      className="group bg-[#121826] hover:bg-[#172136] border border-slate-800 hover:border-blue-500/60 hover:shadow-[0_10px_28px_-8px_rgba(37,99,235,0.4)] rounded-xl p-2.5 text-left transition-all flex flex-col justify-between"
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
            状态 B：已载入图片时的响应式双模式工作台（极简模式 / 专业视图）
        ==================================================================== */
        <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden p-2.5 gap-2.5">
          {/* 左侧：主对比视窗 + 专业视图可折叠处理步骤栏 */}
          <div className="flex-1 flex flex-col gap-2.5 min-h-[52vh] lg:min-h-0 lg:overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <DarkroomViewer
                originalImage={rawImageBase64}
                rectifiedOriginalImage={rectifiedRawBase64}
                processedImage={currentDisplayProcessedImage}
                stageName={currentDisplayStageName}
                isDiagnosticView={workspaceMode === 'expert' && Boolean(activeDiagKey)}
                isProcessing={isProcessing}
                progressPercent={progressPercent}
                progressLabel={progressLabel}
                ocrBoxes={ocrData?.boxes || []}
                detectedCorners={detectedCorners}
                onApplyManualCorners={handleApplyManualCorners}
              />
            </div>

            {workspaceMode === 'expert' && showStageBar && stages.length > 0 && (
              <div className="h-[156px] flex-shrink-0">
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

          {/* 右侧：极简智能面板 OR 专业 3-Tab 调参评测面板 */}
          {workspaceMode === 'simple' ? (
            <div className="w-full lg:w-[390px] flex flex-col flex-shrink-0 shadow-2xl lg:overflow-hidden">
              <SimpleSmartPanel
                params={params}
                diagnosis={diagnosis}
                ocrText={ocrData?.text || ''}
                totalElapsedMs={totalElapsedMs}
                isProcessing={isProcessing}
                onUpdateAndApply={handleSimpleUpdateAndApply}
                onAutoOptimize={handleAutoOptimize}
                onDownload={handleDownload}
                onSwitchToExpert={() => setWorkspaceMode('expert')}
              />
            </div>
          ) : (
            <div className="w-full lg:w-[410px] flex flex-col bg-[#0d121d] rounded-xl border border-slate-800 overflow-hidden flex-shrink-0 shadow-2xl">
              <div className="grid grid-cols-3 p-1 bg-[#121826] border-b border-slate-800 select-none gap-1">
                <button
                  onClick={() => setRightTab('params')}
                  className={`py-2 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
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
                  className={`py-2 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
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
                  className={`py-2 text-[11px] font-mono font-medium rounded-lg flex items-center justify-center transition-colors ${
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
                      const targetParams = {
                        ...(overrideParams || params),
                        auto_diagnose: false,
                      };
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
          )}
        </div>
      )}
    </div>
  );
}
