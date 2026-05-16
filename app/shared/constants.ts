export const APP_NAME = 'AI Studio';
export const APP_VERSION = '1.0.0';

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.json': 'json',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'dotenv',
  '.dockerfile': 'dockerfile',
  '.gitignore': 'plaintext',
  '.txt': 'plaintext',
};

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.cache',
  'coverage',
  '.vscode',
  '.idea',
  'vendor',
  'target',
]);

export const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep',
]);

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const AUTO_SAVE_DELAY = 1000; // ms

export const RECENT_PROJECTS_LIMIT = 10;

export const AI_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
];
