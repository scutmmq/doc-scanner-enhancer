import React, { useEffect, useState, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { OpticalButton } from './OpticalButton';

interface MobileCaptureViewProps {
  sessionId: string;
  onSwitchToWorkbench: () => void;
}

/**
 * 手机扫码拍传伴侣页 (Mobile Capture Companion)
 * 当手机扫描电脑端二维码访问 `/?capture_session=<sid>` 时自动进入。
 * 基于原生 `<input type="file" accept="image/*" capture="environment">` 兼容局域网 HTTP 下的 iOS Safari 与 Android Chrome 相机直拍与相册选图。
 */
export const MobileCaptureView: React.FC<MobileCaptureViewProps> = ({
  sessionId,
  onSwitchToWorkbench,
}) => {
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/v1/capture/${encodeURIComponent(sessionId)}/status`);
        if (!res.ok) {
          if (active) setSessionActive(false);
          return;
        }
        const data = await res.json();
        if (active) {
          setSessionActive(Boolean(data.active));
          setUploadCount(Number(data.upload_count || 0));
        }
      } catch {
        if (active) setSessionActive(false);
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleSelectedFile = async (file: File) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/v1/capture/${encodeURIComponent(sessionId)}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `上传失败 (${res.status})`);
      }

      const data = await res.json();
      setUploadCount((c) => c + 1);
      setStatusMessage(`已秒传至电脑端工作台 (${data.width}×${data.height})，电脑正在自动增强`);
    } catch (err: any) {
      setErrorMessage(err.message || '推送失败，请检查手机与电脑是否连接在同一 Wi-Fi');
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      handleSelectedFile(f);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#070a10] text-slate-100 flex flex-col px-5 py-6">
      {/* 隐藏相机直拍 & 相册选图输入框 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileInputChange}
        className="hidden"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* 顶部栏 */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-mono font-bold text-white">
            DS
          </div>
          <div>
            <div className="text-sm font-bold text-white">手机无线拍传</div>
            <div className="text-[11px] font-mono text-slate-400">会话 #{sessionId}</div>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
            sessionActive === false
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {sessionActive === false ? '会话已过期' : '已连接电脑'}
        </span>
      </div>

      {/* 主操作区 */}
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto py-6 space-y-5">
        {sessionActive === false ? (
          <div className="rounded-2xl bg-[#0d121d] border border-red-500/30 p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <div className="text-base font-semibold text-white">当前拍传二维码已过期</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              请在电脑端重新点击「手机扫码拍传」获取新二维码，或直接在手机上使用完整工作台。
            </p>
            <OpticalButton
              variant="primary"
              magnetic="subtle"
              onClick={onSwitchToWorkbench}
              className="w-full min-h-[48px] rounded-full text-sm font-semibold mt-2"
            >
              <span>在手机上直接打开工作台</span>
            </OpticalButton>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-[#0d121d] border border-slate-800 p-5 space-y-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6 text-blue-400" />
              </div>
              <h1 className="text-lg font-bold text-white">拍照或选图，实时传到电脑</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                直接拍摄文档，或从相册挑出其他扫描软件拍糊、有阴影、有红章失真的照片，一键推送到电脑大屏高清修复。
              </p>
            </div>

            {previewUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0b101b] p-2">
                <img
                  src={previewUrl}
                  alt="待推送文档预览"
                  className="max-h-56 w-full object-contain rounded-lg"
                />
              </div>
            )}

            {statusMessage && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 flex items-start space-x-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">发送成功（本次已传 {uploadCount} 张）</div>
                  <div className="text-emerald-200/80 mt-0.5">{statusMessage}</div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 flex items-start space-x-2.5 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <OpticalButton
                variant="primary"
                magnetic="strong"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="w-full min-h-[56px] rounded-2xl font-semibold text-base"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    <span>正在无线回传至电脑...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mr-2" />
                    <span>打开相机拍摄文档</span>
                  </>
                )}
              </OpticalButton>

              <OpticalButton
                variant="glass"
                magnetic="strong"
                onClick={() => albumInputRef.current?.click()}
                disabled={uploading}
                className="w-full min-h-[52px] rounded-2xl font-medium text-sm"
              >
                <ImageIcon className="w-4 h-4 mr-2 text-amber-400" />
                <span>从相册选取已有照片</span>
              </OpticalButton>
            </div>
          </>
        )}
      </div>

      {/* 底部切换本地手机处理 */}
      <div className="pt-4 border-t border-slate-800/80 text-center">
        <button
          onClick={onSwitchToWorkbench}
          className="inline-flex items-center text-xs text-slate-400 hover:text-slate-200 min-h-[44px] px-3"
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          不想传电脑？直接在手机浏览器里处理
          <ExternalLink className="w-3 h-3 ml-1" />
        </button>
      </div>
    </div>
  );
};
