import gsap from 'gsap';

const MAGNET_SELECTOR = 'button[data-fx-magnet]:not(:disabled), [data-fx-surface][data-fx-magnet]';
const INTERACTIVE_SELECTOR = 'button:not([data-fx="off"]):not(:disabled), [data-fx-surface]:not([data-fx="off"])';

/**
 * 全局光学微交互特效控制器（统一覆盖全站所有页面的按钮与交互卡片）：
 * 1. 光标跟踪径向聚光灯 (--mx, --my)
 * 2. 磁吸位移与弹性回弹 (支持 data-fx-magnet="strong" | "subtle")
 * 3. 点击瞬间从指针坐标爆发光学波纹 (.optical-btn-ripple)
 * 4. 严格尊重 prefers-reduced-motion 且自动跳过 disabled / data-fx="off" 控件
 */
export function initGlobalOpticalInteractions(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let activeMagnetEl: HTMLElement | null = null;

  const isReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const resetMagnet = (el: HTMLElement | null) => {
    if (!el) return;
    if (isReducedMotion()) {
      gsap.set(el, { x: 0, y: 0 });
      return;
    }
    gsap.to(el, {
      x: 0,
      y: 0,
      duration: 0.56,
      ease: 'elastic.out(1, 0.48)',
      overwrite: 'auto',
    });
  };

  const handlePointerMove = (e: PointerEvent) => {
    const rawTarget = e.target as HTMLElement | null;
    if (!rawTarget || typeof rawTarget.closest !== 'function') return;

    // 1. 更新当前按钮/交互卡片的径向聚光灯坐标
    const btn = rawTarget.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      btn.style.setProperty('--mx', `${localX}px`);
      btn.style.setProperty('--my', `${localY}px`);
    }

    // 2. 处理磁吸物理拉拽
    const magnetEl = rawTarget.closest(MAGNET_SELECTOR) as HTMLElement | null;
    if (activeMagnetEl && activeMagnetEl !== magnetEl) {
      resetMagnet(activeMagnetEl);
      activeMagnetEl = null;
    }

    if (magnetEl && !isReducedMotion() && e.pointerType !== 'touch') {
      activeMagnetEl = magnetEl;
      const rect = magnetEl.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      const relY = ((e.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
      const strength = magnetEl.getAttribute('data-fx-magnet') === 'strong' ? 9.5 : 4.2;

      gsap.to(magnetEl, {
        x: relX * strength,
        y: relY * (strength * 0.65),
        duration: 0.32,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  };

  const handlePointerOut = (e: PointerEvent) => {
    if (!activeMagnetEl) return;
    const related = e.relatedTarget as Node | null;
    if (!related || !activeMagnetEl.contains(related)) {
      resetMagnet(activeMagnetEl);
      activeMagnetEl = null;
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (isReducedMotion()) return;
    const rawTarget = e.target as HTMLElement | null;
    if (!rawTarget || typeof rawTarget.closest !== 'function') return;

    const btn = rawTarget.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    // 跳过极小的图标按钮，防止溢出杂乱
    if (rect.width < 28 || rect.height < 24) return;

    const ripple = document.createElement('span');
    ripple.className = 'optical-btn-ripple';
    const size = Math.max(rect.width, rect.height) * 1.15;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;

    btn.appendChild(ripple);
    window.setTimeout(() => {
      ripple.remove();
    }, 580);
  };

  document.addEventListener('pointermove', handlePointerMove, { passive: true });
  document.addEventListener('pointerout', handlePointerOut, { passive: true });
  document.addEventListener('pointerdown', handlePointerDown, { passive: true });

  return () => {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerout', handlePointerOut);
    document.removeEventListener('pointerdown', handlePointerDown);
    if (activeMagnetEl) {
      gsap.killTweensOf(activeMagnetEl);
      activeMagnetEl = null;
    }
  };
}
