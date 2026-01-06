/**
 * グローバル型定義
 * 
 * Node.js環境のグローバルオブジェクトの型定義
 */

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare const process: {
  exit(code?: number): never;
  main?: NodeModule;
};

declare const require: {
  main: NodeModule | undefined;
};

