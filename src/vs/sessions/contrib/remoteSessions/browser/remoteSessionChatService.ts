/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableSet, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';

export interface IRemoteSessionChatReference extends IDisposable {
	releaseWhenIdle(): void;
}

export const IRemoteSessionChatService = createDecorator<IRemoteSessionChatService>('remoteSessionChatService');

export interface IRemoteSessionChatService {
	readonly _serviceBrand: undefined;
	acquire(resource: URI, token: CancellationToken, claimClientTools?: boolean): Promise<IRemoteSessionChatReference>;
}

/** Keeps background chat progress and client-tool approvals alive until queued work finishes. */
export class RemoteSessionChatService extends Disposable implements IRemoteSessionChatService {
	declare readonly _serviceBrand: undefined;

	private readonly references = this._register(new DisposableSet<DisposableStore>());

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
	) {
		super();
	}

	async acquire(resource: URI, token: CancellationToken, claimClientTools = false): Promise<IRemoteSessionChatReference> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		this.references.add(store);
		const release = () => this.references.deleteAndDispose(store);
		try {
			const reference = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'RemoteSessionChatService');
			if (!reference) {
				throw new Error(localize('remoteSessionChat.unavailable', "Unable to load the background chat for remote session tools."));
			}
			store.add(reference);
			if (store.isDisposed || token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (claimClientTools) {
				const session = await this.chatSessionsService.getOrCreateChatSession(resource, token);
				if (!session.prepareForClientTools) {
					throw new Error(localize('remoteSessionChat.unsupported', "This chat cannot prepare client tools for background messages."));
				}
				await session.prepareForClientTools(token);
			}
			if (store.isDisposed || token.isCancellationRequested) {
				throw new CancellationError();
			}
			const model = reference.object;
			const canRelease = observableValue('remoteSessionChatCanRelease', false);
			const pendingChanged = observableSignalFromEvent(this, model.onDidChangePendingRequests);
			store.add(model.onDidDispose(release));
			store.add(this.connectionsService.onDidChangeConnections(() => {
				if (!this.connectionsService.resolveSessionResource(resource.with({ fragment: '' }))) {
					release();
				}
			}));
			store.add(autorun(reader => {
				if (!canRelease.read(reader)) {
					return;
				}
				pendingChanged.read(reader);
				if (!model.hasActiveRequest.read(reader) && model.getPendingRequests().length === 0) {
					release();
				}
			}));
			return {
				dispose: release,
				releaseWhenIdle: () => canRelease.set(true, undefined),
			};
		} catch (error) {
			release();
			throw error;
		}
	}
}
