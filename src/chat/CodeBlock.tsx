/**
 * CodeBlock - Syntax-highlighted code display with actions
 *
 * Renders code blocks with syntax highlighting, copy button,
 * and "Apply" functionality for code changes.
 */

import React, { useState, useCallback } from 'react';

import './CodeBlock.css';

export interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  startLine?: number;
  endLine?: number;
  onApply?: () => void;
  onCopy?: () => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  filename,
  startLine,
  endLine,
  onApply,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  }, [code, onCopy]);

  const handleApply = useCallback(() => {
    onApply?.();
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }, [onApply]);

  // Get language display name
  const languageDisplay = getLanguageDisplay(language);

  return (
    <div className="logos-code-block">
      {/* Header with filename and language */}
      <div className="code-header">
        <div className="code-info">
          {filename && (
            <span className="code-filename">
              {filename}
              {startLine !== undefined && (
                <span className="line-range">
                  :{startLine}
                  {endLine && endLine !== startLine && `-${endLine}`}
                </span>
              )}
            </span>
          )}
          <span className="code-language">{languageDisplay}</span>
        </div>
        <div className="code-actions">
          <button
            className="code-action-button"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          {onApply && (
            <button
              className="code-action-button apply"
              onClick={handleApply}
              title="Apply to file"
            >
              {applied ? '✓ Applied' : '✏️ Apply'}
            </button>
          )}
        </div>
      </div>

      {/* Code content with line numbers */}
      <div className="code-content">
        <pre>
          <code className={`language-${language}`}>
            {renderCodeWithLineNumbers(code, startLine)}
          </code>
        </pre>
      </div>
    </div>
  );
};

/**
 * Render code with line numbers
 */
function renderCodeWithLineNumbers(code: string, startLine = 1): React.ReactNode {
  const lines = code.split('\n');

  return lines.map((line, index) => (
    <div key={index} className="code-line">
      <span className="line-number">{startLine + index}</span>
      <span className="line-content">{line || ' '}</span>
    </div>
  ));
}

/**
 * Get display name for language
 */
function getLanguageDisplay(language: string): string {
  const languageNames: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    scala: 'Scala',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    yaml: 'YAML',
    xml: 'XML',
    markdown: 'Markdown',
    sql: 'SQL',
    shell: 'Shell',
    bash: 'Bash',
    powershell: 'PowerShell',
    dockerfile: 'Dockerfile',
    text: 'Plain Text',
  };

  return languageNames[language.toLowerCase()] || language;
}

export default CodeBlock;


