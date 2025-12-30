/**
 * ContextIndicator - Shows current editor context for chat
 *
 * Displays active file, selection, and symbol information
 * that will be included in agent requests.
 */

import React, { useState } from 'react';
import type { ConversationContext, FileContext, SelectionContext } from './types';

import './ContextIndicator.css';

export interface ContextIndicatorProps {
  context: ConversationContext;
  onRefresh?: () => void;
  onClear?: () => void;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  context,
  onRefresh,
  onClear,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFile = context.openFiles.find((f) => f.isActive);
  const hasSelection = !!context.selection;
  const symbolCount = context.symbols.length;

  return (
    <div className="logos-context-indicator">
      {/* Collapsed view */}
      <button
        className="context-summary"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="context-icon">📎</span>
        <span className="context-text">
          {activeFile ? (
            <>
              <span className="filename">{getFileName(activeFile.path)}</span>
              {hasSelection && (
                <span className="selection-badge">Selection</span>
              )}
              {symbolCount > 0 && (
                <span className="symbol-badge">{symbolCount} symbols</span>
              )}
            </>
          ) : (
            <span className="no-context">No file context</span>
          )}
        </span>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded view */}
      {isExpanded && (
        <div className="context-details">
          {/* Active file */}
          {activeFile && (
            <div className="context-section">
              <h4>Active File</h4>
              <FileItem file={activeFile} />
            </div>
          )}

          {/* Selection */}
          {context.selection && (
            <div className="context-section">
              <h4>Selection</h4>
              <SelectionItem selection={context.selection} />
            </div>
          )}

          {/* Open files */}
          {context.openFiles.length > 1 && (
            <div className="context-section">
              <h4>Open Files ({context.openFiles.length})</h4>
              <div className="file-list">
                {context.openFiles.slice(0, 5).map((file) => (
                  <FileItem key={file.path} file={file} compact />
                ))}
                {context.openFiles.length > 5 && (
                  <span className="more-files">
                    +{context.openFiles.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Symbols */}
          {context.symbols.length > 0 && (
            <div className="context-section">
              <h4>Relevant Symbols</h4>
              <div className="symbol-list">
                {context.symbols.slice(0, 5).map((symbol) => (
                  <div key={`${symbol.file}:${symbol.name}`} className="symbol-item">
                    <span className="symbol-kind">{getSymbolIcon(symbol.kind)}</span>
                    <span className="symbol-name">{symbol.name}</span>
                    <span className="symbol-refs">{symbol.references} refs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="context-actions">
            {onRefresh && (
              <button onClick={onRefresh} className="context-action">
                🔄 Refresh
              </button>
            )}
            {onClear && (
              <button onClick={onClear} className="context-action">
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FileItemProps {
  file: FileContext;
  compact?: boolean;
}

const FileItem: React.FC<FileItemProps> = ({ file, compact }) => (
  <div className={`file-item ${compact ? 'compact' : ''}`}>
    <span className="file-icon">{getFileIcon(file.language)}</span>
    <span className="file-path">{compact ? getFileName(file.path) : file.path}</span>
    {!compact && (
      <>
        <span className="file-language">{file.language}</span>
        <span className="file-lines">{file.lineCount} lines</span>
      </>
    )}
    {file.isActive && <span className="active-badge">Active</span>}
  </div>
);

interface SelectionItemProps {
  selection: SelectionContext;
}

const SelectionItem: React.FC<SelectionItemProps> = ({ selection }) => (
  <div className="selection-item">
    <div className="selection-header">
      <span className="selection-file">{getFileName(selection.file)}</span>
      <span className="selection-range">
        Lines {selection.startLine}-{selection.endLine}
      </span>
    </div>
    <pre className="selection-preview">
      {selection.content.length > 200
        ? selection.content.slice(0, 200) + '...'
        : selection.content}
    </pre>
  </div>
);

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

function getFileIcon(language: string): string {
  const icons: Record<string, string> = {
    typescript: '📘',
    javascript: '📒',
    python: '🐍',
    rust: '🦀',
    go: '🐹',
    java: '☕',
    html: '🌐',
    css: '🎨',
    json: '📋',
    markdown: '📝',
  };
  return icons[language.toLowerCase()] || '📄';
}

function getSymbolIcon(kind: string): string {
  const icons: Record<string, string> = {
    function: 'ƒ',
    class: 'C',
    interface: 'I',
    variable: 'v',
    type: 'T',
  };
  return icons[kind] || '•';
}

export default ContextIndicator;


