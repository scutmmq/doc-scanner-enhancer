import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

export interface OpticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass' | 'pill' | 'subtle';
  magnetic?: 'strong' | 'subtle' | 'none';
  children: React.ReactNode;
}

/**
 * 旗舰光学特效按钮 (Magnetic Pull + Cursor Radial Spotlight + Specular Laser Sweep + Click Ripple)
 * 与全站全局光学微交互引擎保持完全一致的动效物理语言。
 */
export const OpticalButton: React.FC<OpticalButtonProps> = ({
  variant = 'primary',
  magnetic = 'strong',
  className = '',
  children,
  disabled,
  onMouseMove,
  onMouseLeave,
  ...rest
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const quickXRef = useRef<gsap.QuickToFunc | null>(null);
  const quickYRef = useRef<gsap.QuickToFunc | null>(null);
  const innerXRef = useRef<gsap.QuickToFunc | null>(null);
  const innerYRef = useRef<gsap.QuickToFunc | null>(null);

  useEffect(() => {
    const btn = btnRef.current;
    const content = contentRef.current;
    if (!btn || !content || magnetic === 'none') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    quickXRef.current = gsap.quickTo(btn, 'x', { duration: 0.34, ease: 'power3.out' });
    quickYRef.current = gsap.quickTo(btn, 'y', { duration: 0.34, ease: 'power3.out' });
    innerXRef.current = gsap.quickTo(content, 'x', { duration: 0.34, ease: 'power3.out' });
    innerYRef.current = gsap.quickTo(content, 'y', { duration: 0.34, ease: 'power3.out' });

    return () => {
      gsap.killTweensOf(btn);
      gsap.killTweensOf(content);
    };
  }, [magnetic]);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseMove?.(e);
    if (disabled || magnetic === 'none') return;
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
    const relY = ((e.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    const pull = magnetic === 'strong' ? 10.5 : 5;
    quickXRef.current?.(relX * pull);
    quickYRef.current?.(relY * (pull * 0.65));
    innerXRef.current?.(relX * (pull * 0.36));
    innerYRef.current?.(relY * (pull * 0.24));
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseLeave?.(e);
    const btn = btnRef.current;
    const content = contentRef.current;
    if (!btn || !content || magnetic === 'none') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    gsap.to(content, { x: 0, y: 0, duration: 0.56, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
  };

  const variantClasses =
    variant === 'primary'
      ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 shadow-[0_10px_30px_-6px_rgba(37,99,235,0.58)] hover:shadow-[0_14px_38px_-4px_rgba(59,130,246,0.75)]'
      : variant === 'pill'
      ? 'bg-blue-600/95 hover:bg-blue-500 text-white border border-blue-400/40 shadow-[0_6px_22px_-4px_rgba(37,99,235,0.55)]'
      : variant === 'glass'
      ? 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 border border-white/20 hover:border-blue-400/60 backdrop-blur-md shadow-[0_12px_30px_-8px_rgba(0,0,0,0.65)]'
      : 'bg-[#131b2c] hover:bg-[#19243b] text-slate-100 border border-slate-700/80 hover:border-blue-500/50';

  return (
    <button
      ref={btnRef}
      type={rest.type || 'button'}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`optical-fx-primary group select-none cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${variantClasses} ${className}`}
      {...rest}
    >
      <span ref={contentRef} className="relative z-10 inline-flex items-center justify-center w-full">
        {children}
      </span>
    </button>
  );
};
