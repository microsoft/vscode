/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITool, ToolContext, ToolError } from './tool';
import { AnyTool } from './toolRegistry';

/**
 * Decorator: asks the host before running a `write` or `hardware` tool. `read` tools pass
 * straight through. A denial is a {@link ToolError}, so the model learns it was declined.
 */
export class ApprovalRequiredTool<I, O> implements ITool<I, O> {
	constructor(private readonly inner: ITool<I, O>) { }

	get name() { return this.inner.name; }
	get description() { return this.inner.description; }
	get inputSchema() { return this.inner.inputSchema; }
	get risk() { return this.inner.risk; }

	describeCall(input: I): string {
		return this.inner.describeCall?.(input) ?? `Run ${this.inner.name}`;
	}

	async invoke(input: I, context: ToolContext): Promise<O> {
		const risk = this.inner.risk;
		if (risk !== 'read') {
			const approved = await raceAbort(context.host.approve({
				agentId: context.agentId,
				toolName: this.inner.name,
				risk,
				summary: this.describeCall(input),
				input,
			}).catch(err => {
				// A broken approval UI must not look like the user's decision, but it still denies.
				context.host.log('error', `[${context.agentId}] approval prompt for ${this.inner.name} failed: ${err instanceof Error ? err.message : String(err)}`);
				return false;
			}), context.signal);
			if (context.signal.aborted) {
				throw new ToolError('Cancelled while waiting for approval.');
			}
			if (!approved) {
				throw new ToolError(`The user declined "${this.inner.name}". Do not retry it unchanged; explain what you wanted to do or choose another approach.`);
			}
		}
		return this.inner.invoke(input, context);
	}
}

/** Resolves with `promise`, or with `false` as soon as `signal` aborts (a pending prompt must not hang a cancelled run). */
function raceAbort(promise: Promise<boolean>, signal: AbortSignal): Promise<boolean> {
	if (signal.aborted) {
		return Promise.resolve(false);
	}
	return new Promise(resolve => {
		const onAbort = () => resolve(false);
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			value => { signal.removeEventListener('abort', onAbort); resolve(value); },
			() => { signal.removeEventListener('abort', onAbort); resolve(false); },
		);
	});
}

/** Wraps every tool so non-read tools need approval. Already-wrapped tools are left alone. */
export function withApproval(tools: readonly AnyTool[]): AnyTool[] {
	return tools.map(tool => tool instanceof ApprovalRequiredTool ? tool : new ApprovalRequiredTool(tool));
}
