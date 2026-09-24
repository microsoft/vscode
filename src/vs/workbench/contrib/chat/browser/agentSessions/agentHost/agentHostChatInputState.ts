/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import type { IAgentPrepareChatResult } from '../../../../../../platform/agentHost/common/agent.js';
import type { ErrorInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

export const RETRY_CHAT_PREPARATION_COMMAND = 'workbench.action.chat.retryPreparation';

CommandsRegistry.registerCommand(RETRY_CHAT_PREPARATION_COMMAND, async (accessor, resource: URI) => {
	const session = await accessor.get(IChatSessionsService).getOrCreateChatSession(URI.revive(resource), CancellationToken.None);
	await session.retryInput?.();
});

export function codexWriterLockMessage(): string {
	return localize('agentHost.codexWriterLock', "This conversation is in use by another Codex app. Let any running task finish, then quit the app holding it open, such as ChatGPT, or exit the Codex CLI session.");
}

/** Keeps chat preparation failures out of the transcript and preserves the unsent draft. */
export class AgentHostChatInputState extends Disposable {
	private static _nextId = 0;
	readonly isInputBlocked = observableValue(this, false);
	private readonly _notificationId = `agentHost.chatPreparation.${AgentHostChatInputState._nextId++}`;
	private _error: ErrorInfo | undefined;
	private _pending: Promise<void> | undefined;
	private _generation = 0;

	constructor(
		private readonly _sessionResource: URI,
		private readonly _prepare: () => Promise<IAgentPrepareChatResult>,
		@IChatInputNotificationService private readonly _notifications: IChatInputNotificationService,
	) {
		super();
	}

	prepare(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.resolve();
		}
		if (this._pending) {
			return this._pending;
		}
		const generation = ++this._generation;
		this.isInputBlocked.set(true, undefined);
		this._updateNotification(true);
		const pending = Promise.resolve().then<IAgentPrepareChatResult>(() => generation === this._generation && !this._store.isDisposed ? this._prepare() : {}).then(result => {
			if (generation === this._generation && !this._store.isDisposed) {
				this._error = result.error;
				this.isInputBlocked.set(!!result.error, undefined);
			}
		}, error => {
			if (generation === this._generation && !this._store.isDisposed) {
				this._error = { errorType: 'ChatPreparationFailed', message: toErrorMessage(error) };
			}
		}).finally(() => {
			if (generation === this._generation && !this._store.isDisposed) {
				this._pending = undefined;
				this._updateNotification(false);
			}
		});
		this._pending = pending;
		return pending;
	}

	showWriterLock(error: ErrorInfo): void {
		if (error.errorType !== 'CodexThreadInUse') {
			return;
		}
		this._generation++;
		this._pending = undefined;
		this._error = error;
		this.isInputBlocked.set(true, undefined);
		this._updateNotification(false);
	}

	reset(): void {
		this._generation++;
		this._pending = undefined;
		this._error = undefined;
		this.isInputBlocked.set(false, undefined);
		this._notifications.deleteNotification(this._notificationId);
	}

	private _updateNotification(checking: boolean): void {
		if (!this._error) {
			this._notifications.deleteNotification(this._notificationId);
			return;
		}
		const locked = this._error.errorType === 'CodexThreadInUse';
		this._notifications.setNotification({
			id: this._notificationId,
			telemetryId: 'agentHost.chatPreparation',
			severity: ChatInputNotificationSeverity.Error,
			message: locked ? localize('agentHost.conversationInUse', "Conversation in Use") : localize('agentHost.conversationUnavailable', "Conversation Unavailable"),
			description: checking
				? localize('agentHost.checkingConversation', "Checking whether this conversation is available…")
				: locked ? localize('agentHost.codexWriterLockRetry', "{0} Select Retry to continue in VS Code.", codexWriterLockMessage()) : localize('agentHost.prepareChatFailed', "Couldn't prepare this conversation. Select Retry to try again. {0}", this._error.message),
			actions: checking ? [] : [{
				kind: ChatInputNotificationActionKind.Command,
				label: localize('agentHost.retryPreparation', "Retry"),
				commandId: RETRY_CHAT_PREPARATION_COMMAND,
				commandArgs: [this._sessionResource],
				keepOpen: true,
			}],
			dismissible: false,
			autoDismissOnMessage: false,
			sessionResources: [this._sessionResource],
		});
	}

	override dispose(): void {
		this.reset();
		super.dispose();
	}
}
