/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified stream event type emitted by the CLI command layer. Each command
 * (chat, run, plan) maps the underlying core event shape onto this so the
 * `Renderer` can stay provider-agnostic.
 */
export type StreamEvent =
	| { type: 'token'; text: string }
	| { type: 'tool_call_start'; name: string; input?: unknown }
	| { type: 'tool_call_end'; name: string; output?: unknown; error?: string }
	| { type: 'plan'; tasks: ReadonlyArray<{ handle: string; description: string; scopeFiles?: ReadonlyArray<string> }> }
	| { type: 'subtask_start'; handle: string; description?: string }
	| { type: 'subtask_end'; handle: string; success: boolean; summary?: string }
	| { type: 'error'; message: string }
	| { type: 'done' };

/**
 * Output sink. `text` mode writes human-readable streamed tokens with
 * bracketed event annotations; `json` mode writes one JSON object per line.
 */
export interface Renderer {
	emit(event: StreamEvent): void;
	end(): void;
}

const isTTY = !!process.stdout.isTTY;
const dim = (s: string): string => (isTTY ? `\x1b[90m${s}\x1b[0m` : s);
const red = (s: string): string => (isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const bold = (s: string): string => (isTTY ? `\x1b[1m${s}\x1b[0m` : s);

/**
 * Human-readable renderer. Tokens stream directly to stdout as they arrive;
 * non-token events are surfaced as bracketed one-line annotations so a user
 * watching a terminal can follow what the agent is doing without parsing JSON.
 */
export class TextRenderer implements Renderer {
	emit(event: StreamEvent): void {
		switch (event.type) {
			case 'token':
				process.stdout.write(event.text);
				break;
			case 'tool_call_start':
				process.stdout.write(dim(`\n[tool: ${event.name}]\n`));
				break;
			case 'tool_call_end':
				if (event.error) {
					process.stdout.write(dim(`[tool: ${event.name} failed: ${event.error}]\n`));
				}
				break;
			case 'plan': {
				process.stdout.write(`\n${bold(`Plan (${event.tasks.length} tasks):`)}\n`);
				for (const task of event.tasks) {
					const scope = task.scopeFiles && task.scopeFiles.length > 0
						? ` [${task.scopeFiles.join(', ')}]`
						: '';
					process.stdout.write(`  - @${task.handle}: ${task.description}${scope}\n`);
				}
				break;
			}
			case 'subtask_start':
				process.stdout.write(dim(`\n[@${event.handle}${event.description ? `: ${event.description}` : ''}]\n`));
				break;
			case 'subtask_end':
				process.stdout.write(dim(`[@${event.handle} ${event.success ? 'done' : 'failed'}${event.summary ? `: ${event.summary}` : ''}]\n`));
				break;
			case 'error':
				process.stdout.write(red(`\n[error: ${event.message}]\n`));
				break;
			case 'done':
				process.stdout.write('\n');
				break;
		}
	}

	end(): void {
		// Nothing extra: tokens have already been flushed; the OS handles
		// stdout drain on process exit.
	}
}

/**
 * NDJSON renderer — one JSON object per line. Suitable for piping into
 * downstream tooling (jq, log aggregators, test harnesses).
 */
export class JsonRenderer implements Renderer {
	emit(event: StreamEvent): void {
		process.stdout.write(JSON.stringify(event) + '\n');
	}

	end(): void {
		// Caller decides whether to emit a trailing `done` event.
	}
}

export function makeRenderer(mode: 'text' | 'json'): Renderer {
	return mode === 'json' ? new JsonRenderer() : new TextRenderer();
}
