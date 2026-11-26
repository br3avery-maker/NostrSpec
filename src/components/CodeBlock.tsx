import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  downloadFilename?: string;
  maxHeightClass?: string;
}

export function CodeBlock({
  code,
  language = 'typescript',
  title,
  downloadFilename,
  maxHeightClass = 'max-h-[460px]',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  const handleDownload = () => {
    if (!downloadFilename) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0F172A] text-slate-100 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-slate-800/90 bg-slate-900/70">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono truncate">
          {title && <span className="text-slate-200 font-medium truncate">{title}</span>}
          {title && <span aria-hidden="true">·</span>}
          <span>{language}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {downloadFilename && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-400"
              aria-label={`Download ${downloadFilename}`}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-400"
            aria-label={copied ? 'Copied to clipboard' : `Copy ${title ?? language} code`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className={`p-4 overflow-x-auto overflow-y-auto text-[13px] leading-relaxed font-mono text-slate-100 ${maxHeightClass}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
