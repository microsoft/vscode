import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, X, Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';

interface TerminalInstance {
  id: string;
  name: string;
}

export default function TerminalPanel() {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const terminalHeight = useUIStore((s) => s.terminalHeight);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const rootPath = useFileStore((s) => s.rootPath);
  const terminalElRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Record<string, { term: unknown; cleanup: () => void }>>({});

  const createTerminal = useCallback(async () => {
    const id = `term-${Date.now()}`;
    const name = `Terminal ${terminals.length + 1}`;
    const newTerminal: TerminalInstance = { id, name };

    setTerminals((prev) => [...prev, newTerminal]);
    setActiveTerminalId(id);

    const api = window.electronAPI;
    if (api) {
      await api.createTerminal(id, rootPath || undefined);
    }
  }, [terminals.length, rootPath]);

  const closeTerminalInstance = useCallback(async (id: string) => {
    const api = window.electronAPI;
    if (api) {
      await api.killTerminal(id);
    }

    const ref = xtermRef.current[id];
    if (ref) {
      ref.cleanup();
      delete xtermRef.current[id];
    }

    setTerminals((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  }, [activeTerminalId]);

  // Create initial terminal
  useEffect(() => {
    if (terminals.length === 0) {
      createTerminal();
    }
  }, []);

  // Initialize xterm for active terminal
  useEffect(() => {
    if (!activeTerminalId || !terminalElRef.current) return;
    if (xtermRef.current[activeTerminalId]) return;

    let mounted = true;

    const initTerminal = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      // @ts-ignore - CSS import handled by Vite
      await import('xterm/css/xterm.css');

      if (!mounted || !terminalElRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        theme: {
          background: '#11111b',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
          cursorAccent: '#11111b',
          selectionBackground: '#45475a',
          black: '#45475a',
          red: '#f38ba8',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          blue: '#89b4fa',
          magenta: '#cba6f7',
          cyan: '#94e2d5',
          white: '#bac2de',
          brightBlack: '#585b70',
          brightRed: '#f38ba8',
          brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af',
          brightBlue: '#89b4fa',
          brightMagenta: '#cba6f7',
          brightCyan: '#94e2d5',
          brightWhite: '#a6adc8',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Clear container before opening
      terminalElRef.current!.innerHTML = '';
      term.open(terminalElRef.current!);

      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch { /* ignore */ }
      }, 100);

      const api = window.electronAPI;
      const termId = activeTerminalId;

      term.onData((data: string) => {
        if (api) {
          api.writeTerminal(termId, data);
        }
      });

      let removeListener: (() => void) | undefined;
      if (api) {
        removeListener = api.onTerminalData((id: string, data: string) => {
          if (id === termId) {
            term.write(data);
          }
        });
      }

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch { /* ignore */ }
      });
      resizeObserver.observe(terminalElRef.current!);

      xtermRef.current[termId] = {
        term,
        cleanup: () => {
          resizeObserver.disconnect();
          if (removeListener) removeListener();
          term.dispose();
        },
      };
    };

    initTerminal();

    return () => {
      mounted = false;
    };
  }, [activeTerminalId]);

  return (
    <div style={{ height: terminalHeight }} className="flex flex-col bg-terminal-bg">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-bg-secondary border-b border-border-primary">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-2">
            Terminal
          </span>
          {terminals.map((t) => (
            <button
              key={t.id}
              className={`px-2 py-0.5 text-xs rounded ${
                t.id === activeTerminalId
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setActiveTerminalId(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover"
            onClick={createTerminal}
            title="New Terminal"
          >
            <Plus size={14} />
          </button>
          {activeTerminalId && (
            <button
              className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover"
              onClick={() => closeTerminalInstance(activeTerminalId)}
              title="Kill Terminal"
            >
              <X size={14} />
            </button>
          )}
          <button
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover"
            onClick={toggleTerminal}
            title="Close Panel"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div ref={terminalElRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
