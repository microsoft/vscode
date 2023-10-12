/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ExtHostChatAgentsShape2, ExtHostContext, IChatResponseProgressDto, IExtensionChatAgentMetadata, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';


type AgentData = {
	dispose: () => void;
	name: string;
	hasSlashCommands?: boolean;
	hasFollowups?: boolean;
};

@extHostNamedCustomer(MainContext.MainThreadChatAgents2)
export class MainThreadChatAgents implements MainThreadChatAgentsShape2, IDisposable {

	private readonly _agents = new DisposableMap<number, AgentData>;
	private readonly _pendingProgress = new Map<number, IProgress<IChatProgress>>();
	private readonly _proxy: ExtHostChatAgentsShape2;

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);
	}

	$unregisterAgent(handle: number): void {
		this._agents.deleteAndDispose(handle);
	}

	dispose(): void {
		this._agents.clearAndDisposeAll();
	}

	$registerAgent(handle: number, name: string, metadata: IExtensionChatAgentMetadata): void {
		const d = this._chatAgentService.registerAgent({
			id: name,
			metadata: revive(metadata),
			invoke: async (request, progress, history, token) => {
				const requestId = Math.random(); // Make this a guid
				this._pendingProgress.set(requestId, progress);
				try {
					return await this._proxy.$invokeAgent(handle, requestId, request, { history }, token) ?? {};
				} finally {
					this._pendingProgress.delete(requestId);
				}
			},
			provideSlashCommands: async (token) => {
				if (!this._agents.get(handle)?.hasSlashCommands) {
					return []; // safe an IPC call
				}
				return this._proxy.$provideSlashCommands(handle, token);
			}
		});
		this._agents.set(handle, { name, dispose: d.dispose, hasSlashCommands: metadata.hasSlashCommands });
	}

	$updateAgent(handle: number, metadataUpdate: IExtensionChatAgentMetadata): void {
		const data = this._agents.get(handle);
		if (!data) {
			throw new Error(`No agent with handle ${handle} registered`);
		}
		data.hasSlashCommands = metadataUpdate.hasSlashCommands;
		this._chatAgentService.updateAgent(data.name, revive(metadataUpdate));
	}

	async $handleProgressChunk(requestId: number, chunk: IChatResponseProgressDto): Promise<void> {
		// TODO copy/move $acceptResponseProgress from MainThreadChat
		this._pendingProgress.get(requestId)?.report(revive(chunk) as any);
	}
}
