/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { ExtHostChatAgentsShape2, ExtHostContext, IChatProgressDto, IExtensionChatAgentMetadata, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatFollowup, IChatProgress, IChatService, IChatTreeData } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

type AgentData = {
	dispose: () => void;
	name: string;
	hasSlashCommands?: boolean;
	hasFollowups?: boolean;
};

@extHostNamedCustomer(MainContext.MainThreadChatAgents2)
export class MainThreadChatAgents2 extends Disposable implements MainThreadChatAgentsShape2 {

	private readonly _agents = this._register(new DisposableMap<number, AgentData>());
	private readonly _pendingProgress = new Map<string, (part: IChatProgress) => void>();
	private readonly _proxy: ExtHostChatAgentsShape2;

	private _responsePartHandlePool = 0;
	private readonly _activeResponsePartPromises = new Map<string, DeferredPromise<string | IMarkdownString | IChatTreeData>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);

		this._register(this._chatService.onDidDisposeSession(e => {
			this._proxy.$releaseSession(e.sessionId);
		}));
		this._register(this._chatService.onDidPerformUserAction(e => {
			if (typeof e.agentId === 'string') {
				for (const [handle, agent] of this._agents) {
					if (agent.name === e.agentId) {
						if (e.action.kind === 'vote') {
							this._proxy.$acceptFeedback(handle, e.sessionId, e.requestId, e.action.direction);
						} else {
							this._proxy.$acceptAction(handle, e.sessionId, e.requestId, e);
						}
						break;
					}
				}
			}
		}));
	}

	$unregisterAgent(handle: number): void {
		this._agents.deleteAndDispose(handle);
	}

	$registerAgent(handle: number, name: string, metadata: IExtensionChatAgentMetadata): void {
		const d = this._chatAgentService.registerAgent({
			id: name,
			metadata: revive(metadata),
			invoke: async (request, progress, history, token) => {
				this._pendingProgress.set(request.requestId, progress);
				try {
					return await this._proxy.$invokeAgent(handle, request.sessionId, request.requestId, request, { history }, token) ?? {};
				} finally {
					this._pendingProgress.delete(request.requestId);
				}
			},
			provideFollowups: async (sessionId, token): Promise<IChatFollowup[]> => {
				if (!this._agents.get(handle)?.hasFollowups) {
					return [];
				}

				return this._proxy.$provideFollowups(handle, sessionId, token);
			},
			provideSlashCommands: async (token) => {
				if (!this._agents.get(handle)?.hasSlashCommands) {
					return []; // save an IPC call
				}
				return this._proxy.$provideSlashCommands(handle, token);
			}
		});
		this._agents.set(handle, {
			name,
			dispose: d.dispose,
			hasSlashCommands: metadata.hasSlashCommands,
			hasFollowups: metadata.hasFollowups
		});
	}

	$updateAgent(handle: number, metadataUpdate: IExtensionChatAgentMetadata): void {
		const data = this._agents.get(handle);
		if (!data) {
			throw new Error(`No agent with handle ${handle} registered`);
		}
		data.hasSlashCommands = metadataUpdate.hasSlashCommands;
		data.hasFollowups = metadataUpdate.hasFollowups;
		this._chatAgentService.updateAgent(data.name, revive(metadataUpdate));
	}

	async $handleProgressChunk(requestId: string, progress: IChatProgressDto, responsePartHandle?: number): Promise<number | void> {
		if (progress.kind === 'asyncContent') {
			const handle = ++this._responsePartHandlePool;
			const responsePartId = `${requestId}_${handle}`;
			const deferredContentPromise = new DeferredPromise<string | IMarkdownString | IChatTreeData>();
			this._activeResponsePartPromises.set(responsePartId, deferredContentPromise);
			this._pendingProgress.get(requestId)?.({ ...progress, resolvedContent: deferredContentPromise.p });
			return handle;
		} else if (typeof responsePartHandle === 'number') {
			// Complete an existing deferred promise with resolved content
			const responsePartId = `${requestId}_${responsePartHandle}`;
			const deferredContentPromise = this._activeResponsePartPromises.get(responsePartId);
			if (deferredContentPromise && progress.kind === 'treeData') {
				const withRevivedUris = revive<IChatTreeData>(progress);
				deferredContentPromise.complete(withRevivedUris);
				this._activeResponsePartPromises.delete(responsePartId);
			} else if (deferredContentPromise && progress.kind === 'content') {
				deferredContentPromise.complete(progress.content);
				this._activeResponsePartPromises.delete(responsePartId);
			}
			return responsePartHandle;
		}

		// No need to support standalone tree data that's not attached to a placeholder in API
		if (progress.kind === 'treeData') {
			return;
		}

		const revivedProgress = revive(progress);
		this._pendingProgress.get(requestId)?.(revivedProgress as IChatProgress);
	}
}
