import type { MemoryVolume } from "../memory-volume.d.ts";
export interface ShellResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface ShellContext {
    cwd: string;
    env: Record<string, string>;
    volume: MemoryVolume;
    exec: (cmd: string, opts?: {
        cwd?: string;
        env?: Record<string, string>;
    }) => Promise<ShellResult>;
}
export interface ShellCommand {
    name: string;
    execute(args: string[], ctx: ShellContext): Promise<ShellResult>;
}
export interface RedirectNode {
    type: "write" | "append" | "read" | "stderr-to-stdout";
    target: string;
}
export interface CommandNode {
    kind: "command";
    args: string[];
    redirects: RedirectNode[];
    assignments: Record<string, string>;
}
export interface PipelineNode {
    kind: "pipeline";
    commands: CommandNode[];
}
export type ListOperator = "&&" | "||" | ";";
export interface ListEntry {
    pipeline: PipelineNode;
    next?: ListOperator;
}
export interface ListNode {
    kind: "list";
    entries: ListEntry[];
}
export type TokenType = "word" | "pipe" | "and" | "or" | "semi" | "redirect-out" | "redirect-app" | "redirect-in" | "redirect-2to1" | "newline" | "eof";
export interface Token {
    type: TokenType;
    value: string;
}
export type BuiltinFn = (args: string[], ctx: ShellContext, stdin?: string) => Promise<ShellResult> | ShellResult;
