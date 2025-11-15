import { Code2, MessageSquare, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab: 'code' | 'chat';
  onTabChange: (tab: 'code' | 'chat') => void;
}

export default function Header({ activeTab = 'code', onTabChange }: HeaderProps) {
  return (
    <header className="bg-gray-900 border-b border-gray-700 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold text-white">AI Coding Agent</h1>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onTabChange('code')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'code'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Code Editor</span>
          </button>
          <button
            onClick={() => onTabChange('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>AI Chat</span>
          </button>
        </div>
      </div>
    </header>
  );
}
