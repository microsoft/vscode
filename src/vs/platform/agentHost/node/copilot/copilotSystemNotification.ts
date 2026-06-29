/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@github/copilot-sdk';
import { softAssertNever } from '../../../../base/common/assert.js';
import { localize } from '../../../../nls.js';

export interface ICopilotSystemNotification {
	/** Body shown inside an active turn; cleaned from SDK `system.notification.data.content`. */
	readonly content: string;
	/** Text for a new system-origin AHP turn; derived from SDK `data.kind` metadata, e.g. shell completion `description`. */
	readonly messageText: string;
	/** Whether the runtime notification wakes the agent loop when it arrives while idle. */
	readonly startsTurn: boolean;
}

export function buildCopilotSystemNotification(event: SessionEventPayload<'system.notification'>): ICopilotSystemNotification | undefined {
	const data = event.data;
	const kind = data.kind;
	const content = cleanSystemNotificationContent(data.content);
	if (!content) {
		return undefined;
	}

	switch (kind.type) {
		case 'shell_completed':
		case 'shell_detached_completed': {
			const description = kind.description;
			const shellId = kind.shellId;
			return {
				content,
				messageText: description
					? localize('agentHost.copilot.systemNotification.shellDescriptionCompleted', "`{0}` completed", description)
					: shellId
						? localize('agentHost.copilot.systemNotification.shellIdCompleted', "Shell `{0}` completed", shellId)
						: localize('agentHost.copilot.systemNotification.shellCompleted', "Shell completed"),
				startsTurn: true,
			};
		}
		case 'agent_completed':
			return {
				content,
				messageText: kind.status === 'failed'
					? localize('agentHost.copilot.systemNotification.agentFailed', "Background agent {0} failed", kind.agentId)
					: localize('agentHost.copilot.systemNotification.agentCompleted', "Background agent {0} completed", kind.agentId),
				startsTurn: true,
			};
		case 'agent_idle':
			return {
				content,
				messageText: localize('agentHost.copilot.systemNotification.agentIdle', "Background agent {0} is idle", kind.agentId),
				startsTurn: true,
			};
		case 'new_inbox_message':
			return {
				content,
				messageText: localize('agentHost.copilot.systemNotification.newInboxMessage', "New inbox message from {0}", kind.senderName),
				startsTurn: false,
			};
		case 'instruction_discovered':
			return {
				content,
				messageText: localize('agentHost.copilot.systemNotification.instructionDiscovered', "Instruction discovered: {0}", kind.description ?? kind.sourcePath),
				startsTurn: false,
			};
		default:
			softAssertNever(kind);
			return undefined;
	}
}

function cleanSystemNotificationContent(content: string): string {
	const trimmed = content.trim();
	const match = /^<system_notification>\s*([\s\S]*?)\s*<\/system_notification>$/.exec(trimmed);
	return (match?.[1] ?? trimmed).trim();
}
