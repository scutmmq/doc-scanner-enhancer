/**
 * 兼容 HTTP（如公网 IP:8088）与 HTTPS/localhost 的全环境剪贴板复制工具。
 * - 优先使用现代 Clipboard API（HTTPS / localhost 安全上下文）；
 * - 在纯 HTTP 站点（navigator.clipboard 不可用或抛异常）下自动无感回退至隐藏 textarea + execCommand('copy')。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 安全策略拦截时无缝回退至 execCommand 方案
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
