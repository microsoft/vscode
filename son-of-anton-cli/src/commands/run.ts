/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentHandle } from 'son-of-anton-core/dist/agents/types';
import { buildCliAgentStack } from '../agentStackBuilder';
import { bootstrapCredentials } from '../auth/bootstrap';
import { CliCancellation } from '../cancellation';
import { buildCliHost } from '../cliHost';
import {
	classifyError,
	mergeStdinIntoPrompt,
	readPipedStdin,
	SOTA_EXIT_CODES,
} from '../headless';
import { makeRenderer, type Renderer, type StreamEvent } from '../render/renderer';

interface RunOptions {
	model?: string;
	output: 'text' | 'json';
	quiet?: boolean;
	maxTurns?: string;
}

/**
 * Strip a leading `@` from the supplied handle so users can invoke either
 * `sota run @anton-code "..."` (matches the chat surface convention) or
 * `sota run anton-code "..."` (saves a shell escape on most prompts).
 */
function normaliseHandle(raw: string): AgentHandle {
	const trimmed = raw.startsWith('@') ? raw.slice(1) : raw;
	return trimmed as AgentHandle;
}

/**
 * In `--quiet` mode we want the final assistant text on stdout (so
 * `$(sota run @anton-code "...")` works in shell scripts) and nothing else.
 * Tool annotations, errors, and progress markers go to stderr or are dropped
 * entirely depending on the output mode.
 */
function makeRunRenderer(opts: RunOptions): { renderer: Renderer; getCapturedText: () => string } {
	if (opts.quiet && opts.output === 'text') {
		let captured = '';
		const renderer: Renderer = {
			emit(event: StreamEvent): void {
				if (event.type === 'token') {
					captured += event.text;
					return;
				}
				if (event.type === 'error') {
					process.stderr.write(`error: ${event.message}\n`);
				}
				// Drop the rest in quiet mode — scripts only want the answer.
			},
			end(): void {
				// no-op; caller flushes captured text after success.
			},
		};
		return { renderer, getCapturedText: () => captured };
	}
	const renderer = makeRenderer(opts.output);
	return { renderer, getCapturedText: () => '' };
}

export async function runSpecialist(handle: string, prompt: string, opts: RunOptions): Promise<void> {
	const host = buildCliHost();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		process.stderr.write(`error: ${auth.message}\n`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	// Merge piped stdin onto the prompt so users can do
	// `cat README.md | sota run @anton-docs "summarise"`.
	const piped = await readPipedStdin();
	const mergedPrompt = mergeStdinIntoPrompt(prompt, piped);

	const handleId = normaliseHandle(handle);
	const { renderer, getCapturedText } = makeRunRenderer(opts);

	const built = buildCliAgentStack(host);
	const specialist = built.stack.specialists.get(handleId);
	if (!specialist) {
		const known = [...built.stack.specialists.keys()].map(h => `@${h}`).join(', ');
		renderer.emit({
			type: 'error',
			message: `unknown specialist "@${handleId}". Available: ${known}`,
		});
		built.dispose();
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const cancellation = new CliCancellation();
	const onSigint = (): void => cancellation.cancel();
	process.once('SIGINT', onSigint);

	try {
		await specialist.runChatTurn(
			mergedPrompt,
			(token) => renderer.emit({ type: 'token', text: token }),
			cancellation,
		);
		renderer.emit({ type: 'done' });

		if (opts.quiet && opts.output === 'text') {
			// Quiet mode: the final reply lands on stdout exactly once, with a
			// trailing newline so the shell substitution stays clean.
			const captured = getCapturedText();
			if (captured) {
				process.stdout.write(captured.trim() + '\n');
			}
		}
	} catch (err) {
		renderer.emit({
			type: 'error',
			message: err instanceof Error ? err.message : String(err),
		});
		process.exitCode = classifyError(err);
	} finally {
		process.off('SIGINT', onSigint);
		built.dispose();
	}

	// Advisory acknowledgements for flags the agent runtime does not honour
	// directly yet. Routed to stderr so they don't pollute --output json.
	if (opts.output === 'text' && !opts.quiet) {
		if (opts.model) {
			process.stderr.write(`note: --model "${opts.model}" not yet honoured by specialist runs (uses ${specialist.defaultModel}).\n`);
		}
		if (opts.maxTurns) {
			process.stderr.write(`note: --max-turns "${opts.maxTurns}" is advisory; the specialist runs a single turn today.\n`);
		}
	}
}
