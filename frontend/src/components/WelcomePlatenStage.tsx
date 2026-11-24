import React, { useEffect, useId, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Camera,
  ClipboardPaste,
  MoveHorizontal,
  QrCode,
  Upload,
} from 'lucide-react';
import { OpticalButton } from './OpticalButton';
import type { PipelineParams } from './ParameterPanel';

gsap.registerPlugin(useGSAP);

export interface WelcomeSampleMeta {
  filename: string;
  id: string;
  title: string;
  subtitle: string;
  recommended_preset: string;
  recommended_params: Partial<PipelineParams>;
  thumbnail_base64: string;
}

interface WelcomePlatenStageProps {
  samples: WelcomeSampleMeta[];
  isDraggingOver: boolean;
  onUploadClick: () => void;
  onCameraClick: () => void;
  onOpenPhoneRelay: () => void;
  onSelectSample: (sample: WelcomeSampleMeta) => void;
}

type SpecimenMode = 'shadow' | 'moire' | 'seal';

interface SpecimenSpec {
  id: SpecimenMode;
  label: string;
  beforeTag: string;
  afterTag: string;
  psnr: string;
  ssim: string;
  ocr: string;
}

const SPECIMEN_MODES: SpecimenSpec[] = [
  {
    id: 'shadow',
    label: '手影消除',
    beforeTag: '侧光遮挡原片',
    afterTag: 'Retinex 匀光复原',
    psnr: '5.3 → 25.5 dB',
    ssim: 'SSIM 0.960',
    ocr: 'OCR 47.8% → 98.9%',
  },
  {
    id: 'moire',
    label: '屏幕消网',
    beforeTag: 'LCD 摩尔纹',
    afterTag: '2D-FFT 共轭陷波',
    psnr: '11.4 → 23.8 dB',
    ssim: 'SSIM 0.934',
    ocr: 'OCR 62.5% → 97.6%',
  },
  {
    id: 'seal',
    label: '红章保真',
    beforeTag: '暗黄底噪原片',
    afterTag: '色度保真彩印',
    psnr: '9.8 → 24.6 dB',
    ssim: 'SSIM 0.951',
    ocr: '红章 ΔE < 2.1',
  },
];

function getSampleShortTag(sample: WelcomeSampleMeta): string {
  const key = `${sample.id} ${sample.filename}`.toLowerCase();
  if (key.includes('shadow')) return 'Retinex 匀光';
  if (key.includes('moire')) return '2D-FFT 陷波';
  if (key.includes('defocus')) return '圆盘 PSF 去糊';
  if (key.includes('complex') || key.includes('perspective')) return '透视+复合修复';
  if (key.includes('motion')) return '线性 PSF 去重影';
  if (key.includes('color') || key.includes('noise') || key.includes('denoise')) return '白平衡+降噪';
  if (key.includes('stamp') || key.includes('seal')) return 'HSV 护章彩印';
  return '一键实测';
}

/**
 * 精密光学压稿台双页 SVG 样张（确保 Before/After 几何 1:1 严格对齐，0ms 渲染）
 */
const SpecimenDocumentSheet: React.FC<{
  variant: 'before' | 'after';
  mode: SpecimenMode;
  uid: string;
}> = ({ variant, mode, uid }) => {
  const isBefore = variant === 'before';
  const paperFill = isBefore
    ? mode === 'moire'
      ? '#cfd9e3'
      : mode === 'seal'
      ? '#cec5b2'
      : '#d9d1c2'
    : '#fcfcfa';
  const inkColor = isBefore ? '#2d333d' : '#111827';
  const subInkColor = isBefore ? '#525b68' : '#475569';
  const accentStroke = isBefore ? '#64748b' : '#1d4ed8';
  const sealStroke = isBefore ? '#8f4743' : '#dc2626';
  const sealFill = isBefore ? 'rgba(143, 71, 67, 0.14)' : 'rgba(220, 38, 38, 0.08)';

  return (
    <svg
      viewBox="0 0 360 250"
      className="w-full h-full block"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-cast-shadow`} x1="0%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#0b1019" stopOpacity="0.62" />
          <stop offset="48%" stopColor="#0f172a" stopOpacity="0.46" />
          <stop offset="72%" stopColor="#0f172a" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-hand-shadow`} cx="32%" cy="62%" r="54%">
          <stop offset="0%" stopColor="#090d16" stopOpacity="0.72" />
          <stop offset="55%" stopColor="#0d1320" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#0d1320" stopOpacity="0" />
        </radialGradient>
        <pattern
          id={`${uid}-moire-grid`}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(24)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke="#1e293b" strokeWidth="1.2" strokeOpacity="0.22" />
          <line x1="5" y1="0" x2="5" y2="10" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.16" />
          <line x1="0" y1="5" x2="10" y2="5" stroke="#0f172a" strokeWidth="0.8" strokeOpacity="0.14" />
        </pattern>
        <pattern
          id={`${uid}-moire-wave`}
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-14)"
        >
          <path
            d="M0 14 Q7 6 14 14 T28 14"
            fill="none"
            stroke="#0f172a"
            strokeWidth="1.5"
            strokeOpacity="0.16"
          />
        </pattern>
      </defs>

      {/* 光学台面暗底衬垫 */}
      <rect width="360" height="250" fill={isBefore ? '#1b2029' : '#171c26'} />

      {/* A4 纸张主体（外框留出压稿台边界感） */}
      <g>
        <rect
          x="26"
          y="16"
          width="308"
          height="218"
          rx="3"
          fill={paperFill}
          stroke={isBefore ? 'rgba(15,23,42,0.22)' : 'rgba(15,23,42,0.12)'}
          strokeWidth="1"
        />

        {/* 页眉实验标识与横线 */}
        <text
          x="44"
          y="38"
          fill={subInkColor}
          fontSize="7.5"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="0.8"
        >
          SCUT · DIGITAL IMAGE LAB · EXP-01
        </text>
        <line x1="44" y1="44" x2="316" y2="44" stroke={accentStroke} strokeWidth="1" strokeOpacity="0.45" />

        {/* 文档主标题与公式 */}
        <text
          x="44"
          y="64"
          fill={inkColor}
          fontSize="12.5"
          fontWeight="700"
          fontFamily="PingFang SC, Inter, sans-serif"
        >
          文档退化建模与可解释复原测试卡
        </text>
        <text
          x="44"
          y="80"
          fill={subInkColor}
          fontSize="8"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          W(u,v) = H*/(|H|²+K) · T = m·[1+k(s/R-1)]
        </text>

        {/* 正文高对比度模拟段落（保持真实印刷行距） */}
        <g fill={inkColor} opacity={isBefore ? 0.68 : 0.92}>
          <rect x="44" y="94" width="256" height="4.5" rx="1" />
          <rect x="44" y="104" width="238" height="4.5" rx="1" />
          <rect x="44" y="114" width="262" height="4.5" rx="1" />
          <rect x="44" y="124" width="188" height="4.5" rx="1" />
        </g>

        {/* 量化对照小表格 */}
        <g>
          <rect
            x="44"
            y="140"
            width="168"
            height="72"
            rx="2"
            fill="none"
            stroke={subInkColor}
            strokeWidth="0.8"
            strokeOpacity="0.45"
          />
          <line x1="44" y1="158" x2="212" y2="158" stroke={subInkColor} strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="44" y1="176" x2="212" y2="176" stroke={subInkColor} strokeWidth="0.8" strokeOpacity="0.3" />
          <line x1="44" y1="194" x2="212" y2="194" stroke={subInkColor} strokeWidth="0.8" strokeOpacity="0.3" />
          <line x1="112" y1="140" x2="112" y2="212" stroke={subInkColor} strokeWidth="0.8" strokeOpacity="0.3" />
          <text x="52" y="152" fill={inkColor} fontSize="7.5" fontFamily="monospace">
            METRIC
          </text>
          <text x="122" y="152" fill={inkColor} fontSize="7.5" fontFamily="monospace">
            OUTPUT · 300DPI
          </text>
          <text x="52" y="170" fill={subInkColor} fontSize="7.5" fontFamily="monospace">
            PSNR
          </text>
          <text x="122" y="170" fill={inkColor} fontSize="7.5" fontFamily="monospace">
            25.49 dB
          </text>
          <text x="52" y="188" fill={subInkColor} fontSize="7.5" fontFamily="monospace">
            SSIM
          </text>
          <text x="122" y="188" fill={inkColor} fontSize="7.5" fontFamily="monospace">
            0.9602
          </text>
          <text x="52" y="206" fill={subInkColor} fontSize="7.5" fontFamily="monospace">
            CER
          </text>
          <text x="122" y="206" fill={inkColor} fontSize="7.5" fontFamily="monospace">
            1.1% (98.9%)
          </text>
        </g>

        {/* 红章印鉴与手写红色批注（对比色度保护与白底还原） */}
        <g transform="translate(268, 174)">
          <circle
            cx="0"
            cy="0"
            r="27"
            fill={sealFill}
            stroke={sealStroke}
            strokeWidth="2.2"
            strokeDasharray="6 1.2"
          />
          <circle cx="0" cy="0" r="22" fill="none" stroke={sealStroke} strokeWidth="0.9" strokeOpacity="0.7" />
          <text
            x="0"
            y="-4"
            textAnchor="middle"
            fill={sealStroke}
            fontSize="6.5"
            fontWeight="700"
            fontFamily="PingFang SC, sans-serif"
          >
            光学实验室
          </text>
          <text
            x="0"
            y="8"
            textAnchor="middle"
            fill={sealStroke}
            fontSize="6"
            fontFamily="monospace"
          >
            VERIFIED
          </text>
        </g>

        {/* 红色手写批注对勾 */}
        <path
          d="M226 168 L233 176 L248 156"
          fill="none"
          stroke={sealStroke}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 原片模式对应的真实物理退化层 */}
        {isBefore && mode === 'shadow' && (
          <g>
            <rect x="26" y="16" width="308" height="218" rx="3" fill={`url(#${uid}-cast-shadow)`} />
            <rect x="26" y="16" width="308" height="218" rx="3" fill={`url(#${uid}-hand-shadow)`} />
          </g>
        )}

        {isBefore && mode === 'moire' && (
          <g>
            <rect x="26" y="16" width="308" height="218" rx="3" fill={`url(#${uid}-moire-grid)`} />
            <rect x="26" y="16" width="308" height="218" rx="3" fill={`url(#${uid}-moire-wave)`} />
          </g>
        )}

        {isBefore && mode === 'seal' && (
          <g>
            <rect
              x="26"
              y="16"
              width="308"
              height="218"
              rx="3"
              fill="rgba(120, 96, 56, 0.22)"
            />
            <rect x="26" y="16" width="308" height="218" rx="3" fill={`url(#${uid}-cast-shadow)`} opacity="0.55" />
          </g>
        )}
      </g>
    </svg>
  );
};

export const WelcomePlatenStage: React.FC<WelcomePlatenStageProps> = ({
  samples,
  isDraggingOver,
  onUploadClick,
  onCameraClick,
  onOpenPhoneRelay,
  onSelectSample,
}) => {
  const uid = useId().replace(/:/g, '');
  const stageRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const quickXRef = useRef<gsap.QuickToFunc | null>(null);
  const quickYRef = useRef<gsap.QuickToFunc | null>(null);

  const [specimenMode, setSpecimenMode] = useState<SpecimenMode>('shadow');
  const [splitPct, setSplitPct] = useState<number>(52);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  const activeSpec =
    SPECIMEN_MODES.find((item) => item.id === specimenMode) ?? SPECIMEN_MODES[0];

  // GSAP 入场与平滑分屏微演示（严格尊重 prefers-reduced-motion）
  useGSAP(
    () => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reticleRef.current && !reducedMotion) {
        quickXRef.current = gsap.quickTo(reticleRef.current, 'x', {
          duration: 0.65,
          ease: 'power2.out',
        });
        quickYRef.current = gsap.quickTo(reticleRef.current, 'y', {
          duration: 0.65,
          ease: 'power2.out',
        });
      }

      if (reducedMotion) return;

      gsap.fromTo(
        '.js-platen-enter',
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.48,
          stagger: 0.06,
          ease: 'power2.out',
          clearProps: 'transform',
        }
      );

      const sliderObj = { value: 68 };
      gsap.to(sliderObj, {
        value: 48,
        duration: 1.0,
        delay: 0.25,
        ease: 'expo.out',
        onUpdate: () => setSplitPct(sliderObj.value),
      });
    },
    { scope: stageRef }
  );

  // 切换预演模式时轻柔滑动分界线提示差异
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = specimenMode === 'shadow' ? 48 : specimenMode === 'moire' ? 54 : 50;
    const obj = { val: splitPct };
    const tween = gsap.to(obj, {
      val: target,
      duration: 0.55,
      ease: 'power2.out',
      onUpdate: () => setSplitPct(obj.val),
    });
    return () => {
      tween.kill();
    };
    // 仅在切换 specimenMode 时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimenMode]);

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!quickXRef.current || !quickYRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    quickXRef.current(nx * 16);
    quickYRef.current(ny * 12);
  };

  const updateSplitFromClientX = (clientX: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(8, Math.min(92, pct)));
  };

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingSlider(true);
    updateSplitFromClientX(e.clientX);
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider) return;
    updateSplitFromClientX(e.clientX);
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDraggingSlider(false);
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSplitPct((prev) => Math.max(8, prev - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSplitPct((prev) => Math.min(92, prev + 5));
    }
  };

  return (
    <div
      ref={stageRef}
      onMouseMove={handleStageMouseMove}
      className="ds-welcome-platen flex-1 overflow-y-auto overflow-x-hidden flex flex-col justify-between relative"
    >
      {/* 方案一：背景 2D-FFT 同心校准环与共轭陷波靶标（超低对比度 + 光标视差） */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <svg
          ref={reticleRef}
          viewBox="0 0 1440 820"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full will-change-transform"
        >
          <g transform="translate(1020, 350)">
            <circle cx="0" cy="0" r="135" fill="none" stroke="var(--platen-ring)" strokeWidth="1" />
            <circle
              cx="0"
              cy="0"
              r="245"
              fill="none"
              stroke="var(--platen-ring)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
            <circle cx="0" cy="0" r="365" fill="none" stroke="var(--platen-hairline)" strokeWidth="1" />
            <circle cx="0" cy="0" r="495" fill="none" stroke="var(--platen-hairline)" strokeWidth="1" />
            <line x1="-560" y1="0" x2="560" y2="0" stroke="var(--platen-hairline)" strokeWidth="1" />
            <line x1="0" y1="-440" x2="0" y2="440" stroke="var(--platen-hairline)" strokeWidth="1" />
            <line
              x1="-360"
              y1="-250"
              x2="360"
              y2="250"
              stroke="var(--platen-hairline)"
              strokeWidth="0.8"
              strokeDasharray="3 5"
            />
            {/* 共轭频域陷波对 (u0, v0) / (-u0, -v0) */}
            <circle cx="154" cy="-98" r="14" fill="none" stroke="var(--platen-ring)" strokeWidth="1" />
            <circle cx="-154" cy="98" r="14" fill="none" stroke="var(--platen-ring)" strokeWidth="1" />
            <circle cx="154" cy="-98" r="2.2" fill="var(--platen-ring)" />
            <circle cx="-154" cy="98" r="2.2" fill="var(--platen-ring)" />
          </g>
        </svg>
      </div>

      {/* 主体：3 大呼吸感区块，桌面端一屏零滚动收敛 */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-5 my-auto space-y-4">
        {/* 非对称双栏舞台 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* 左栏：精简压稿台主控卡 */}
          <div
            onClick={onUploadClick}
            data-fx-surface=""
            role="region"
            aria-label="文档导入压稿台"
            className="lg:col-span-7 js-platen-enter group relative rounded-2xl p-5 sm:p-6 lg:p-7 cursor-pointer transition-all duration-300 flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: `1px solid ${isDraggingOver ? 'var(--accent)' : 'var(--border-strong)'}`,
              boxShadow: isDraggingOver
                ? '0 0 0 3px var(--accent-soft), var(--card-shadow)'
                : 'var(--card-shadow)',
            }}
          >
            {/* 四角精密 L 形对准角标 */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 w-3.5 h-3.5 border-t-2 border-l-2 rounded-tl-[2px] transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: isDraggingOver ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-3 w-3.5 h-3.5 border-t-2 border-r-2 rounded-tr-[2px] transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: isDraggingOver ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-3 w-3.5 h-3.5 border-b-2 border-l-2 rounded-bl-[2px] transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: isDraggingOver ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 w-3.5 h-3.5 border-b-2 border-r-2 rounded-br-[2px] transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: isDraggingOver ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />

            <div>
              {/* 克制行内状态提示（无边框胶囊堆砌） */}
              <div
                className="inline-flex items-center space-x-2 text-[11px] font-mono mb-2.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <span>光学扫描压稿台 · 纯传统数字图像复原</span>
              </div>

              <h1
                className="text-xl sm:text-2xl lg:text-[25px] font-bold tracking-tight leading-[1.28]"
                style={{ color: 'var(--text-primary)' }}
              >
                导入文档照片，自动诊断并还原净白扫描件
              </h1>

              <p
                className="text-xs sm:text-sm mt-2 leading-relaxed max-w-xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                针对侧光手影、屏幕摩尔纹、斜拍透视与微距失焦自动匹配传统复原管线，支持红章与批注色彩保真。
              </p>
            </div>

            {/* 操作区与单行轻量工序脚注 */}
            <div className="mt-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center gap-2.5">
                <OpticalButton
                  variant="primary"
                  magnetic="strong"
                  onClick={onUploadClick}
                  className="min-h-[44px] px-5 rounded-xl text-xs sm:text-sm font-semibold"
                >
                  <Upload className="w-4 h-4 mr-2 transition-transform duration-300 group-hover:-translate-y-0.5" />
                  <span>选择本地照片上传</span>
                </OpticalButton>

                <OpticalButton
                  variant="primary"
                  magnetic="strong"
                  onClick={onCameraClick}
                  className="sm:hidden min-h-[44px] px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 border-emerald-400/50 text-white"
                >
                  <Camera className="w-4 h-4 mr-1.5" />
                  <span>直接拍照扫描</span>
                </OpticalButton>

                <OpticalButton
                  variant="glass"
                  magnetic="strong"
                  onClick={onOpenPhoneRelay}
                  className="hidden sm:inline-flex min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-medium"
                >
                  <QrCode className="w-4 h-4 mr-2 text-amber-500 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                  <span>手机扫码拍传</span>
                </OpticalButton>

                <span
                  className="hidden md:inline-flex items-center pl-1.5 text-xs font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />
                  支持 ⌘V 直接粘贴
                </span>
              </div>

              <div
                className="mt-5 pt-3.5 border-t flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <span>01 透视拉直</span>
                <span>→</span>
                <span>02 2D-FFT 消网</span>
                <span>→</span>
                <span>03 维纳去糊</span>
                <span>→</span>
                <span>04 Retinex 匀光护章</span>
              </div>
            </div>
          </div>

          {/* 右栏：0ms 可交互 Before ⇄ After 实时预演压稿床 */}
          <div
            className="lg:col-span-5 rounded-2xl p-4 sm:p-5 flex flex-col justify-between js-platen-enter"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            {/* 预演顶栏 + 3 模式切换 */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div
                  className="text-xs font-semibold flex items-center space-x-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span>压稿台效果预演</span>
                </div>
                <div
                  className="text-[10px] font-mono mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  左右拖动分割线实时对比
                </div>
              </div>

              <div
                className="inline-flex items-center p-0.5 rounded-lg gap-0.5"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                }}
                role="tablist"
                aria-label="预演退化类型切换"
              >
                {SPECIMEN_MODES.map((item) => {
                  const active = item.id === specimenMode;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSpecimenMode(item.id)}
                      className="min-h-[34px] px-2.5 rounded-md text-[11px] font-medium transition-all"
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--accent)',
                              color: 'var(--accent-on)',
                            }
                          : {
                              color: 'var(--text-secondary)',
                            }
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 交互式 Before/After 视窗 */}
            <div
              ref={viewportRef}
              onPointerDown={handleSliderPointerDown}
              onPointerMove={handleSliderPointerMove}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              onKeyDown={handleSliderKeyDown}
              role="slider"
              tabIndex={0}
              aria-label="拖动对比增强前后效果"
              aria-valuemin={8}
              aria-valuemax={92}
              aria-valuenow={Math.round(splitPct)}
              className="mt-2.5 relative flex-1 min-h-[195px] sm:min-h-[205px] rounded-xl overflow-hidden select-none touch-none cursor-ew-resize focus:outline-none focus:ring-2"
              style={{
                backgroundColor: '#171c26',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* 底层：复原后 300 DPI 清爽纸面 */}
              <div className="absolute inset-0">
                <SpecimenDocumentSheet variant="after" mode={specimenMode} uid={`${uid}-after`} />
              </div>

              {/* 上层：退化原片（严格同框裁剪） */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
              >
                <SpecimenDocumentSheet variant="before" mode={specimenMode} uid={`${uid}-before`} />
              </div>

              {/* 角落角标 */}
              <span
                className="pointer-events-none absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  color: '#f8fafc',
                }}
              >
                原片 · {activeSpec.beforeTag}
              </span>
              <span
                className="pointer-events-none absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-on)',
                }}
              >
                {activeSpec.afterTag}
              </span>

              {/* 光学激光分割线与 44×44px 拖拽滑块手柄 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center"
                style={{ left: `${splitPct}%` }}
              >
                <div
                  className="w-0.5 h-full"
                  style={{
                    backgroundColor: 'var(--accent)',
                    boxShadow: '0 0 12px var(--accent-glow)',
                  }}
                />
                <div
                  className="absolute w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '2px solid var(--accent)',
                    color: 'var(--accent-text)',
                    transform: isDraggingSlider ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  <MoveHorizontal className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* 底部等宽对齐指标栏 */}
            <div
              className="mt-2.5 pt-2 border-t flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <span>{activeSpec.psnr}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>{activeSpec.ssim}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="font-semibold" style={{ color: 'var(--accent-text)' }}>
                {activeSpec.ocr}
              </span>
            </div>
          </div>
        </div>

        {/* 底部单行紧凑样张条（无外层大面板与黑斑缩略图，首屏一屏完整容纳） */}
        {samples.length > 0 && (
          <div className="js-platen-enter space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                手头没有测试图？点击典型退化样张立即实测
              </span>
              <span
                className="hidden sm:inline font-mono text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {samples.length} 类标准样张
              </span>
            </div>

            <div
              className={`grid grid-cols-2 sm:grid-cols-4 ${
                samples.length >= 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'
              } gap-2`}
            >
              {samples.map((s) => (
                <button
                  key={s.filename}
                  type="button"
                  onClick={() => onSelectSample(s)}
                  data-fx-magnet="subtle"
                  className="ds-sample-card group min-h-[54px] px-2 py-2 rounded-xl flex items-center gap-2 text-left"
                >
                  <div
                    className="w-7 h-9 rounded-[4px] overflow-hidden flex-shrink-0 border"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <img
                      src={s.thumbnail_base64}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-xs font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {s.title}
                    </div>
                    <div
                      className="text-[10px] font-mono truncate mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {getSampleShortTag(s)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
