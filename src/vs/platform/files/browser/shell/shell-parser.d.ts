import type { Token, ListNode } from "./shell-types.d.ts";
import type { MemoryVolume } from "../memory-volume.d.ts";
export declare function expandVariables(raw: string, env: Record<string, string>, lastExit: number): string;
export declare function expandGlob(pattern: string, cwd: string, volume: MemoryVolume): string[];
export declare function tokenize(input: string, env: Record<string, string>, lastExit: number): Token[];
export declare function parse(input: string, env: Record<string, string>, lastExit?: number): ListNode;
