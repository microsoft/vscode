/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import type { AgentChatInputState } from '../../../../../../platform/agentHost/common/meta/agentHostChatInputState.js';
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
	readonly isInputBlocked: IObservable<boolean>;
	private readonly _notificationId = `agentHost.chatInput.${AgentHostChatInputState._nextId++}`;
	private readonly _retrying = observableValue(this, false);
	private readonly _retryError = observableValue<{ readonly state: AgentChatInputState; readonly error: ErrorInfo } | undefined>(this, undefined);
	private _pending: Promise<void> | undefined;

	constructor(
		private readonly _sessionResource: URI,
		private readonly _state: IObservable<AgentChatInputState | undefined>,
		private readonly _refresh: () => Promise<void>,
		@IChatInputNotificationService private readonly _notifications: IChatInputNotificationService,
	) {
		super();
		const retryError = derived(this, reader => {
			const failure = this._retryError.read(reader);
			return failure?.state === this._state.read(reader) ? failure?.error : undefined;
		});
		this.isInputBlocked = derived(this, reader => !!this._state.read(reader) || this._retrying.read(reader) || !!retryError.read(reader));
		this._register(autorun(reader => this._updateNotification(this._state.read(reader), this._retrying.read(reader), retryError.read(reader))));
	}

	retry(): Promise<void> {
		if (this._store.isDisposed || !this._state.get()) {
			return Promise.resolve();
		}
		if (!this._pending) {
			this._retrying.set(true, undefined);
			this._pending = Promise.resolve().then(async () => {
				try {
					if (!this._store.isDisposed) {
						await this._refresh();
						this._retryError.set(undefined, undefined);
					}
				} catch (error) {
					const state = this._state.get();
					if (!this._store.isDisposed && state) {
						this._retryError.set({ state, error: { errorType: 'ChatRefreshFailed', message: toErrorMessage(error) } }, undefined);
					}
				} finally {
					this._pending = undefined;
					this._retrying.set(false, undefined);
				}
			});
		}
		return this._pending;
	}

	private _updateNotification(state: AgentChatInputState | undefined, retrying: boolean, retryError: ErrorInfo | undefined): void {
		if (!state && !retrying && !retryError) {
			this._notifications.deleteNotification(this._notificationId);
			return;
		}
		const checking = retrying || state?.kind === 'checking';
		const error = retryError ?? (state?.kind === 'blocked' ? state.error : undefined);
		const locked = error?.errorType === 'CodexThreadInUse';
		this._notifications.setNotification({
			id: this._notificationId,
			telemetryId: 'agentHost.chatInput',
			severity: ChatInputNotificationSeverity.Error,
			message: checking ? localize('agentHost.checkingConversationTitle', "Checking Conversation") : locked ? localize('agentHost.conversationInUse', "Conversation in Use") : localize('agentHost.conversationUnavailable', "Conversation Unavailable"),
			description: checking
				? localize('agentHost.checkingConversation', "Checking whether this conversation is available…")
				: locked ? localize('agentHost.codexWriterLockRetry', "{0} Select Retry to continue in VS Code.", codexWriterLockMessage()) : localize('agentHost.prepareChatFailed', "Couldn't prepare this conversation. Select Retry to try again. {0}", error?.message ?? ''),
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
		super.dispose();
		this._notifications.deleteNotification(this._notificationId);
	}
}
