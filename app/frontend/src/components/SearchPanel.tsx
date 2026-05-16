import { useState, useCallback } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { useFileStore } from '../stores/fileStore';
import { useEditorStore } from '../stores/editorStore';
import type { SearchResult } from '../types';

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const rootPath = useFileStore((s) => s.rootPath);
  const openTab = useEditorStore((s) => s.openTab);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !rootPath) return;
    const api = window.electronAPI;
    if (!api) return;

    setIsSearching(true);
    try {
      const searchResults = await api.searchFiles(rootPath, query, { caseSensitive });
      setResults(searchResults);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, rootPath, caseSensitive]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const openResult = async (result: SearchResult) => {
    const api = window.electronAPI;
    if (!api) return;

    try {
      const content = await api.readFile(result.filePath);
      const name = result.filePath.split('/').pop() || result.filePath;
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
        jsx: 'javascriptreact', json: 'json', html: 'html', css: 'css',
        md: 'markdown', py: 'python', rs: 'rust', go: 'go',
      };

      openTab({
        id: result.filePath,
        path: result.filePath,
        name,
        language: langMap[ext] || 'plaintext',
        content,
        isDirty: false,
      });
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.filePath]) {
      acc[result.filePath] = [];
    }
    acc[result.filePath].push(result);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Search
        </span>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-1">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search in files..."
              className="input-field pl-7"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="rounded"
            />
            Match Case
          </label>
          <span className="text-xs text-text-muted">
            {results.length > 0 && `${results.length} results`}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center justify-center py-4 text-text-muted text-sm">
            Searching...
          </div>
        )}

        {!isSearching && results.length === 0 && query && (
          <div className="flex items-center justify-center py-4 text-text-muted text-sm">
            No results found
          </div>
        )}

        {Object.entries(groupedResults).map(([filePath, fileResults]) => {
          const fileName = filePath.split('/').pop() || filePath;
          const relativePath = rootPath
            ? filePath.replace(rootPath, '').replace(/^\//, '')
            : filePath;

          return (
            <div key={filePath} className="mb-1">
              <div className="flex items-center gap-1 px-3 py-1 text-xs">
                <FileText size={12} className="text-text-muted flex-shrink-0" />
                <span className="text-text-primary font-medium truncate">{fileName}</span>
                <span className="text-text-muted truncate">{relativePath}</span>
              </div>
              {fileResults.map((result, idx) => (
                <button
                  key={idx}
                  className="w-full text-left px-6 py-0.5 text-xs hover:bg-sidebar-hover cursor-pointer"
                  onClick={() => openResult(result)}
                >
                  <span className="text-text-muted mr-2">{result.line}:</span>
                  <span className="text-text-secondary font-mono">{result.context}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
