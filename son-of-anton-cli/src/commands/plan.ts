/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentEvent } from 'son-of-anton-core/dist/agents/agentEvents';
import type { ChatContextLike, ChatRequestLike, ChatStreamLike } from 'son-of-anton-core/dist/chatStream';
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
import { makeRenderer } from '../render/renderer';

interface PlanOptions {
	output: 'text' | 'json';
}

/**
 * Sink that swallows orchestrator markdown chatter. The orchestrator emits a
 * lot of decorative prose alongside its structured `plan-proposed` event;
 * the CLI surfaces the structured event directly via the renderer so the
 * markdown side-channel is purely noise here.
 */
const SILENT_STREAM: ChatStreamLike = {
	markdown: () => { /* intentionally swallowed */ },
	progress: () => { /* intentionally swallowed */ },
};

const EMPTY_CONTEXT: ChatContextLike = { history: [] };

function buildRequest(prompt: string): ChatRequestLike {
	// `command: 'plan'` pins the orchestrator to its plan-only branch so it
	// drafts a plan and stops without dispatching subtasks. Same shim the
	// extension uses for plan mode.
	return { prompt, command: 'plan' };
}

export async function runPlan(prompt: string, opts: PlanOptions): Promise<void> {
	const host = buildCliHost();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		process.stderr.write(`error: ${auth.message}\n`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const piped = await readPipedStdin();
	const mergedPrompt = mergeStdinIntoPrompt(prompt, piped);

	const renderer = makeRenderer(opts.output);
	const built = buildCliAgentStack(host);
	const cancellation = new CliCancellation();
	const onSigint = (): void => cancellation.cancel();
	process.once('SIGINT', onSigint);

	try {
		await built.stack.orchestrator.handleChatRequest(
			buildRequest(mergedPrompt),
			EMPTY_CONTEXT,
			SILENT_STREAM,
			cancellation,
			(event: AgentEvent) => {
				if (event.type === 'plan-proposed') {
					renderer.emit({
						type: 'plan',
						tasks: event.plan.subtasks.map(s => ({
							handle: s.assignee,
							description: s.instruction,
							scopeFiles: s.scopeFiles,
						})),
					});
				} else if (event.type === 'error') {
					renderer.emit({ type: 'error', message: event.message });
				}
				// Other event types (subtask-*, token, final) are not expected
				// in plan-only mode; if they arrive we deliberately ignore them
				// so the CLI surface stays focused on the plan.
			},
		);
		renderer.emit({ type: 'done' });
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
}
