/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApprovalRequest, DirEntry, ExecResult, IAgentHost, IFileSystem, LogLevel } from '../kernel/host';

export class MemoryFileSystem implements IFileSystem {
	readonly files = new Map<string, string>();

	async readFile(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`ENOENT: ${path}`);
		}
		return content;
	}
	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}
	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}
	async readDir(): Promise<DirEntry[]> {
		return [...this.files.keys()].map(name => ({ name, isDirectory: false }));
	}
}

/** In-memory host that records approvals, commands and logs. */
export class FakeHost implements IAgentHost {
	readonly fs = new MemoryFileSystem();
	readonly approvals: ApprovalRequest[] = [];
	readonly commands: { command: string; args: readonly string[] }[] = [];
	readonly logs: { level: LogLevel; message: string }[] = [];

	constructor(private readonly approveAll = true) { }

	async exec(command: string, args: readonly string[]): Promise<ExecResult> {
		this.commands.push({ command, args });
		return { exitCode: 0, stdout: '', stderr: '', timedOut: false, cancelled: false, truncated: false };
	}
	async approve(request: ApprovalRequest): Promise<boolean> {
		this.approvals.push(request);
		return this.approveAll;
	}
	log(level: LogLevel, message: string): void {
		this.logs.push({ level, message });
	}
	progress(): void { }
}
