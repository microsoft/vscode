/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@microsoft/copilot-sdk';
import type { IToolCallHookDenialMeta } from '../../common/meta/agentToolCallMeta.js';

const preToolUseHookType = 'preToolUse';
const deniedErrorCode = 'denied';

/**
 * Attributes tool calls that the runtime failed as `denied` to the `preToolUse` hook that denied them.
 *
 * A `preToolUse` `hook.end` arrives before the call completes, and its output is keyed by the tool call
 * IDs it answered for. Calls that VS Code's own SDK callback denied are left out, because the runtime
 * merges that callback's answer with the user's hooks.
 */
export class CopilotHookToolDenials {
	private readonly _hookAnswers = new Map<string, IToolCallHookDenialMeta>();
	private readonly _selfDenials = new Set<string>();
	private _selfDenialsUnidentifiable = false;

	/**
	 * Records that VS Code's own `preToolUse` callback denied a call. Without the call's ID, which older
	 * runtimes omit, no denial can be told apart from VS Code's, so none are attributed from then on.
	 */
	recordSelfDenial(toolCallId: string | undefined): void {
		if (toolCallId === undefined) {
			this._selfDenialsUnidentifiable = true;
			this._hookAnswers.clear();
			this._selfDenials.clear();
			return;
		}
		this._selfDenials.add(toolCallId);
	}

	recordHookEnd(data: SessionEventPayload<'hook.end'>['data']): void {
		const output = data.output;
		if (data.hookType !== preToolUseHookType || this._selfDenialsUnidentifiable || !output || typeof output !== 'object' || Array.isArray(output)) {
			return;
		}
		// The runtime names the hook only when it failed, and it then denies the call because of the failure.
		const source = !data.success && data.error?.source ? data.error.source : undefined;
		const denial: IToolCallHookDenialMeta = source ? { hookType: data.hookType, source } : { hookType: data.hookType };
		for (const toolCallId of Object.keys(output)) {
			this._hookAnswers.set(toolCallId, denial);
		}
	}

	/** Forgets the call and returns the hook that denied it, if a user's hook did. */
	takeDenial(toolCallId: string, completion: Pick<SessionEventPayload<'tool.execution_complete'>['data'], 'success' | 'error'>): IToolCallHookDenialMeta | undefined {
		const denial = this._hookAnswers.get(toolCallId);
		const deniedBySelf = this._selfDenials.has(toolCallId);
		this._hookAnswers.delete(toolCallId);
		this._selfDenials.delete(toolCallId);
		return !completion.success && completion.error?.code === deniedErrorCode && !deniedBySelf ? denial : undefined;
	}
}
