/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, SessionEventPayload, SystemNotification } from '@github/copilot-sdk';
import { softAssertNever } from '../../../../base/common/assert.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';

export interface ICopilotSystemNotification {
	/** Text for a new system-origin AHP turn; derived from SDK `data.kind` metadata, e.g. shell completion `description`. */
	readonly messageText: string;
	/** Whether the runtime notification wakes the agent loop when it arrives while idle. */
	readonly startsTurn: boolean;
}

function getCopilotSubagentDisplayInfo(event: SessionEvent): { agentId: string; displayName: string } | undefined {
	if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
		const displayName = event.data.agentDisplayName.trim();
		return event.agentId && displayName ? { agentId: event.agentId, displayName } : undefined;
	}
	if (event.type === 'system.notification') {
		const kind = event.data.kind;
		if (kind.type === 'agent_completed' || kind.type === 'agent_idle') {
			const displayName = kind.displayName?.trim() || kind.description?.trim() || kind.agentType.trim();
			return displayName ? { agentId: kind.agentId, displayName } : undefined;
		}
	}
	return undefined;
}

/** Collects agent labels without letting notification fallbacks replace canonical lifecycle names. */
export function getCopilotSubagentDisplayNames(events: readonly SessionEvent[]): ReadonlyMap<string, string> {
	const names = new Map<string, string>();
	for (const event of events) {
		const identity = getCopilotSubagentDisplayInfo(event);
		if (identity && (event.type !== 'system.notification' || !names.has(identity.agentId))) {
			names.set(identity.agentId, identity.displayName);
		}
	}
	return names;
}

export function buildCopilotSystemNotification(event: SessionEventPayload<'system.notification'>): ICopilotSystemNotification | undefined {
	const data = event.data;
	const kind: SystemNotification = data.kind;
	const content = cleanSystemNotificationContent(data.content);
	if (!content) {
		return undefined;
	}

	switch (kind.type) {
		case 'shell_completed':
		case 'shell_detached_completed': {
			const description = kind.description;
			return {
				messageText: description
					? localize('agentHost.copilot.systemNotification.shellDescriptionCompleted', "`{0}` completed", description)
					: localize('agentHost.copilot.systemNotification.shellCompleted', "Shell completed"),
				startsTurn: true,
			};
		}
		case 'agent_completed':
		case 'agent_idle': {
			const name = getCopilotSubagentDisplayInfo(event)?.displayName;
			const formattedName = name ? appendEscapedMarkdownInlineCode(name) : undefined;
			if (kind.type === 'agent_idle') {
				return {
					messageText: formattedName
						? localize('agentHost.copilot.systemNotification.agentIdle', "Background agent {0} is complete", formattedName)
						: localize('agentHost.copilot.systemNotification.unnamedAgentIdle', "Background agent is complete"),
					startsTurn: true,
				};
			}
			return {
				messageText: kind.status === 'failed'
					? formattedName
						? localize('agentHost.copilot.systemNotification.agentFailed', "Background agent {0} failed", formattedName)
						: localize('agentHost.copilot.systemNotification.unnamedAgentFailed', "Background agent failed")
					: formattedName
						? localize('agentHost.copilot.systemNotification.agentCompleted', "Background agent {0} completed", formattedName)
						: localize('agentHost.copilot.systemNotification.unnamedAgentCompleted', "Background agent completed"),
				startsTurn: true,
			};
		}
		case 'factory_completed':
			return {
				messageText: kind.status === 'error'
					? localize('agentHost.copilot.systemNotification.factoryFailed', "Factory {0} failed", kind.factoryName)
					: kind.status === 'halted'
						? localize('agentHost.copilot.systemNotification.factoryHalted', "Factory {0} was halted", kind.factoryName)
						: kind.status === 'cancelled'
							? localize('agentHost.copilot.systemNotification.factoryCancelled', "Factory {0} was cancelled", kind.factoryName)
							: localize('agentHost.copilot.systemNotification.factoryCompleted', "Factory {0} completed", kind.factoryName),
				startsTurn: true,
			};
		case 'new_inbox_message':
			return {
				messageText: localize('agentHost.copilot.systemNotification.newInboxMessage', "New inbox message from {0}", kind.senderName),
				startsTurn: false,
			};
		case 'instruction_discovered':
			return {
				messageText: localize('agentHost.copilot.systemNotification.instructionDiscovered', "Instruction discovered: {0}", kind.description ?? kind.sourcePath),
				startsTurn: false,
			};
		case 'unclassified':
			// External-host notifications that do not match a runtime-owned kind.
			// Use the cleaned content and wake the agent when idle.
			return {
				messageText: content,
				startsTurn: true,
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
