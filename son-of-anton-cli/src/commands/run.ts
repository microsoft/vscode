/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentHandle } from 'son-of-anton-core/dist/agents/types';
import { buildCliAgentStack } from '../agentStackBuilder';
import { bootstrapCredentials } from '../auth/bootstrap';
import { CliCancellation } from '../cancellation';
import { buildCliHost } from '../cliHost';
import { makeRenderer } from '../render/renderer';

interface RunOptions {
	model?: string;
	output: 'text' | 'json';
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

export async function runSpecialist(handle: string, prompt: string, opts: RunOptions): Promise<void> {
	const host = buildCliHost();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		process.stderr.write(`error: ${auth.message}\n`);
		process.exit(1);
	}

	const handleId = normaliseHandle(handle);
	const renderer = makeRenderer(opts.output);

	const built = buildCliAgentStack(host);
	const specialist = built.stack.specialists.get(handleId);
	if (!specialist) {
		const known = [...built.stack.specialists.keys()].map(h => `@${h}`).join(', ');
		renderer.emit({
			type: 'error',
			message: `unknown specialist "@${handleId}". Available: ${known}`,
		});
		built.dispose();
		process.exit(1);
	}

	const cancellation = new CliCancellation();
	const onSigint = (): void => cancellation.cancel();
	process.once('SIGINT', onSigint);

	try {
		await specialist.runChatTurn(
			prompt,
			(token) => renderer.emit({ type: 'token', text: token }),
			cancellation,
		);
		renderer.emit({ type: 'done' });
	} catch (err) {
		renderer.emit({
			type: 'error',
			message: err instanceof Error ? err.message : String(err),
		});
		process.exitCode = 1;
	} finally {
		process.off('SIGINT', onSigint);
		built.dispose();
	}

	// `--model` is currently advisory. The specialist's `runChatTurn` uses its
	// configured `defaultModel`; surfacing model-override into the agent path
	// is a cross-cutting change tracked separately.
	if (opts.model) {
		// Acknowledge so users know the flag was parsed (text mode only).
		if (opts.output === 'text') {
			process.stderr.write(`note: --model "${opts.model}" not yet honoured by specialist runs (uses ${specialist.defaultModel}).\n`);
		}
	}
}
