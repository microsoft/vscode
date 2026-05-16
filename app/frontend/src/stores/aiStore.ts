import { create } from 'zustand';
import type { AIMessage, AIAction } from '../types';

interface AIState {
  messages: AIMessage[];
  isLoading: boolean;
  currentStreamId: string | null;
  streamContent: string;

  addMessage: (message: AIMessage) => void;
  setMessages: (messages: AIMessage[]) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  setCurrentStreamId: (id: string | null) => void;
  appendStreamContent: (content: string) => void;
  finalizeStream: () => void;

  sendMessage: (content: string, action?: AIAction, selectedCode?: string, fileContext?: string) => Promise<void>;
}

let nextId = 1;
const makeId = () => `msg-${Date.now()}-${nextId++}`;

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  isLoading: false,
  currentStreamId: null,
  streamContent: '',

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setCurrentStreamId: (id) => set({ currentStreamId: id }),
  appendStreamContent: (content) =>
    set((state) => ({ streamContent: state.streamContent + content })),

  finalizeStream: () =>
    set((state) => {
      if (!state.streamContent) return state;
      const assistantMessage: AIMessage = {
        id: makeId(),
        role: 'assistant',
        content: state.streamContent,
        timestamp: Date.now(),
      };
      return {
        messages: [...state.messages, assistantMessage],
        streamContent: '',
        currentStreamId: null,
        isLoading: false,
      };
    }),

  sendMessage: async (content, action = 'chat', selectedCode, fileContext) => {
    const { messages } = get();
    const api = window.electronAPI;
    if (!api) return;

    const userMessage: AIMessage = {
      id: makeId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      streamContent: '',
    }));

    try {
      const streamId = await api.aiStreamChat({
        messages: [...messages, userMessage],
        action,
        selectedCode,
        context: fileContext,
      });

      set({ currentStreamId: streamId });
    } catch (err) {
      const errorMessage: AIMessage = {
        id: makeId(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMessage],
        isLoading: false,
      }));
    }
  },
}));
