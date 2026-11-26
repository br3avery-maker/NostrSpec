import React from 'react';
import { ExternalLink } from 'lucide-react';
import { sanitizeHref, type MarkdownBlock } from '../lib/nipsParser';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  blocks: MarkdownBlock[];
  onSelectNip: (nipId: string) => void;
  skipFirstH1?: boolean;
}

/**
 * Safely tokenizes inline Markdown (`code`, **bold**, *italic*, ~~strike~~, [label](href))
 * into pure React nodes without ever using dangerouslySetInnerHTML.
 */
export function renderInlineMarkdown(
  text: string,
  onSelectNip: (nipId: string) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRe =
    /(`[^`]+`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|<(https?:\/\/[^>]+)>)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const full = match[0];
    if (full.startsWith('`') && full.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 text-[0.875em] font-mono bg-slate-100 text-slate-900 rounded border border-slate-200/80"
        >
          {full.slice(1, -1)}
        </code>,
      );
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const rawUrl = match[3];
      const safe = sanitizeHref(rawUrl);
      if (!safe) {
        nodes.push(<span key={key++}>{label}</span>);
      } else if (safe.nipId) {
        const targetNip = safe.nipId;
        nodes.push(
          <button
            key={key++}
            type="button"
            onClick={() => onSelectNip(targetNip)}
            className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 decoration-indigo-300 hover:decoration-indigo-600 font-medium transition-colors"
          >
            {label}
          </button>,
        );
      } else if (safe.external) {
        nodes.push(
          <a
            key={key++}
            href={safe.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-indigo-700 hover:text-indigo-900 underline underline-offset-2 decoration-indigo-300 hover:decoration-indigo-600 transition-colors"
          >
            <span>{label}</span>
            <ExternalLink className="w-3 h-3 inline shrink-0" aria-hidden="true" />
          </a>,
        );
      } else {
        nodes.push(
          <a
            key={key++}
            href={safe.href}
            className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 decoration-indigo-300"
          >
            {label}
          </a>,
        );
      }
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-slate-900">
          {renderInlineMarkdown(match[4], onSelectNip)}
        </strong>,
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <del key={key++} className="text-slate-500">
          {match[5]}
        </del>,
      );
    } else if (match[6] !== undefined) {
      nodes.push(
        <em key={key++} className="italic text-slate-800">
          {match[6]}
        </em>,
      );
    } else if (match[7] !== undefined) {
      const safe = sanitizeHref(match[7]);
      if (safe) {
        nodes.push(
          <a
            key={key++}
            href={safe.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 break-all"
          >
            {match[7]}
          </a>,
        );
      }
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownRenderer({
  blocks,
  onSelectNip,
  skipFirstH1 = true,
}: MarkdownRendererProps) {
  let skippedH1 = false;

  return (
    <div className="space-y-5 text-[15px] leading-7 text-slate-700">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          if (skipFirstH1 && block.level === 1 && !skippedH1) {
            skippedH1 = true;
            return null;
          }
          if (block.level === 1) {
            return (
              <h1
                key={idx}
                id={block.slug}
                className="text-2xl font-bold tracking-tight text-slate-900 pt-4 scroll-mt-20"
              >
                {renderInlineMarkdown(block.text, onSelectNip)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2
                key={idx}
                id={block.slug}
                className="text-xl font-semibold tracking-tight text-slate-900 pt-6 pb-2 border-b border-slate-200 scroll-mt-20"
              >
                {renderInlineMarkdown(block.text, onSelectNip)}
              </h2>
            );
          }
          if (block.level === 3) {
            return (
              <h3
                key={idx}
                id={block.slug}
                className="text-base font-semibold text-slate-900 pt-4 scroll-mt-20"
              >
                {renderInlineMarkdown(block.text, onSelectNip)}
              </h3>
            );
          }
          return (
            <h4
              key={idx}
              id={block.slug}
              className="text-sm font-semibold text-slate-800 pt-3 scroll-mt-20"
            >
              {renderInlineMarkdown(block.text, onSelectNip)}
            </h4>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={idx} className="max-w-[72ch] text-slate-700">
              {renderInlineMarkdown(block.text, onSelectNip)}
            </p>
          );
        }

        if (block.type === 'code') {
          return (
            <div key={idx} className="my-4">
              <CodeBlock code={block.code} language={block.language} />
            </div>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={idx}
              className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm leading-relaxed max-w-[72ch]"
            >
              {renderInlineMarkdown(block.text, onSelectNip)}
            </blockquote>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={idx}
              className={`max-w-[72ch] space-y-2 pl-5 ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } marker:text-slate-400`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="pl-1">
                  {renderInlineMarkdown(item, onSelectNip)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'table') {
          return (
            <div
              key={idx}
              className="overflow-x-auto rounded-lg border border-slate-200 bg-white my-4"
            >
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    {block.headers.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-4 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap"
                      >
                        {renderInlineMarkdown(header, onSelectNip)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-4 py-2.5 text-slate-700 align-top tabular-nums"
                        >
                          {renderInlineMarkdown(cell, onSelectNip)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <hr key={idx} className="border-slate-200 my-6" />;
      })}
    </div>
  );
}
