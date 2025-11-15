import { Play, Download, Wand2, Lightbulb } from 'lucide-react';

interface ToolbarProps {
  onGenerate: () => void;
  onExplain: () => void;
  onImprove: () => void;
  onDownload: () => void;
  disabled?: boolean;
}

export default function Toolbar({
  onGenerate,
  onExplain,
  onImprove,
  onDownload,
  disabled = false,
}: ToolbarProps) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-2">
      <button
        onClick={onGenerate}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        title="Generate Code with AI"
      >
        <Wand2 className="w-4 h-4" />
        <span>Generate</span>
      </button>

      <button
        onClick={onExplain}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        title="Explain Code"
      >
        <Lightbulb className="w-4 h-4" />
        <span>Explain</span>
      </button>

      <button
        onClick={onImprove}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        title="Improve Code"
      >
        <Play className="w-4 h-4" />
        <span>Improve</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={onDownload}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        title="Download File"
      >
        <Download className="w-4 h-4" />
        <span>Download</span>
      </button>
    </div>
  );
}
