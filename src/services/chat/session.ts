import { ChatMessage, sendChat } from '../openai/client.ts';
import { buildPromptWithContext } from '../context/context.ts';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore: Record<string, string> = {};
const storage: StorageLike = (globalThis as any)?.localStorage ?? {
  getItem: key => key in memoryStore ? memoryStore[key] : null,
  setItem: (key, value) => { memoryStore[key] = value; }
};

const HISTORY_KEY = 'chatHistory';

export function loadHistory(): ChatMessage[] {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) as ChatMessage[] : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatMessage[]): void {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore storage errors
  }
}

export async function submitPrompt(
  prompt: string,
  options: {
    editors?: readonly any[];
    onToken?: (token: string) => void;
    build?: typeof buildPromptWithContext;
    send?: typeof sendChat;
  } = {}
): Promise<ChatMessage> {
  const { editors, onToken, build = buildPromptWithContext, send = sendChat } = options;
  const history = loadHistory();
  history.push({ role: 'user', content: prompt });
  saveHistory(history);

  const promptWithContext = await build(prompt, editors);
  const messages = [...history.slice(0, -1), { role: 'user', content: promptWithContext }];
  const response = await send(messages, onToken);

  history.push(response);
  saveHistory(history);
  return response;
}
