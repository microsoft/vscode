/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AgentHostChatIsolationStateMetaKey = 'vscode.chatIsolationState';

/** Per-chat workspace change state published on the session; `blocked` chats cannot accept input until recovered. */
export type ChatIsolationState = 'isolating' | 'changingWorkspace' | 'blocked';

export function readAgentHostChatIsolationStates(parent: { _meta?: Record<string, unknown> } | undefined): Readonly<Record<string, ChatIsolationState>> {
	const value = parent?._meta?.[AgentHostChatIsolationStateMetaKey];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const states = new Map<string, ChatIsolationState>();
	for (const [chat, state] of Object.entries(value)) {
		if (chat && (state === 'isolating' || state === 'changingWorkspace' || state === 'blocked')) {
			states.set(chat, state);
		}
	}
	return Object.fromEntries(states);
}
