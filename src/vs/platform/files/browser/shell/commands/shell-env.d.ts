import type { BuiltinFn } from "../shell-types.d.ts";
export declare function setBuiltinsRef(b: Map<string, BuiltinFn>): void;
export declare const shellEnvCommands: [string, BuiltinFn][];
