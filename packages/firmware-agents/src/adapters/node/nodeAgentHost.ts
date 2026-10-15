/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApprovalRequest, ExecOptions, ExecResult, IAgentHost, IFileSystem, LogLevel } from '../../kernel/host';
import { redactSecrets } from '../../kernel/redact';
import { NodeFileSystem } from './nodeFileSystem';
import { runProcess } from './nodeProcessRunner';

/** Environment variables never passed to child processes (in addition to {@link SECRET_ENV_PATTERN}). */
export const DEFAULT_SECRET_ENV_NAMES: readonly string[] = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];

/** Names that look like credentials (GITHUB_TOKEN, AWS_SECRET_ACCESS_KEY, NPM_TOKEN, DB_PASSWORD, …). */
export const SECRET_ENV_PATTERN = /TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL|SESSION_?KEY/i;

export interface NodeAgentHostOptions {
	/** Workspace root; files and process working directories are confined to it. */
	readonly root: string;
	/** Asks the user. Omitted means every risky action is denied (safe for unattended runs). */
	readonly approve?: (request: ApprovalRequest) => Promise<boolean>;
	readonly write?: (line: string) => void;
	/** Values never to print or hand to the model (API keys); known key formats are redacted regardless. */
	readonly secrets?: readonly string[];
	/** Variables stripped from child environments (default {@link DEFAULT_SECRET_ENV_NAMES}). */
	readonly secretEnvNames?: readonly string[];
	readonly minLogLevel?: LogLevel;
	/** Environment children start from (default: this process's). */
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** {@link IAgentHost} for plain Node: the CLI, the MCP server, CI and tests. */
export class NodeAgentHost implements IAgentHost {
	readonly fs: IFileSystem;
	private readonly childEnv: Record<string, string | undefined>;

	constructor(private readonly options: NodeAgentHostOptions) {
		this.fs = new NodeFileSystem(options.root);
		const secretValues = new Set(options.secrets ?? []);
		const secretNames = new Set(options.secretEnvNames ?? DEFAULT_SECRET_ENV_NAMES);
		this.childEnv = Object.fromEntries(Object.entries(options.env ?? process.env)
			.filter(([name, value]) => !secretNames.has(name) && !SECRET_ENV_PATTERN.test(name) && !(value !== undefined && secretValues.has(value))));
	}

	exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult> {
		// Tool output goes to the model and the UI; keep secrets out of both even if a child prints one.
		return runProcess(this.options.root, command, args, { ...options, baseEnv: this.childEnv, redact: text => this.redact(text) });
	}

	approve(request: ApprovalRequest): Promise<boolean> {
		return this.options.approve ? this.options.approve(request) : Promise.resolve(false);
	}

	log(level: LogLevel, message: string): void {
		if (LEVELS.indexOf(level) >= LEVELS.indexOf(this.options.minLogLevel ?? 'info')) {
			this.emit(`[${level}] ${message}`);
		}
	}

	progress(message: string): void {
		this.emit(`… ${message}`);
	}

	private redact(text: string): string {
		return redactSecrets(text, this.options.secrets);
	}

	private emit(line: string): void {
		const write = this.options.write ?? ((l: string) => process.stderr.write(`${l}\n`));
		write(this.redact(line));
	}
}
