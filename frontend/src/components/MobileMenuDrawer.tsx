import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  X,
  Camera,
  Upload,
  QrCode,
  Play,
  Home,
  Palette,
  Sparkles,
  Check,
} from 'lucide-react';

export interface MobileDrawerThemeMeta {
  id: 'darkroom' | 'paper' | 'leica';
  label: string;
  desc: string;
  swatches: [string, string];
}

export interface MobileDrawerSampleMeta {
  filename: string;
  id: string;
  title: string;
  subtitle: string;
  thumbnail_base64: string;
}

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  hasDocument: boolean;
  themes: MobileDrawerThemeMeta[];
  currentTheme: 'darkroom' | 'paper' | 'leica';
  onSelectTheme: (theme: 'darkroom' | 'paper' | 'leica') => void;
  samples: MobileDrawerSampleMeta[];
  activeSampleName: string | null;
  onSelectSample: (sample: MobileDrawerSampleMeta) => void;
  onCameraCapture: () => void;
  onUploadFile: () => void;
  onOpenPhoneRelay: () => void;
  onReplayHero: () => void;
  onResetWorkspace: () => void;
}

/**
 * 移动端全功能底部抽屉菜单 (仅 < lg 显示)
 * 100% 补齐桌面端所有顶栏功能入口（主题切换、拍照/上传、6 大样张、重温开屏、扫码互联、返回首页），
 * 每项均带清晰中文文案且触控高度 >= 48px，保持移动端顶栏清爽单行不拥挤。
 */
export const MobileMenuDrawer: React.FC<MobileMenuDrawerProps> = ({
  isOpen,
  onClose,
  hasDocument,
  themes,
  currentTheme,
  onSelectTheme,
  samples,
  activeSampleName,
  onSelectSample,
  onCameraCapture,
  onUploadFile,
  onOpenPhoneRelay,
  onReplayHero,
  onResetWorkspace,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        sheetRef.current,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform' }
      );
    });
    return () => ctx.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="移动端完整功能菜单"
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[84dvh] rounded-t-2xl bg-[#0d121d] border-t border-slate-700/90 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* 顶部拖拽握把与标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#111827] flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-mono font-bold text-xs text-white ds-keep-white">
              DS
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">全部功能与设置</div>
              <div className="text-[10px] text-slate-400">与桌面端完全同步的完整功能入口</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭功能菜单"
            className="min-w-[44px] min-h-[44px] -mr-1.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1. 外观视觉主题 3 选 1 */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
              <Palette className="w-3.5 h-3.5 text-blue-400" />
              <span>工作台视觉主题</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((t) => {
                const active = currentTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTheme(t.id)}
                    className={`min-h-[64px] p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      active
                        ? 'bg-blue-600/15 border-blue-500 text-white'
                        : 'bg-[#121826] border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="flex items-center -space-x-1">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-slate-500/40"
                          style={{ backgroundColor: t.swatches[0] }}
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-slate-500/40"
                          style={{ backgroundColor: t.swatches[1] }}
                        />
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div className="text-xs font-semibold mt-1.5">{t.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 核心导入与拍摄操作 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">导入文档与设备互联</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCameraCapture();
                }}
                className="min-h-[50px] px-3 rounded-xl bg-blue-600 text-white ds-keep-white text-xs font-semibold flex items-center justify-center space-x-2"
              >
                <Camera className="w-4 h-4" />
                <span>直接拍照扫描</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUploadFile();
                }}
                className="min-h-[50px] px-3 rounded-xl bg-[#121826] border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center space-x-2"
              >
                <Upload className="w-4 h-4 text-blue-400" />
                <span>从相册 / 文件选择</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPhoneRelay();
              }}
              className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#121826] border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-between"
            >
              <span className="flex items-center space-x-2.5">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>扫码互联 / 另一台手机拍传</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">生成二维码</span>
            </button>
          </div>

          {/* 3. 内置 6 类典型样张快选 */}
          {samples.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>试用 6 类典型问题样张</span>
              </div>
              <div className="flex space-x-2.5 overflow-x-auto pb-1">
                {samples.map((s) => {
                  const active = activeSampleName === s.filename;
                  return (
                    <button
                      key={s.filename}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectSample(s);
                      }}
                      className={`flex-shrink-0 w-28 p-2 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-[#121826] border-slate-800 text-slate-200'
                      }`}
                    >
                      <img
                        src={s.thumbnail_base64}
                        alt={s.title}
                        className="w-full h-16 object-cover rounded-lg border border-slate-700/70 mb-1.5"
                      />
                      <div className="text-[11px] font-semibold truncate">{s.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. 页面与演示快捷入口 */}
          <div className="space-y-2 pb-2">
            <div className="text-xs font-semibold text-slate-300">快捷导航</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReplayHero();
                }}
                className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#121826] border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-between"
              >
                <span className="flex items-center space-x-2.5">
                  <Play className="w-4 h-4 text-blue-400" />
                  <span>重温开屏宣传动画</span>
                </span>
                <span className="text-[10px] text-slate-400">16:9 完整影院展示</span>
              </button>

              {hasDocument && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onResetWorkspace();
                  }}
                  className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#121826] border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-between"
                >
                  <span className="flex items-center space-x-2.5">
                    <Home className="w-4 h-4 text-slate-400" />
                    <span>返回欢迎首页 / 清空当前文档</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
