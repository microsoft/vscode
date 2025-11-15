import { File, Plus, Trash2 } from 'lucide-react';
import { CodeFile } from '@/services/aiService';

interface FileExplorerProps {
  files: CodeFile[];
  activeFile: number;
  onSelectFile: (index: number) => void;
  onAddFile: () => void;
  onDeleteFile: (index: number) => void;
}

export default function FileExplorer({
  files = [],
  activeFile = 0,
  onSelectFile,
  onAddFile,
  onDeleteFile,
}: FileExplorerProps) {
  return (
    <div className="h-full bg-gray-900 border-r border-gray-700">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Files</h3>
        <button
          onClick={onAddFile}
          className="p-1 hover:bg-gray-800 rounded transition-colors"
          title="New File"
        >
          <Plus className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="p-2 space-y-1">
        {files.map((file, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
              activeFile === idx
                ? 'bg-blue-600 text-white'
                : 'hover:bg-gray-800 text-gray-300'
            }`}
            onClick={() => onSelectFile(idx)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <File className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{file.name}</span>
            </div>
            {files.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(idx);
                }}
                className="p-1 hover:bg-red-600 rounded transition-colors flex-shrink-0"
                title="Delete File"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
