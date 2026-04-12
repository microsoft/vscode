import { EventEmitter } from "./events.js";
export declare function getActiveInterfaceCount(): number;
export declare function setActiveInterfaceCount(n: number): void;
export declare function resetActiveInterfaceCount(): void;
export interface InterfaceConfig {
    input?: unknown;
    output?: unknown;
    terminal?: boolean;
    prompt?: string;
    historySize?: number;
    history?: string[];
    removeHistoryDuplicates?: boolean;
    completer?: (line: string) => [string[], string] | void;
    crlfDelay?: number;
    escapeCodeTimeout?: number;
    tabSize?: number;
    signal?: AbortSignal;
}
export declare function emitKeypressEvents(stream: unknown, _iface?: Interface): void;
export interface Interface extends EventEmitter {
    _promptStr: string;
    input: unknown;
    output: unknown;
    closed: boolean;
    _lineBuffer: string;
    _pendingQuestions: Array<{
        query: string;
        handler: (answer: string) => void;
        signal?: AbortSignal;
        abortListener?: () => void;
    }>;
    terminal: boolean;
    line: string;
    cursor: number;
    history: string[];
    _historyIndex: number;
    _historySize: number;
    _removeHistoryDuplicates: boolean;
    _savedLine: string;
    _killRing: string[];
    _refreshLine(): void;
    _onKeypress(char: string | undefined, key: any): void;
    _onData(text: string): void;
    _addToHistory(line: string): void;
    prompt(preserveCursor?: boolean): void;
    setPrompt(text: string): void;
    getPrompt(): string;
    question(query: string, optsOrHandler?: unknown, handler?: (answer: string) => void): void;
    pause(): this;
    resume(): this;
    close(): void;
    write(data: string | null, _key?: {
        ctrl?: boolean;
        name?: string;
        meta?: boolean;
        shift?: boolean;
        sequence?: string;
    }): void;
    clearLine(dir?: number): void;
    getCursorPos(): {
        rows: number;
        cols: number;
    };
    [Symbol.asyncIterator](): AsyncGenerator<string, void, undefined>;
}
interface InterfaceConstructor {
    new(cfg?: InterfaceConfig): Interface;
    (this: any, cfg?: InterfaceConfig): void;
    prototype: any;
}
export declare const Interface: InterfaceConstructor;
export declare function createInterface(cfgOrInput?: InterfaceConfig | unknown, output?: unknown): Interface;
export declare function clearLine(stream: unknown, dir: number, done?: () => void): boolean;
export declare function clearScreenDown(stream: unknown, done?: () => void): boolean;
export declare function cursorTo(stream: unknown, x: number, yOrDone?: number | (() => void), done?: () => void): boolean;
export declare function moveCursor(stream: unknown, dx: number, dy: number, done?: () => void): boolean;
declare class ReadlineWriter {
    private _stream;
    private _buffer;
    private _autoCommit;
    constructor(stream: any, opts?: {
        autoCommit?: boolean;
    });
    clearLine(dir: -1 | 0 | 1): this;
    clearScreenDown(): this;
    cursorTo(x: number, y?: number): this;
    moveCursor(dx: number, dy: number): this;
    commit(): Promise<void>;
    rollback(): this;
}
export declare const promises: {
    createInterface(cfg?: InterfaceConfig): any;
    Readline: typeof ReadlineWriter;
};
declare const _default: {
    Interface: InterfaceConstructor;
    createInterface: typeof createInterface;
    clearLine: typeof clearLine;
    clearScreenDown: typeof clearScreenDown;
    cursorTo: typeof cursorTo;
    moveCursor: typeof moveCursor;
    emitKeypressEvents: typeof emitKeypressEvents;
    promises: {
        createInterface(cfg?: InterfaceConfig): any;
        Readline: typeof ReadlineWriter;
    };
};
export default _default;
