/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@microsoft/copilot-sdk';
import { localize } from '../../../../nls.js';
import { AgentHookOutcome, AgentSystemNotificationKind, AgentSystemNotificationSeverity, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import type { SystemNotificationResponsePart } from '../../common/state/protocol/state.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';

/**
 * Builds the chat notice for a hook that could not start or crashed.
 *
 * Returns `undefined` for a successful hook, and for a failure the runtime does
 * not attribute to a hook source: VS Code registers its own callback hooks with
 * the runtime, and their failures must not be presented as the user's hook.
 */
export function createHookFailureNotification(data: SessionEventPayload<'hook.end'>['data']): SystemNotificationResponsePart | undefined {
	const source = data.error?.source;
	if (data.success || !data.error || !source) {
		return undefined;
	}
	const message = data.error.message;
	return {
		kind: ResponsePartKind.SystemNotification,
		// Plain text, so a client that does not read the hook metadata still shows the whole failure.
		content: localize('copilot.hook.failed', "The {0} hook from {1} failed: {2}", data.hookType, source, message),
		_meta: toAgentSystemNotificationMeta({
			kind: AgentSystemNotificationKind.Hook,
			severity: AgentSystemNotificationSeverity.Warning,
			hook: {
				type: data.hookType,
				outcome: AgentHookOutcome.Failed,
				source,
				message,
			},
		}),
	};
}

/** Builds the chat notice for a prompt a hook blocked, carrying the hook's reason. */
export function createPromptBlockedNotification(reason: string): SystemNotificationResponsePart {
	return {
		kind: ResponsePartKind.SystemNotification,
		content: reason
			? localize('copilot.hook.blockedPrompt', "A hook blocked this prompt: {0}", reason)
			: localize('copilot.hook.blockedPromptNoReason', "A hook blocked this prompt."),
		_meta: toAgentSystemNotificationMeta({
			kind: AgentSystemNotificationKind.Hook,
			// The prompt never reached the model.
			severity: AgentSystemNotificationSeverity.Error,
			hook: {
				outcome: AgentHookOutcome.Blocked,
				...(reason ? { message: reason } : {}),
			},
		}),
	};
}

/** Builds the chat notice for a warning the runtime reported about a hook, named by its event when known. */
export function createHookWarningNotification(hookType: string | undefined, message: string): SystemNotificationResponsePart {
	return {
		kind: ResponsePartKind.SystemNotification,
		content: hookType
			? localize('copilot.hook.warning', "Warning from the {0} hook: {1}", hookType, message)
			: localize('copilot.hook.warningNoType', "Hook warning: {0}", message),
		_meta: toAgentSystemNotificationMeta({
			kind: AgentSystemNotificationKind.Hook,
			severity: AgentSystemNotificationSeverity.Warning,
			hook: {
				...(hookType ? { type: hookType } : {}),
				outcome: AgentHookOutcome.Warned,
				message,
			},
		}),
	};
}

interface IHookWarningEvent {
	readonly id: string;
	readonly parentId: string | null;
	readonly agentId?: string;
}

/**
 * Pairs a hook's warning with the hook it came from.
 *
 * The runtime sends a hook's warnings, such as its stderr when it exits with
 * code 2, immediately before that hook's `hook.end`, which names the hook
 * event; each event's `parentId` is the event sent just before it. So only an
 * unbroken run of warnings that the `hook.end` directly follows belongs to
 * that hook. The same warning type is used for warnings no hook sent, such as
 * a hook file that could not be loaded, which may arrive while a hook runs;
 * no `hook.end` directly follows them, so they are never shown as a hook's.
 */
export class CopilotHookWarnings {
	private _run: { lastId: string; readonly agentId: string | undefined; readonly messages: string[] } | undefined;

	hold(event: IHookWarningEvent, message: string): void {
		if (this._run && event.parentId === this._run.lastId && event.agentId === this._run.agentId) {
			this._run.messages.push(message);
			this._run.lastId = event.id;
		} else {
			this._run = { lastId: event.id, agentId: event.agentId, messages: [message] };
		}
	}

	/** Returns the warnings this `hook.end` directly follows, and drops any others. */
	hookEnded(hookEnd: IHookWarningEvent): readonly string[] {
		const run = this._run;
		this._run = undefined;
		return run && hookEnd.parentId === run.lastId && hookEnd.agentId === run.agentId ? run.messages : [];
	}
}
