import React, { useEffect, useState } from 'react';
import {
  X,
  QrCode,
  Wifi,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Smartphone,
} from 'lucide-react';

interface PhoneRelayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoReceived: (file: File) => void;
}

interface CaptureSessionInfo {
  session_id: string;
  capture_url: string;
  lan_ip: string;
  qr_base64: string;
  expires_in_sec: number;
}

/**
 * 桌面端「手机扫码无线拍传」弹窗
 * 生成局域网二维码并通过 SSE 实时接收手机拍照/相册上传的照片，秒级导入工作台自动诊断增强。
 */
export const PhoneRelayModal: React.FC<PhoneRelayModalProps> = ({
  isOpen,
  onClose,
  onPhotoReceived,
}) => {
  const [session, setSession] = useState<CaptureSessionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [connState, setConnState] = useState<'connecting' | 'waiting' | 'received'>('connecting');

  const createSession = async () => {
    setLoading(true);
    setError(null);
    setConnState('connecting');
    try {
      const res = await fetch('/api/v1/capture/new-session');
      if (!res.ok) throw new Error(`创建扫码会话失败 (${res.status})`);
      const data = await res.json();
      setSession(data);
    } catch (err: any) {
      setError(err.message || '无法创建手机拍传会话');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSession(null);
      return;
    }
    createSession();
  }, [isOpen]);

  // 监听 SSE 手机回传事件
  useEffect(() => {
    if (!isOpen || !session?.session_id) return;

    const es = new EventSource(`/api/v1/capture/${encodeURIComponent(session.session_id)}/events`);
    es.addEventListener('connected', () => {
      setConnState('waiting');
    });
    es.addEventListener('photo', async (evt: MessageEvent) => {
      try {
        setConnState('received');
        const payload = JSON.parse(evt.data);
        if (payload.image_base64) {
          const blobRes = await fetch(payload.image_base64);
          const blob = await blobRes.blob();
          const file = new File([blob], payload.filename || `手机拍传_${Date.now()}.jpg`, {
            type: blob.type || 'image/jpeg',
          });
          onPhotoReceived(file);
          onClose();
        }
      } catch (err) {
        console.error('解析手机回传照片失败:', err);
      }
    });
    es.onerror = () => {
      // EventSource 自动重连，不打断用户扫码
    };

    return () => {
      es.close();
    };
  }, [isOpen, session?.session_id, onPhotoReceived, onClose]);

  if (!isOpen) return null;

  const handleCopyUrl = async () => {
    if (!session?.capture_url) return;
    try {
      await navigator.clipboard.writeText(session.capture_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#0d121d] border border-slate-700/90 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗标题 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#111827]">
          <div className="flex items-center space-x-2.5">
            <QrCode className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white">手机扫码无线拍传</h2>
              <p className="text-[11px] text-slate-400">无需安装 App，同一 Wi-Fi 下手机拍照秒传电脑</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭扫码弹窗"
            className="min-w-[44px] min-h-[44px] -mr-2 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 弹窗主体 */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center text-slate-400 space-y-3">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
              <span className="text-xs">正在生成局域网拍传二维码...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={createSession}
                className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-xs font-medium"
              >
                重试生成
              </button>
            </div>
          ) : session ? (
            <>
              {/* 二维码卡片 */}
              <div className="flex flex-col items-center">
                <div className="p-3 bg-white rounded-2xl shadow-lg">
                  <img
                    src={session.qr_base64}
                    alt="手机扫码拍传二维码"
                    className="w-52 h-52 object-contain block"
                  />
                </div>

                {/* 实时状态胶囊 */}
                <div className="mt-4 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#131b2c] border border-slate-800 text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connState === 'received'
                        ? 'bg-emerald-400'
                        : 'bg-blue-400 animate-pulse'
                    }`}
                  />
                  <span className="text-slate-200">
                    {connState === 'received'
                      ? '已收到手机照片，正在导入增强...'
                      : '打开手机相机或微信扫一扫，等待拍照回传...'}
                  </span>
                </div>
              </div>

              {/* 局域网地址与复制 */}
              <div className="rounded-xl bg-[#090d16] border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center">
                    <Wifi className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    当前局域网地址 ({session.lan_ip})
                  </span>
                  <button
                    onClick={createSession}
                    className="text-slate-400 hover:text-slate-200 flex items-center"
                    title="刷新二维码"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> 刷新
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 text-[11px] font-mono text-slate-300 bg-slate-900/90 px-2.5 py-2 rounded-lg border border-slate-800 truncate">
                    {session.capture_url}
                  </code>
                  <button
                    onClick={handleCopyUrl}
                    data-fx-magnet="subtle"
                    className="min-h-[36px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-400/50 text-slate-200 text-xs flex items-center flex-shrink-0 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> 复制
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 使用小贴士 */}
              <div className="flex items-start space-x-2.5 text-[11px] text-slate-400 bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 leading-relaxed">
                <Smartphone className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>
                  手机与电脑连接同一 Wi-Fi（或手机热点）即可直连传输，照片全程仅在本地局域网流转，不上传第三方云端。
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
