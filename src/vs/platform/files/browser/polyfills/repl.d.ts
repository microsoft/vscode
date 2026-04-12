import { EventEmitter } from "./events.js";
export declare const REPL_MODE_SLOPPY: unique symbol;
export declare const REPL_MODE_STRICT: unique symbol;
export interface Recoverable extends SyntaxError {
    err: Error;
}
interface RecoverableConstructor {
    new(err: Error): Recoverable;
    (this: any, err: Error): void;
    prototype: any;
}
export declare const Recoverable: RecoverableConstructor;
export interface REPLServer extends EventEmitter {
    context: Record<string, unknown>;
    terminal: boolean;
    _prompt: string;
    _commands: Map<string, {
        help: string;
        action: Function;
    }>;
    setPrompt(prompt: string): void;
    getPrompt(): string;
    displayPrompt(_preserveCursor?: boolean): void;
    defineCommand(keyword: string, cmd: {
        help?: string;
        action: Function;
    } | Function): void;
    close(): void;
    setupHistory(_historyPath: string, cb: (err: Error | null, repl: REPLServer) => void): void;
}
interface REPLServerConstructor {
    new(options?: string | Record<string, unknown>): REPLServer;
    (this: any, options?: string | Record<string, unknown>): void;
    prototype: any;
}
export declare const REPLServer: REPLServerConstructor;
export declare function start(options?: string | Record<string, unknown>): REPLServer;
declare const _default: {
    start: typeof start;
    REPLServer: REPLServerConstructor;
    Recoverable: RecoverableConstructor;
    REPL_MODE_SLOPPY: symbol;
    REPL_MODE_STRICT: symbol;
};
export default _default;
