/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { readSessionPromptCacheState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

const PROMPT_CACHE_EXPIRATION_NOTIFICATION_EXPERIMENT = 'copilotchat.promptCacheExpirationNotification';
const PROMPT_CACHE_EXPIRATION_GRACE_PERIOD_MS = 10 * 60 * 1000;
const PROMPT_CACHE_EXPIRATION_DISABLED_STORAGE_KEY = 'chat.promptCacheExpirationNotification.disabled';
const DISABLE_PROMPT_CACHE_EXPIRATION_NOTIFICATION_COMMAND = 'workbench.action.chat.disablePromptCacheExpirationNotification';
const PROMPT_CACHE_EXPIRATION_LEARN_MORE_URL = 'https://code.visualstudio.com/docs/agents/agent-troubleshooting/cache-explorer#_why-prompt-caching-matters';

export class AgentHostPromptCacheNotification extends Disposable {
	private readonly _trackedSessions = this._register(new DisposableMap<string>());
	private readonly _cacheExpirations = new ResourceMap<string>();
	private readonly _dismissedExpirations = new ResourceMap<string>();
	private _experimentEnabled = false;

	constructor(
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(DISABLE_PROMPT_CACHE_EXPIRATION_NOTIFICATION_COMMAND, () => {
			this._storageService.store(PROMPT_CACHE_EXPIRATION_DISABLED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
			for (const sessionResource of this._cacheExpirations.keys()) {
				this._notificationService.deleteNotification(this._notificationId(sessionResource));
			}
		}));
		this._register(this._notificationService.onDidDismiss(id => {
			for (const [sessionResource, cacheExpiresAt] of this._cacheExpirations) {
				if (id === this._notificationId(sessionResource)) {
					this._dismissedExpirations.set(sessionResource, cacheExpiresAt);
					break;
				}
			}
		}));

		void assignmentService.getTreatment<boolean>(PROMPT_CACHE_EXPIRATION_NOTIFICATION_EXPERIMENT).then(enabled => {
			this._experimentEnabled = enabled === true;
			for (const sessionResource of this._cacheExpirations.keys()) {
				this._updateNotification(sessionResource);
			}
		}).catch(error => this._logService.warn(`[AgentHostPromptCacheNotification] Failed to resolve experiment: ${error}`));
	}

	trackSession(sessionResource: URI, subscription: IAgentSubscription<SessionState>): IDisposable {
		const key = sessionResource.toString();
		const store = new DisposableStore();
		this._trackedSessions.set(key, store);
		const expirationScheduler = store.add(new RunOnceScheduler(() => this._updateNotification(sessionResource), 0));
		const update = (state: SessionState | Error | undefined) => {
			expirationScheduler.cancel();
			const promptCache = state && !(state instanceof Error) ? readSessionPromptCacheState(state._meta) : undefined;
			if (promptCache) {
				if (this._cacheExpirations.get(sessionResource) !== promptCache.cacheExpiresAt) {
					this._dismissedExpirations.delete(sessionResource);
				}
				this._cacheExpirations.set(sessionResource, promptCache.cacheExpiresAt);
				const expirationTime = Date.parse(promptCache.cacheExpiresAt);
				if (Number.isFinite(expirationTime)) {
					const remainingTime = expirationTime + PROMPT_CACHE_EXPIRATION_GRACE_PERIOD_MS - Date.now();
					if (remainingTime >= 0) {
						expirationScheduler.schedule(remainingTime + 1);
					}
				}
			} else {
				this._cacheExpirations.delete(sessionResource);
				this._dismissedExpirations.delete(sessionResource);
			}
			this._updateNotification(sessionResource);
		};
		store.add(subscription.onDidChange(update));
		update(subscription.value);
		store.add(toDisposable(() => {
			this._cacheExpirations.delete(sessionResource);
			this._dismissedExpirations.delete(sessionResource);
			this._notificationService.deleteNotification(this._notificationId(sessionResource));
		}));
		return toDisposable(() => this._trackedSessions.deleteAndDispose(key));
	}

	private _updateNotification(sessionResource: URI): void {
		const cacheExpiresAt = this._cacheExpirations.get(sessionResource);
		const expirationTime = cacheExpiresAt ? Date.parse(cacheExpiresAt) : Number.NaN;
		const disabled = this._storageService.getBoolean(PROMPT_CACHE_EXPIRATION_DISABLED_STORAGE_KEY, StorageScope.PROFILE, false);
		if (!this._experimentEnabled || disabled || !Number.isFinite(expirationTime) || Date.now() <= expirationTime + PROMPT_CACHE_EXPIRATION_GRACE_PERIOD_MS) {
			this._notificationService.deleteNotification(this._notificationId(sessionResource));
			return;
		}
		if (this._dismissedExpirations.get(sessionResource) === cacheExpiresAt) {
			return;
		}

		this._notificationService.setNotification({
			id: this._notificationId(sessionResource),
			telemetryId: 'copilot.promptCacheExpired',
			severity: ChatInputNotificationSeverity.Info,
			message: localize('promptCacheExpiration.title', "This chat's prompt cache is stale"),
			description: localize('promptCacheExpiration.description', "The next prompt will incur increased cost. Consider starting a new chat."),
			actions: [
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('promptCacheExpiration.dontShowAgain', "Don't Show Again"),
					commandId: DISABLE_PROMPT_CACHE_EXPIRATION_NOTIFICATION_COMMAND,
				},
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('promptCacheExpiration.learnMore', "Learn More"),
					commandId: 'vscode.open',
					commandArgs: [URI.parse(PROMPT_CACHE_EXPIRATION_LEARN_MORE_URL)],
				},
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('promptCacheExpiration.startNewChat', "Start New Chat"),
					commandId: 'workbench.action.chat.newChat',
				},
			],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionResources: [sessionResource],
		});
	}

	private _notificationId(sessionResource: URI): string {
		return `copilot.promptCacheExpired.${sessionResource.toString()}`;
	}
}
