/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BroadcastDataChannel } from '../../../../base/browser/broadcast.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatRequestAcceptedEvent, IChatService } from '../common/chatService/chatService.js';
import { isSessionInProgressStatus } from '../common/chatSessionsService.js';
import { EditorChatUsage } from '../common/editorChatUsage.js';
import { IChatModel } from '../common/model/chatModel.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { IAgentSession } from './agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { localize } from '../../../../nls.js';

type UsageMessage = { kind: 'probe'; id: string; resource: string } | { kind: 'inProgress'; id: string };

export interface IEditorChatUsageChannel extends IDisposable {
	readonly onDidReceiveData: Event<UsageMessage>;
	postData(message: UsageMessage): void;
}

export function hasOtherEditorSessionInProgress(resource: URI, models: Iterable<IChatModel>, sessions: readonly IAgentSession[]): boolean {
	return Array.from(models).some(model => !isEqual(model.sessionResource, resource) && model.requestInProgress.get())
		|| sessions.some(session => !isEqual(session.resource, resource) && isSessionInProgressStatus(session.status));
}

export class EditorChatUsageContribution extends Disposable {
	static readonly ID = 'workbench.contrib.editorChatUsage';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IChatService chatService: IChatService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService logService: ILogService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}

		const hasOtherSession = (resource: URI) =>
			hasOtherEditorSessionInProgress(resource, chatService.chatModels.get(), agentSessionsService.model.sessions);
		this._register(new EditorChatUsageTracker(
			this._register(new BroadcastDataChannel<UsageMessage>('vscode.editorChatUsage')),
			hasOtherSession, chatService.onDidAcceptRequest, storageService, lifecycleService, logService,
		));
	}
}

/** Probes live editor windows instead of persisting running state that can outlive a crashed window. */
export class EditorChatUsageTracker extends Disposable {
	constructor(
		channel: IEditorChatUsageChannel,
		hasOtherSession: (resource: URI) => boolean,
		onDidAcceptRequest: Event<IChatRequestAcceptedEvent>,
		storageService: IStorageService,
		lifecycleService: ILifecycleService,
		logService: ILogService,
	) {
		super();
		const usage = new EditorChatUsage(storageService);
		const probes = new Map<string, () => void>();
		const probeDisposables = this._register(new DisposableMap<string, DisposableStore>());
		const pending = new Set<Promise<void>>();

		this._register(channel.onDidReceiveData(message => {
			if (message.kind === 'probe') {
				if (hasOtherSession(URI.parse(message.resource))) {
					channel.postData({ kind: 'inProgress', id: message.id });
				}
			} else {
				probes.get(message.id)?.();
			}
		}));

		this._register(onDidAcceptRequest(event => {
			const timestamp = Date.now();
			const otherSessionInProgress = hasOtherSession(event.chatSessionResource);
			const otherWindowInProgress = new Promise<boolean>(resolve => {
				const id = generateUuid();
				const store = new DisposableStore();
				probeDisposables.set(id, store);
				store.add(toDisposable(() => {
					probes.delete(id);
					resolve(false);
				}));
				store.add(disposableTimeout(() => probeDisposables.deleteAndDispose(id), 200));
				probes.set(id, () => {
					resolve(true);
					probeDisposables.deleteAndDispose(id);
				});
				channel.postData({ kind: 'probe', id, resource: event.chatSessionResource.toString() });
			});
			const operation = otherWindowInProgress.then(otherWindow =>
				usage.recordSubmission(getChatSessionType(event.chatSessionResource), event.isNewSession, otherSessionInProgress, otherWindow, timestamp)
			).catch(error => logService.error('Failed to record editor chat usage', error));
			pending.add(operation);
			void operation.finally(() => pending.delete(operation));
		}));
		this._register(lifecycleService.onWillShutdown(event => {
			event.join((async () => { await Promise.all(pending); })(), {
				id: EditorChatUsageContribution.ID,
				label: localize('savingEditorChatUsage', "Saving editor chat usage"),
			});
		}));
	}
}
