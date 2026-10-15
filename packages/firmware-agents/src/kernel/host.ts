/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Port to everything outside the agents: files, processes, the user, logs. RoboAgent, the CLI and
 * the MCP server each provide an implementation, which is what keeps the core host-agnostic.
 */
export interface IAgentHost {
	readonly fs: IFileSystem;
	exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult>;
	/** Asks the user to allow a risky action. Hosts without a user must deny. */
	approve(request: ApprovalRequest): Promise<boolean>;
	log(level: LogLevel, message: string): void;
	progress(message: string): void;
}

/** Paths are relative to the host's workspace root; implementations refuse paths that escape it. */
export interface IFileSystem {
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	readDir(path: string): Promise<DirEntry[]>;
}

export interface DirEntry {
	readonly name: string;
	readonly isDirectory: boolean;
}

export interface ExecOptions {
	/** Relative to the workspace root. */
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
	/** Cap on captured stdout/stderr each; the rest is dropped and `truncated` is set. */
	readonly maxOutputBytes?: number;
	readonly onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface ExecResult {
	/** `null` when the process did not exit normally (killed, or failed to start). */
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
	readonly cancelled: boolean;
	readonly truncated: boolean;
	/** Set when the process could not start, e.g. `spawn openocd ENOENT`. */
	readonly spawnError?: string;
}

export interface ApprovalRequest {
	readonly agentId: string;
	readonly toolName: string;
	readonly risk: 'write' | 'hardware';
	/** One line the user can decide on, e.g. "Flash build/app.elf to STM32F407 over ST-Link". */
	readonly summary: string;
	readonly input: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
