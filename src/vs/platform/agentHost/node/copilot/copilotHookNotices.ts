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
