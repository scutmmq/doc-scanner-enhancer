import React, { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ArrowRight,
  QrCode,
  Camera,
  Sun,
  Waves,
  Stamp,
  Focus,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { OpticalButton } from './OpticalButton';

gsap.registerPlugin(useGSAP);

interface HeroIntroProps {
  onEnterWorkbench: () => void;
  onOpenPhoneRelay: () => void;
  onDirectCamera?: () => void;
}

type OpticalModeId = 'shadow' | 'moire' | 'stamp' | 'blur';

const OPTICAL_MODES: Array<{
  id: OpticalModeId;
  num: string;
  label: string;
  shortDesc: string;
  beamHex: string;
  beamGlow: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'shadow',
    num: '01',
    label: '去重度阴影',
    shortDesc: 'Retinex 低频背景场除法归一化，一键还原均匀净白纸面',
    beamHex: '#60a5fa',
    beamGlow: 'rgba(59, 130, 246, 0.38)',
    icon: Sun,
  },
  {
    id: 'moire',
    num: '02',
    label: '消屏幕摩尔纹',
    shortDesc: '2D-FFT 频域离轴亮峰自动定位与共轭高斯陷波滤除',
    beamHex: '#38bdf8',
    beamGlow: 'rgba(56, 189, 248, 0.36)',
    icon: Waves,
  },
  {
    id: 'stamp',
    num: '03',
    label: '红章批注保真',
    shortDesc: '纯白净底与锐利黑字并存，暗影中的鲜艳红章与蓝字完整留存',
    beamHex: '#f87171',
    beamGlow: 'rgba(239, 68, 68, 0.34)',
    icon: Stamp,
  },
  {
    id: 'blur',
    num: '04',
    label: '失焦抖动清晰化',
    shortDesc: '散焦圆盘与线性运动 PSF 建模 + 维纳反卷积恢复发虚字迹',
    beamHex: '#fbbf24',
    beamGlow: 'rgba(245, 158, 11, 0.34)',
    icon: Focus,
  },
];

/**
 * 模块级开屏视频探测缓存：
 * 页面加载即预探测 `/api/v1/health` 并复用单次 Promise 缓存结果，
 * 无论首次打开还是刷新后点击「重温开屏」，第 0 帧即可直接挂载 <video>，
 * 彻底消除回退 Canvas 特效短暂闪烁（flash）后再切视频的问题。
 */
interface HeroVideoProbe {
  resolved: boolean;
  hasHero: boolean;
  hasMobileHero: boolean;
}

let cachedHeroVideoProbe: HeroVideoProbe = {
  resolved: false,
  hasHero: false,
  hasMobileHero: false,
};

let pendingHeroProbe: Promise<HeroVideoProbe> | null = null;

function probeHeroVideo(): Promise<HeroVideoProbe> {
  if (cachedHeroVideoProbe.resolved) {
    return Promise.resolve(cachedHeroVideoProbe);
  }
  if (!pendingHeroProbe) {
    pendingHeroProbe = fetch('/api/v1/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        cachedHeroVideoProbe = {
          resolved: true,
          hasHero: Boolean(data?.has_hero_video),
          hasMobileHero: Boolean(data?.has_mobile_hero_video),
        };
        return cachedHeroVideoProbe;
      })
      .catch(() => {
        cachedHeroVideoProbe = {
          resolved: true,
          hasHero: false,
          hasMobileHero: false,
        };
        return cachedHeroVideoProbe;
      });
  }
  return pendingHeroProbe;
}

if (typeof window !== 'undefined') {
  void probeHeroVideo();
}

/**
 * 100vw × 100vh 全屏影院级开屏引导 (MCHOSE / 旗舰硬件发布会风格)
 * - 100% 全出血全屏视频背景（挂载 frontend/public/hero-intro.mp4 即自动生效）
 * - 仅在服务端明确不存在视频文件或视频播放出错时，才启用全屏光学暗房 Canvas 兜底动画
 * - 所有按钮具备磁吸拉拽、光标径向高光跟踪、斜向激光扫光、点击光圈波纹与 GSAP 快门幕布退场特效
 */
export const HeroIntro: React.FC<HeroIntroProps> = ({
  onEnterWorkbench,
  onOpenPhoneRelay,
  onDirectCamera,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const pointerNormXRef = useRef<number | null>(null);
  const activeModeRef = useRef<OpticalModeId>('shadow');
  const isExitingRef = useRef<boolean>(false);

  const [probeResolved, setProbeResolved] = useState<boolean>(cachedHeroVideoProbe.resolved);
  const [hasHeroVideo, setHasHeroVideo] = useState<boolean>(cachedHeroVideoProbe.hasHero);
  const [hasMobileHeroVideo, setHasMobileHeroVideo] = useState<boolean>(
    cachedHeroVideoProbe.hasMobileHero
  );
  const [useVideoFallback, setUseVideoFallback] = useState<boolean>(false);
  const [videoReady, setVideoReady] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<OpticalModeId>('shadow');

  // 仅当明确确认无视频或视频加载失败时，才渲染兜底 Canvas（加载/缓冲期间保持纯黑影院底，绝不闪出兜底特效）
  const shouldRenderCanvas =
    useVideoFallback || (probeResolved && !hasHeroVideo && !hasMobileHeroVideo);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  // 静默读取已预探测（或正在进行）的开屏视频结果
  useEffect(() => {
    if (cachedHeroVideoProbe.resolved) return;
    let mounted = true;
    probeHeroVideo().then((res) => {
      if (!mounted) return;
      setHasHeroVideo(res.hasHero);
      setHasMobileHeroVideo(res.hasMobileHero);
      setProbeResolved(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 若视频命中浏览器缓存已就绪，首帧立即置为可见
  useEffect(() => {
    if (bgVideoRef.current && bgVideoRef.current.readyState >= 2) {
      setVideoReady(true);
    }
  }, [hasHeroVideo]);

  // GSAP 旗舰发布会开屏入场时间轴
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.from('.hero-nav-bar', {
          y: -20,
          opacity: 0,
          duration: 0.6,
          clearProps: 'transform',
        })
          .from(
            '.hero-title-reveal',
            {
              y: 34,
              opacity: 0,
              duration: 0.82,
              stagger: 0.1,
              ease: 'expo.out',
              clearProps: 'transform',
            },
            '-=0.35'
          )
          .from(
            '.hero-bottom-dock',
            {
              y: 22,
              opacity: 0,
              duration: 0.65,
              clearProps: 'transform',
            },
            '-=0.45'
          );
      });
    },
    { scope: containerRef }
  );

  // 快门拉开式 GSAP 退场动画
  const handleAnimatedExit = contextSafe((callback: () => void) => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || !containerRef.current) {
      callback();
      return;
    }

    const tl = gsap.timeline({ onComplete: callback });
    tl.to('.hero-foreground-ui', {
      y: -22,
      opacity: 0,
      duration: 0.34,
      ease: 'power2.in',
    }).to(
      containerRef.current,
      {
        opacity: 0,
        scale: 1.03,
        duration: 0.42,
        ease: 'power3.inOut',
      },
      '-=0.14'
    );
  });

  // 全屏 100vw × 100vh 影院级低机位斜切光学暗房扫描背景引擎（仅在确认无视频或视频失败时启动）
  useEffect(() => {
    if (!shouldRenderCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    const startTime = performance.now();

    // 漂浮的细腻光学微尘粒子
    const motes = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 97) % 100) / 100,
      y: ((i * 53) % 100) / 100,
      r: 0.7 + ((i * 19) % 14) / 10,
      vx: 0.004 + ((i * 11) % 8) * 0.0012,
      vy: -0.002 - ((i * 7) % 6) * 0.0008,
      a: 0.14 + ((i * 23) % 30) / 100,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      const t = (now - startTime) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w <= 0 || h <= 0) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const modeInfo =
        OPTICAL_MODES.find((m) => m.id === activeModeRef.current) || OPTICAL_MODES[0];

      // 1. MCHOSE 风格高端棚拍渐变影棚背光（左上深邃玄黑 -> 右上柔和金属银灰轮廓光）
      const studioGrad = ctx.createRadialGradient(
        w * 0.86,
        h * 0.18,
        w * 0.04,
        w * 0.68,
        h * 0.32,
        w * 0.92
      );
      studioGrad.addColorStop(0, '#333b4a');
      studioGrad.addColorStop(0.28, '#171d29');
      studioGrad.addColorStop(0.62, '#090c14');
      studioGrad.addColorStop(1, '#030408');
      ctx.fillStyle = studioGrad;
      ctx.fillRect(0, 0, w, h);

      // 极细腻棚拍微网格暗纹（仅在右半亮部隐约可见）
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.028)';
      ctx.lineWidth = 1;
      const grid = 64;
      for (let gx = 0; gx < w; gx += grid) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += grid) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // 实时激光扫描横坐标（自动平滑巡航，移动鼠标可轻柔交互牵引）
      let scanNorm: number;
      if (pointerNormXRef.current !== null) {
        scanNorm = pointerNormXRef.current;
      } else if (prefersReduced) {
        scanNorm = 0.56;
      } else {
        scanNorm = 0.5 + 0.36 * Math.sin(t * 0.62 - 0.5);
      }
      const scanX = w * scanNorm;

      // 2. 下半画幅：全出血斜切宏距光学扫描机身边缘与悬浮纸张平面（复刻 MCHOSE 底部斜角大片质感！）
      const slopeLeftY = h * 0.84;
      const slopeRightY = h * 0.50;
      const bevelH = h * 0.62;

      // 2a. 机身顶部边缘冷银色棚拍轮廓高光 (Rim Light)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-40, slopeLeftY);
      ctx.lineTo(w + 40, slopeRightY);
      ctx.lineTo(w + 40, h + 40);
      ctx.lineTo(-40, h + 40);
      ctx.closePath();

      const bodyGrad = ctx.createLinearGradient(0, slopeRightY, w * 0.65, h);
      bodyGrad.addColorStop(0, '#1d2433');
      bodyGrad.addColorStop(0.14, '#0c1018');
      bodyGrad.addColorStop(0.6, '#05070c');
      bodyGrad.addColorStop(1, '#020305');
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // 机身棱角高光斜线
      const rimGrad = ctx.createLinearGradient(w * 0.1, slopeLeftY, w * 0.95, slopeRightY);
      rimGrad.addColorStop(0, 'rgba(148, 163, 184, 0.08)');
      rimGrad.addColorStop(0.45, 'rgba(226, 232, 240, 0.38)');
      rimGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.72)');
      rimGrad.addColorStop(1, 'rgba(148, 163, 184, 0.25)');
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-40, slopeLeftY);
      ctx.lineTo(w + 40, slopeRightY);
      ctx.stroke();

      // 机身侧边精密光学散热栅格纹理（致敬精密工业硬件语言）
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const px = w * 0.56 + i * 11;
        const frac = (px + 40) / (w + 80);
        const py = slopeLeftY + (slopeRightY - slopeLeftY) * frac;
        ctx.beginPath();
        ctx.moveTo(px, py + 8);
        ctx.lineTo(px + 26, py + 44);
        ctx.stroke();
      }
      ctx.restore();

      // 3. 在斜切光学台面上绘制巨幅倾斜文档玻璃扫描层（左半激光扫过区净白清晰 + 右半阴影/摩尔纹原片）
      const angle = Math.atan2(slopeRightY - slopeLeftY, w + 80);
      const drawAngledSheet = (enhanced: boolean) => {
        ctx.save();
        ctx.translate(w * 0.5, h * 0.76);
        ctx.rotate(angle * 0.88);

        const sheetW = Math.min(w * 0.74, 980);
        const sheetH = Math.min(bevelH * 0.68, 340);
        const sx = -sheetW * 0.5;
        const sy = -sheetH * 0.42;

        ctx.beginPath();
        ctx.roundRect(sx, sy, sheetW, sheetH, 10);
        ctx.clip();

        if (enhanced) {
          const paperGrad = ctx.createLinearGradient(sx, sy, sx + sheetW, sy + sheetH);
          paperGrad.addColorStop(0, '#f8fafc');
          paperGrad.addColorStop(0.65, '#e2e8f0');
          paperGrad.addColorStop(1, '#cbd5e1');
          ctx.fillStyle = paperGrad;
          ctx.fillRect(sx, sy, sheetW, sheetH);
        } else {
          const rawGrad = ctx.createLinearGradient(sx, sy, sx + sheetW, sy + sheetH);
          rawGrad.addColorStop(0, '#2a2722');
          rawGrad.addColorStop(0.5, '#474238');
          rawGrad.addColorStop(1, '#1c1f29');
          ctx.fillStyle = rawGrad;
          ctx.fillRect(sx, sy, sheetW, sheetH);

          // 阴影遮罩
          const sh = ctx.createRadialGradient(sx + sheetW * 0.45, sy + sheetH * 0.45, 20, sx + sheetW * 0.45, sy + sheetH * 0.45, sheetW * 0.36);
          sh.addColorStop(0, 'rgba(6, 8, 14, 0.78)');
          sh.addColorStop(1, 'rgba(6, 8, 14, 0)');
          ctx.fillStyle = sh;
          ctx.fillRect(sx, sy, sheetW, sheetH);
        }

        // 精密排版文本线条（模拟高分辨率扫描件）
        const padX = sx + 48;
        const innerW = sheetW - 96;
        ctx.fillStyle = enhanced ? '#0f172a' : 'rgba(20, 22, 28, 0.55)';
        ctx.fillRect(padX, sy + 32, innerW * 0.42, 11);
        ctx.fillStyle = enhanced ? '#475569' : 'rgba(30, 32, 38, 0.42)';
        ctx.fillRect(padX, sy + 52, innerW * 0.24, 6);

        const rows = [0.92, 0.86, 0.94, 0.68, 0.88, 0.76, 0.62];
        rows.forEach((ratio, idx) => {
          const ry = sy + 82 + idx * 24;
          ctx.fillStyle = enhanced ? '#1e293b' : 'rgba(18, 22, 28, 0.46)';
          ctx.fillRect(padX, ry, innerW * ratio, enhanced ? 6 : 8);
        });

        // 鲜艳公章印迹（红章保真标志性细节）
        const sealX = sx + sheetW - 140;
        const sealY = sy + 148;
        ctx.save();
        ctx.translate(sealX, sealY);
        ctx.strokeStyle = enhanced ? '#dc2626' : 'rgba(128, 42, 38, 0.45)';
        ctx.lineWidth = enhanced ? 4 : 5;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = enhanced ? '#dc2626' : 'rgba(128, 42, 38, 0.42)';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const oa = ((i * 72 - 90) * Math.PI) / 180;
          const ia = ((i * 72 + 36 - 90) * Math.PI) / 180;
          if (i === 0) ctx.moveTo(Math.cos(oa) * 15, Math.sin(oa) * 15);
          else ctx.lineTo(Math.cos(oa) * 15, Math.sin(oa) * 15);
          ctx.lineTo(Math.cos(ia) * 6, Math.sin(ia) * 6);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 退化态叠加倾斜摩尔纹干涉条纹
        if (!enhanced) {
          ctx.strokeStyle = 'rgba(12, 16, 26, 0.34)';
          ctx.lineWidth = 1.4;
          const step = 9;
          const drift = (t * 14) % step;
          for (let ox = -sheetH; ox < sheetW + sheetH; ox += step) {
            ctx.beginPath();
            ctx.moveTo(sx + ox + drift, sy);
            ctx.lineTo(sx + ox - sheetH * 0.65 + drift, sy + sheetH);
            ctx.stroke();
          }
        }

        // 外沿微高光边框
        ctx.strokeStyle = enhanced ? 'rgba(255,255,255,0.85)' : 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, sheetW, sheetH);
        ctx.restore();
      };

      // 先画退化原片，再在激光扫描线左侧裁剪叠加高清净白层
      drawAngledSheet(false);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, scanX, h);
      ctx.clip();
      drawAngledSheet(true);
      ctx.restore();

      // 4. 全屏贯穿式高精度体积激光扫描光束
      const glowW = Math.max(120, w * 0.11);
      const beamGrad = ctx.createLinearGradient(scanX - glowW, 0, scanX + glowW * 0.35, 0);
      beamGrad.addColorStop(0, 'rgba(59, 130, 246, 0)');
      beamGrad.addColorStop(0.74, modeInfo.beamGlow);
      beamGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(scanX - glowW, 0, glowW * 1.35, h);

      ctx.save();
      ctx.strokeStyle = modeInfo.beamHex;
      ctx.shadowColor = modeInfo.beamHex;
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();
      ctx.restore();

      // 5. 微妙浮动的光学微尘粒子
      if (!prefersReduced) {
        motes.forEach((m) => {
          const mx = ((m.x + t * m.vx) % 1) * w;
          const my = ((m.y + t * m.vy + 10) % 1) * h;
          const distBeam = Math.abs(mx - scanX);
          const boost = Math.max(0, 1 - distBeam / 180) * 0.55;
          ctx.fillStyle = `rgba(191, 219, 254, ${Math.min(0.85, m.a + boost)})`;
          ctx.beginPath();
          ctx.arc(mx, my, m.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (!prefersReduced) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [shouldRenderCanvas]);

  const handleStagePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const norm = e.clientX / Math.max(window.innerWidth, 1);
    pointerNormXRef.current = Math.max(0.08, Math.min(0.92, norm));
  }, []);

  const currentModeObj = OPTICAL_MODES.find((m) => m.id === activeMode) || OPTICAL_MODES[0];

  return (
    <div
      ref={containerRef}
      onPointerMove={handleStagePointerMove}
      onPointerLeave={() => {
        pointerNormXRef.current = null;
      }}
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden bg-[#030408] text-white select-none"
    >
      {/* ================================================================
          背景层：
          - 桌面端 (md+)：100% 全屏铺满清晰视频 /hero-intro.mp4（原样零改动）
          - 移动端 (< md)：若存在 /hero-intro-mobile.mp4 则全屏竖放；否则底层渲染同源虚化流光氛围底，中层完整展示 16:9 无裁切视频
      ================================================================ */}
      {hasHeroVideo && !useVideoFallback && (
        <video
          ref={bgVideoRef}
          src="/hero-intro.mp4"
          preload="auto"
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setUseVideoFallback(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            hasMobileHeroVideo
              ? 'hidden md:block'
              : 'blur-2xl scale-125 opacity-45 md:blur-none md:scale-100 md:opacity-100'
          } ${videoReady ? '' : '!opacity-0 pointer-events-none'}`}
        />
      )}

      {hasMobileHeroVideo && !useVideoFallback && (
        <video
          src="/hero-intro-mobile.mp4"
          preload="auto"
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setHasMobileHeroVideo(false)}
          className="md:hidden absolute inset-0 w-full h-full object-cover"
        />
      )}

      {shouldRenderCanvas && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block"
          aria-label="全屏光学暗房扫描动态背景"
        />
      )}

      {/* 棚拍微暗角蒙版：保证任何全屏视频背景下，中心白色标题与按钮均达到高对比度 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 85% 65% at 50% 34%, rgba(3,6,14,0.42) 0%, rgba(3,6,14,0.18) 58%, rgba(2,4,9,0.68) 100%)',
        }}
      />

      {/* ================================================================
          前景悬浮 UI 层（顶部极简透明导航 + 居中大字视觉中心 + 底部交互功能坞）
      ================================================================ */}
      <div className="hero-foreground-ui relative z-10 flex flex-col justify-between h-full w-full">
        {/* 1. 顶部透明悬浮导航条（复刻迈从旗舰官网清爽顶栏风格） */}
        <header className="hero-nav-bar flex items-center justify-between px-6 sm:px-10 h-16 bg-black/30 backdrop-blur-md border-b border-white/[0.08]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-mono font-bold text-sm text-white shadow-lg shadow-blue-600/40">
              DS
            </div>
            <span className="font-bold text-base tracking-wider text-white">DOCSCANNER</span>
          </div>

          <nav className="hidden md:flex items-center space-x-1" aria-label="核心光学能力预览">
            {OPTICAL_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                data-active={activeMode === m.id}
                onMouseEnter={() => setActiveMode(m.id)}
                onClick={() => setActiveMode(m.id)}
                className={`hero-nav-link px-4 h-10 text-xs font-medium tracking-wide transition-colors ${
                  activeMode === m.id ? 'text-white' : 'text-slate-300/80 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-2.5">
            {hasHeroVideo && !useVideoFallback && (
              <span className="hidden sm:inline-flex items-center text-[11px] font-mono text-slate-300/80 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                <VolumeX className="w-3 h-3 mr-1" /> 静音预览
              </span>
            )}
            <OpticalButton
              variant="pill"
              magnetic="subtle"
              onClick={() => handleAnimatedExit(onEnterWorkbench)}
              className="min-h-[44px] px-5 rounded-full text-xs font-semibold tracking-wide"
            >
              <span>进入工作台</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform duration-300 group-hover:translate-x-1" />
            </OpticalButton>
          </div>
        </header>

        {/* 2. 主视觉中心（桌面端 md+ 原样居中大字留白；移动端紧凑排布 + 100% 完整 16:9 视频舞台） */}
        <main className="flex-1 flex flex-col items-center justify-center md:justify-start py-3 md:pt-[11vh] px-4 sm:px-6 text-center pointer-events-none overflow-y-auto md:overflow-visible">
          <div className="max-w-3xl w-full space-y-2.5 md:space-y-4 pointer-events-auto">
            <div className="hero-title-reveal inline-flex items-center space-x-2 px-3 py-1 md:px-3.5 md:py-1.5 rounded-full bg-white/[0.06] backdrop-blur-md border border-white/15 text-[11px] md:text-xs text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>纯传统精密光学文档修复引擎 · 专治手机扫描废片</span>
            </div>

            <h1 className="hero-title-reveal text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white drop-shadow-[0_6px_32px_rgba(0,0,0,0.6)]">
              DocScanner 3.0
            </h1>

            <p className="hero-title-reveal text-base sm:text-xl md:text-2xl font-medium text-slate-100/95 tracking-wide drop-shadow-[0_2px_18px_rgba(0,0,0,0.65)]">
              光学净扫 · 废片新生
            </p>

            {/* 移动端专属：100% 完整无裁切 16:9 影院视窗（完整展现左上激光头、蓝光束、合同与右下中文红章） */}
            {hasHeroVideo && !hasMobileHeroVideo && !useVideoFallback && (
              <div className="md:hidden hero-title-reveal pt-1 pb-1">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/20 bg-black/50 shadow-[0_18px_48px_-12px_rgba(37,99,235,0.5)]">
                  <video
                    src="/hero-intro.mp4"
                    preload="auto"
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-contain block"
                  />
                  <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 rounded-2xl" />
                </div>
              </div>
            )}

            <p className="hero-title-reveal text-xs sm:text-sm text-slate-300/90 max-w-xl mx-auto leading-relaxed">
              {currentModeObj.shortDesc}
            </p>

            {/* 磁吸高光交互核心行动按钮组 */}
            <div className="hero-title-reveal pt-2 md:pt-4 flex flex-wrap items-center justify-center gap-3 md:gap-4">
              <OpticalButton
                variant="primary"
                magnetic="strong"
                onClick={() => handleAnimatedExit(onEnterWorkbench)}
                className="min-h-[48px] md:min-h-[52px] px-7 md:px-8 rounded-full text-sm font-semibold tracking-wide"
              >
                <span>立即进入扫描工作台</span>
                <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-300 group-hover:translate-x-1.5" />
              </OpticalButton>

              {/* 桌面端显示「手机扫码无线拍传」；移动端自适应为「直接拍照扫描」 */}
              <OpticalButton
                variant="glass"
                magnetic="strong"
                onClick={() => handleAnimatedExit(onOpenPhoneRelay)}
                className="hidden sm:inline-flex min-h-[52px] px-7 rounded-full text-sm font-medium tracking-wide"
              >
                <QrCode className="w-4 h-4 mr-2 text-amber-400 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                <span>手机扫码无线拍传</span>
              </OpticalButton>

              <OpticalButton
                variant="glass"
                magnetic="strong"
                onClick={() => handleAnimatedExit(onDirectCamera || onEnterWorkbench)}
                className="sm:hidden inline-flex min-h-[48px] px-6 rounded-full text-sm font-medium tracking-wide"
              >
                <Camera className="w-4 h-4 mr-2 text-emerald-400" />
                <span>直接拍照扫描</span>
              </OpticalButton>
            </div>
          </div>
        </main>

        {/* 3. 底部悬浮玻璃态交互模式切换坞（移动端紧凑横滑单行，桌面端原样不变） */}
        <footer className="hero-bottom-dock px-4 sm:px-10 pb-4 md:pb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto overflow-x-auto flex items-center sm:flex-wrap justify-start sm:justify-center gap-1.5 sm:gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl">
            {OPTICAL_MODES.map((m) => {
              const Icon = m.icon;
              const isActive = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  data-fx-magnet="subtle"
                  onMouseEnter={() => setActiveMode(m.id)}
                  onClick={() => setActiveMode(m.id)}
                  className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl text-xs flex items-center space-x-1.5 sm:space-x-2 whitespace-nowrap flex-shrink-0 transition-all duration-300 ${
                    isActive
                      ? 'bg-white/15 text-white border border-white/25 shadow-lg'
                      : 'text-slate-300/80 hover:text-white border border-transparent hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full transition-transform duration-300"
                    style={{
                      backgroundColor: isActive ? m.beamHex : 'rgba(148,163,184,0.4)',
                      transform: isActive ? 'scale(1.35)' : 'scale(1)',
                      boxShadow: isActive ? `0 0 10px ${m.beamHex}` : 'none',
                    }}
                  />
                  <Icon className="w-3.5 h-3.5 opacity-90" />
                  <span className="font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center space-x-2 px-3.5 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[11px] font-mono text-slate-300/85">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: currentModeObj.beamHex }}
            />
            <span>
              {hasHeroVideo && !useVideoFallback
                ? '4K CINEMA LOOP · HERO-INTRO.MP4'
                : '左右移动光标可实时牵引全屏光学激光束'}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};
