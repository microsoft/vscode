/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { parseRemoteAgentHostHarness } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { SessionType } from './chatSessionsService.js';

const storagePrefix = 'chat.editorUsage.';
const providers = ['local', 'copilotcli', 'cloud', 'copilot', 'claude', 'codex', 'codexExtension', 'growth', 'remoteCopilot', 'remoteClaude', 'remoteCodex', 'other'] as const;

export interface IEditorChatUsageTelemetry {
	editorSessionsByProvider: string;
	editorMessages: number;
	editorMessagesWithOtherSessionInProgress: number;
	editorMessagesWithOtherSessionInProgressAcrossWindows: number;
	editorLastMessageSecondsAgo: number | undefined;
}

function getProvider(sessionType: string): typeof providers[number] {
	switch (sessionType) {
		case SessionType.Local: return 'local';
		case SessionType.CopilotCLI: return 'copilotcli';
		case SessionType.CopilotCloud: return 'cloud';
		case SessionType.AgentHostCopilot: return 'copilot';
		case SessionType.AgentHostClaude: return 'claude';
		case SessionType.AgentHostCodex: return 'codex';
		case SessionType.Codex: return 'codexExtension';
		case SessionType.Growth: return 'growth';
	}
	switch (parseRemoteAgentHostHarness(sessionType)) {
		case 'copilotcli': return 'remoteCopilot';
		case 'claude': return 'remoteClaude';
		case 'codex': return 'remoteCodex';
		default: return 'other';
	}
}

/** Best-effort editor-only usage shared across profiles and applications; overlapping window writes can lose increments. */
export class EditorChatUsage {
	constructor(private readonly storageService: IStorageService) { }

	recordSubmission(sessionType: string, isNewSession: boolean, otherSessionInProgress: boolean, otherWindowSessionInProgress: boolean, timestamp: number): void {
		if (isNewSession) {
			this.increment(`sessions.${getProvider(sessionType)}`);
		}
		this.increment('messages');
		if (otherSessionInProgress) {
			this.increment('messagesWithOtherSessionInProgress');
		}
		if (otherSessionInProgress || otherWindowSessionInProgress) {
			this.increment('messagesWithOtherSessionInProgressAcrossWindows');
		}
		this.storageService.store(`${storagePrefix}lastMessageDate`, Math.max(this.getNumber('lastMessageDate'), timestamp), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
	}

	private getNumber(key: string): number {
		return this.storageService.getNumber(`${storagePrefix}${key}`, StorageScope.APPLICATION_SHARED, 0);
	}

	private increment(key: string): void {
		this.storageService.store(`${storagePrefix}${key}`, this.getNumber(key) + 1, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
	}

	getTelemetry(now = Date.now()): IEditorChatUsageTelemetry {
		const sessionsByProvider: Record<string, number> = {};
		for (const provider of providers) {
			const count = this.getNumber(`sessions.${provider}`);
			if (count > 0) {
				sessionsByProvider[provider] = count;
			}
		}
		const messages = this.getNumber('messages');
		return {
			editorSessionsByProvider: JSON.stringify(sessionsByProvider),
			editorMessages: messages,
			editorMessagesWithOtherSessionInProgress: this.getNumber('messagesWithOtherSessionInProgress'),
			editorMessagesWithOtherSessionInProgressAcrossWindows: this.getNumber('messagesWithOtherSessionInProgressAcrossWindows'),
			editorLastMessageSecondsAgo: messages > 0 ? Math.max(0, Math.floor((now - this.getNumber('lastMessageDate')) / 1000)) : undefined,
		};
	}
}
