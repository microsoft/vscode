/**
 * MarkdownRenderer - Renders markdown content with code highlighting
 *
 * Parses and renders markdown with support for:
 * - Headers, lists, emphasis
 * - Code blocks with syntax highlighting
 * - Links and images
 * - Tables
 */

import React, { useMemo } from 'react';
import { CodeBlock } from './CodeBlock';

import './MarkdownRenderer.css';

export interface MarkdownRendererProps {
  content: string;
  onCodeApply?: (code: string, filename?: string) => void;
}

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'blockquote' | 'table';
  content: string;
  language?: string;
  filename?: string;
  level?: number;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onCodeApply,
}) => {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="logos-markdown">
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          block={block}
          onCodeApply={onCodeApply}
        />
      ))}
    </div>
  );
};

interface MarkdownBlockProps {
  block: ParsedBlock;
  onCodeApply?: (code: string, filename?: string) => void;
}

const MarkdownBlock: React.FC<MarkdownBlockProps> = ({ block, onCodeApply }) => {
  switch (block.type) {
    case 'code':
      return (
        <CodeBlock
          code={block.content}
          language={block.language || 'text'}
          filename={block.filename}
          onApply={
            onCodeApply
              ? () => onCodeApply(block.content, block.filename)
              : undefined
          }
        />
      );

    case 'heading':
      const HeadingTag = `h${block.level || 1}` as keyof JSX.IntrinsicElements;
      return <HeadingTag>{renderInlineMarkdown(block.content)}</HeadingTag>;

    case 'list':
      return (
        <ul>
          {block.content.split('\n').map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item.replace(/^[-*]\s*/, ''))}</li>
          ))}
        </ul>
      );

    case 'blockquote':
      return (
        <blockquote>
          {renderInlineMarkdown(block.content.replace(/^>\s*/gm, ''))}
        </blockquote>
      );

    case 'table':
      return renderTable(block.content);

    case 'text':
    default:
      return <p>{renderInlineMarkdown(block.content)}</p>;
  }
};

/**
 * Parse markdown into blocks
 */
function parseMarkdown(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const match = line.match(/^```(\w+)?(?::([^\n]+))?$/);
      const language = match?.[1] || 'text';
      const filename = match?.[2];
      const codeLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }

      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language,
        filename,
      });
      i++; // Skip closing ```
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // List
    if (line.match(/^[-*]\s/)) {
      const listLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        listLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'list',
        content: listLines.join('\n'),
      });
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'table',
        content: tableLines.join('\n'),
      });
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular text paragraph
    const textLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('#') &&
      !lines[i].match(/^[-*]\s/) &&
      !lines[i].startsWith('>')
    ) {
      textLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'text',
      content: textLines.join(' '),
    });
  }

  return blocks;
}

/**
 * Render inline markdown (bold, italic, code, links)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns: Array<{
    regex: RegExp;
    render: (match: RegExpMatchArray) => React.ReactNode;
  }> = [
    // Bold
    {
      regex: /\*\*(.+?)\*\*/,
      render: (m) => <strong key={key++}>{m[1]}</strong>,
    },
    // Italic
    {
      regex: /\*(.+?)\*/,
      render: (m) => <em key={key++}>{m[1]}</em>,
    },
    // Inline code
    {
      regex: /`([^`]+)`/,
      render: (m) => <code key={key++}>{m[1]}</code>,
    },
    // Links
    {
      regex: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m) => (
        <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>
      ),
    },
  ];

  while (remaining) {
    let earliestMatch: { index: number; match: RegExpMatchArray; pattern: typeof patterns[0] } | null = null;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = { index: match.index, match, pattern };
        }
      }
    }

    if (earliestMatch) {
      // Add text before match
      if (earliestMatch.index > 0) {
        parts.push(remaining.slice(0, earliestMatch.index));
      }
      // Add rendered match
      parts.push(earliestMatch.pattern.render(earliestMatch.match));
      // Continue with rest
      remaining = remaining.slice(
        earliestMatch.index + earliestMatch.match[0].length
      );
    } else {
      // No more matches
      parts.push(remaining);
      break;
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Render markdown table
 */
function renderTable(content: string): React.ReactElement {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return <p>{content}</p>;

  const parseRow = (line: string) =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  return (
    <table className="markdown-table">
      <thead>
        <tr>
          {headers.map((header, i) => (
            <th key={i}>{renderInlineMarkdown(header)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{renderInlineMarkdown(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default MarkdownRenderer;

