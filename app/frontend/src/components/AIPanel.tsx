import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Code,
  Wrench,
  FileCode,
  Terminal,
  MessageSquare,
  X,
  Lightbulb,
} from 'lucide-react';
import { useAIStore } from '../stores/aiStore';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';
import type { AIAction } from '../types';

const quickActions: Array<{ id: AIAction; icon: typeof Code; label: string; prompt: string }> = [
  { id: 'explain', icon: Lightbulb, label: 'Explain', prompt: 'Explain the selected code' },
  { id: 'fix', icon: Wrench, label: 'Fix', prompt: 'Fix any issues in this code' },
  { id: 'generate', icon: FileCode, label: 'Generate', prompt: 'Generate code based on...' },
  { id: 'suggest-terminal', icon: Terminal, label: 'Terminal', prompt: 'Suggest a terminal command to...' },
];

export default function AIPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = useAIStore((s) => s.messages);
  const isLoading = useAIStore((s) => s.isLoading);
  const streamContent = useAIStore((s) => s.streamContent);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const clearMessages = useAIStore((s) => s.clearMessages);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const handleSend = async (action: AIAction = 'chat', overridePrompt?: string) => {
    const text = overridePrompt || input.trim();
    if (!text && !overridePrompt) return;

    setInput('');
    await sendMessage(
      text,
      action,
      undefined,
      activeTab?.content?.substring(0, 3000)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-accent-purple" />
          <span className="text-sm font-semibold text-text-primary">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover"
            onClick={clearMessages}
            title="Clear Chat"
          >
            <Trash2 size={14} />
          </button>
          <button
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover"
            onClick={toggleAIPanel}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-primary overflow-x-auto">
        {quickActions.map(({ id, icon: Icon, label, prompt }) => (
          <button
            key={id}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-bg-tertiary hover:bg-bg-hover rounded transition-colors whitespace-nowrap"
            onClick={() => handleSend(id, prompt)}
            disabled={isLoading}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && !streamContent && (
          <div className="text-center py-8">
            <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              Ask me anything about your code!
            </p>
            <p className="text-xs text-text-muted mt-1">
              I can explain, fix, generate, and suggest code.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {streamContent && (
          <MessageBubble role="assistant" content={streamContent} isStreaming />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-primary p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab
                ? `Ask about ${activeTab.name}...`
                : 'Ask me anything...'
            }
            className="input-field resize-none min-h-[36px] max-h-[120px]"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-accent-blue text-bg-primary rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: string;
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[95%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-accent-blue/20 text-text-primary'
            : 'bg-bg-tertiary text-text-primary'
        }`}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <MessageContent content={content} />
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-accent-blue animate-pulse ml-0.5" />
          )}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const [, lang, code] = match;
            return (
              <div key={i} className="my-2">
                <div className="flex items-center justify-between px-3 py-1 bg-bg-primary rounded-t border border-border-primary border-b-0">
                  <span className="text-xxs text-text-muted">{lang || 'code'}</span>
                  <button
                    className="text-xxs text-text-muted hover:text-text-primary"
                    onClick={() => navigator.clipboard.writeText(code.trim())}
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-bg-primary p-3 rounded-b border border-border-primary overflow-x-auto">
                  <code className="text-xs font-mono">{code.trim()}</code>
                </pre>
              </div>
            );
          }
        }

        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </>
  );
}
