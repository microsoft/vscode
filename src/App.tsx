import { useState } from 'react';
import { Code2, MessageSquare, Sparkles } from 'lucide-react';
import CodeEditor from '@/components/CodeEditor';
import ChatPanel from '@/components/ChatPanel';
import FileExplorer from '@/components/FileExplorer';
import { generateCode, chatWithAI, Message, CodeFile } from '@/services/aiService';

export default function App() {
  const [files, setFiles] = useState<CodeFile[]>([
    {
      name: 'main.tsx',
      content: '// Start coding or ask AI to generate code for you!\n\nfunction hello() {\n  console.log("Hello from AI Coding Agent!");\n}\n',
      language: 'typescript',
    },
  ]);
  const [activeFile, setActiveFile] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI coding assistant. I can help you:\n\n• Generate code from descriptions\n• Explain existing code\n• Debug and improve code\n• Answer programming questions\n\nWhat would you like to build?',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const currentCode = files[activeFile]?.content || '';
      const context = `Current file: ${files[activeFile]?.name}\n\nCode:\n${currentCode}`;
      
      const response = await chatWithAI([...messages, userMessage]);
      
      // Check if response contains code
      const codeBlockMatch = response.match(/```(\w+)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        const code = codeBlockMatch[2];
        const newFiles = [...files];
        newFiles[activeFile].content = code;
        setFiles(newFiles);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please make sure your GEMINI_API_KEY is set correctly.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const newFiles = [...files];
    newFiles[activeFile].content = value;
    setFiles(newFiles);
  };

  const handleAddFile = () => {
    const newFile: CodeFile = {
      name: `file${files.length + 1}.tsx`,
      content: '// New file\n',
      language: 'typescript',
    };
    setFiles([...files, newFile]);
    setActiveFile(files.length);
  };

  const handleDeleteFile = (index: number) => {
    if (files.length === 1) return;
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (activeFile >= newFiles.length) {
      setActiveFile(newFiles.length - 1);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold text-white">AI Coding Agent</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto text-sm text-gray-400">
            <Code2 className="w-4 h-4" />
            <span>Powered by Gemini AI</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Explorer */}
        <div className="w-64 flex-shrink-0">
          <FileExplorer
            files={files}
            activeFile={activeFile}
            onSelectFile={setActiveFile}
            onAddFile={handleAddFile}
            onDeleteFile={handleDeleteFile}
          />
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">{files[activeFile]?.name}</span>
            </div>
          </div>
          <div className="flex-1">
            <CodeEditor
              value={files[activeFile]?.content || ''}
              onChange={handleCodeChange}
              language={files[activeFile]?.language || 'typescript'}
            />
          </div>
        </div>

        {/* Chat Panel */}
        <div className="w-96 flex-shrink-0 border-l border-gray-700">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">AI Assistant</span>
            </div>
          </div>
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
