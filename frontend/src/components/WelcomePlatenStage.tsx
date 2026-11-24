import React, { useEffect, useId, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ArrowRight,
  Camera,
  ClipboardPaste,
  MoveHorizontal,
  QrCode,
  ScanLine,
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

const PIPELINE_NODES = [
  { idx: '01', title: '几何矫正', desc: '四角检测与单应透视' },
  { idx: '02', title: '频域消网', desc: '2D-FFT 共轭陷波' },
  { idx: '03', title: '维纳复原', desc: 'PSF 逆滤波去模糊' },
  { idx: '04', title: '匀光保章', desc: 'Retinex 除影护红章' },
];

const RULER_MARKS = ['0mm', '50', '100', '150', 'A4 · 210mm', '250', '297mm'];

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

      {/* 方案一：顶部毫米与 DPI 物理标尺条（桌面端可见） */}
      <div
        aria-hidden="true"
        className="hidden md:flex items-center justify-between px-6 lg:px-8 h-7 border-b relative z-10 flex-shrink-0 select-none"
        style={{
          borderColor: 'var(--platen-hairline)',
          backgroundColor: 'var(--bg-header)',
        }}
      >
        <div className="flex items-center space-x-5 lg:space-x-8">
          {RULER_MARKS.map((mark) => (
            <div key={mark} className="flex items-center space-x-1.5">
              <span
                className="inline-block w-px h-2.5"
                style={{ backgroundColor: 'var(--platen-tick)' }}
              />
              <span
                className="font-mono text-[10px] tracking-wider"
                style={{ color: 'var(--platen-tick)' }}
              >
                {mark}
              </span>
            </div>
          ))}
        </div>
        <div
          className="font-mono text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--platen-tick)' }}
        >
          CALIBRATED PLATEN · 300 DPI · PURE TRADITIONAL DIP
        </div>
      </div>

      {/* 全局文件拖入状态提示浮条 */}
      {isDraggingOver && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full font-mono text-xs font-semibold shadow-xl flex items-center space-x-2 pointer-events-none"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-on)',
          }}
        >
          <ScanLine className="w-4 h-4" />
          <span>松开鼠标，立即置入光学压稿台诊断</span>
        </div>
      )}

      {/* 主体：非对称工作台双栏 + 底部检视台样张 */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 lg:py-8 my-auto space-y-5">
        {/* 方案二：非对称双栏舞台 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* 左栏：光学压稿台控制台 & 四节点流水线 */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-3.5 js-platen-enter">
            <div
              onClick={onUploadClick}
              data-fx-surface=""
              role="region"
              aria-label="文档导入压稿台"
              className="group relative flex-1 rounded-2xl p-5 sm:p-7 cursor-pointer transition-all duration-300 flex flex-col justify-between"
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
                {/* 压稿台状态标识 */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div
                    className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md text-[11px] font-mono"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      border: '1px solid var(--accent-border)',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                    <span>OPTICAL SCANNER PLATEN · 待机就绪</span>
                  </div>
                  <span
                    className="hidden sm:inline font-mono text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    MAX 4K · 7-STAGE DIP
                  </span>
                </div>

                {/* 主标题与物理工艺说明 */}
                <h1
                  className="text-xl sm:text-[26px] font-bold tracking-tight leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  把手机废片放上光学压稿台，
                  <span className="sm:block">自动诊断并还原净白扫描件</span>
                </h1>

                <p
                  className="text-xs sm:text-sm mt-2.5 leading-relaxed max-w-xl"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  自动检测侧光手影、屏幕摩尔纹、斜拍透视与微距失焦，按物理退化逆序执行可解释复原，并在彩印与二值模式中保留红章笔迹。
                </p>
              </div>

              {/* 操作区：按钮与快捷键 */}
              <div
                className="mt-5 pt-5 border-t"
                style={{ borderColor: 'var(--border-subtle)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <OpticalButton
                    variant="primary"
                    magnetic="strong"
                    onClick={onUploadClick}
                    className="min-h-[46px] px-5 sm:px-6 rounded-xl text-xs sm:text-sm font-semibold"
                  >
                    <Upload className="w-4 h-4 mr-2 transition-transform duration-300 group-hover:-translate-y-0.5" />
                    <span>选择本地照片上传</span>
                  </OpticalButton>

                  <OpticalButton
                    variant="primary"
                    magnetic="strong"
                    onClick={onCameraClick}
                    className="sm:hidden min-h-[46px] px-5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 border-emerald-400/50 text-white"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    <span>直接拍照扫描</span>
                  </OpticalButton>

                  <OpticalButton
                    variant="glass"
                    magnetic="strong"
                    onClick={onOpenPhoneRelay}
                    className="hidden sm:inline-flex min-h-[46px] px-5 rounded-xl text-xs sm:text-sm font-medium"
                  >
                    <QrCode className="w-4 h-4 mr-2 text-amber-500 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                    <span>手机扫码拍传</span>
                  </OpticalButton>

                  <span
                    className="hidden md:inline-flex min-h-[46px] items-center px-3.5 rounded-xl text-xs font-mono"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />
                    ⌘V 直接粘贴
                  </span>
                </div>

                <div
                  className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>• 拖入 JPG / PNG / WebP 原图</span>
                  <span>• 零深度学习黑盒 · 7 步中间图实时可查</span>
                </div>
              </div>
            </div>

            {/* 4 节点物理处理链路指示条 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PIPELINE_NODES.map((node) => (
                <div
                  key={node.idx}
                  className="rounded-xl px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="font-mono text-[10px] font-bold"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      {node.idx}
                    </span>
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {node.title}
                    </span>
                  </div>
                  <div
                    className="text-[10px] mt-0.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {node.desc}
                  </div>
                </div>
              ))}
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
              className="mt-3 relative flex-1 min-h-[225px] sm:min-h-[248px] rounded-xl overflow-hidden select-none touch-none cursor-ew-resize focus:outline-none focus:ring-2"
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
              className="mt-3 pt-2.5 border-t flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums"
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

        {/* 底部升级版：6 类标准退化样张检视台（修正竖版 A4 缩略图裁切问题） */}
        {samples.length > 0 && (
          <div
            className="js-platen-enter rounded-2xl p-4 sm:p-5"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <span
                  className="text-xs sm:text-[13px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  标准退化样张检视台 · 点击卡片一键载入全流程实测
                </span>
              </div>
              <span
                className="hidden sm:inline font-mono text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                01 — 0{samples.length} SPECIMENS
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
              {samples.map((s, idx) => (
                <button
                  key={s.filename}
                  type="button"
                  onClick={() => onSelectSample(s)}
                  data-fx-magnet="subtle"
                  className="ds-sample-card group min-h-[44px] rounded-xl p-2.5 text-left flex flex-col justify-between"
                >
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="font-mono text-[10px] font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <ArrowRight
                        className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0"
                        style={{ color: 'var(--accent-text)' }}
                      />
                    </div>

                    {/* 竖版 A4 卡纸衬垫井：object-contain 完整展示文档形态 */}
                    <div
                      className="w-full h-28 rounded-lg p-1.5 flex items-center justify-center overflow-hidden mb-2"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <img
                        src={s.thumbnail_base64}
                        alt={s.title}
                        className="h-full w-auto max-w-full object-contain rounded-[2px] shadow-sm group-hover:scale-[1.04] transition-transform duration-300"
                      />
                    </div>
                  </div>

                  <div>
                    <div
                      className="text-xs font-semibold truncate transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {s.title}
                    </div>
                    <div
                      className="text-[10px] mt-0.5 line-clamp-2 leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
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
  );
};
