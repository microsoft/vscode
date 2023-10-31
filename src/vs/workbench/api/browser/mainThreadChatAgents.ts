/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ExtHostChatAgentsShape, ExtHostContext, MainContext, MainThreadChatAgentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatAgentMetadata, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatSlashFragment } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';


@extHostNamedCustomer(MainContext.MainThreadChatAgents)
export class MainThreadChatAgents implements MainThreadChatAgentsShape {

	private readonly _agents = new DisposableMap<number>;
	private readonly _pendingProgress = new Map<number, IProgress<IChatSlashFragment>>();
	private readonly _proxy: ExtHostChatAgentsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents);
	}

	$unregisterAgent(handle: number): void {
		this._agents.deleteAndDispose(handle);
	}

	dispose(): void {
		this._agents.clearAndDisposeAll();
	}

	$registerAgent(handle: number, name: string, metadata: IChatAgentMetadata): void {
		if (!this._chatAgentService.hasAgent(name)) {
			// dynamic!
			this._chatAgentService.registerAgentData({
				id: name,
				metadata: revive(metadata)
			});
		}

		const d = this._chatAgentService.registerAgentCallback(name, async (prompt, progress, history, token) => {
			const requestId = Math.random();
			this._pendingProgress.set(requestId, progress);
			try {
				return await this._proxy.$invokeAgent(handle, requestId, prompt, { history }, token);
			} finally {
				this._pendingProgress.delete(requestId);
			}
		});
		this._agents.set(handle, d);
	}

	async $handleProgressChunk(requestId: number, chunk: IChatSlashFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(revive(chunk));
	}

	$unregisterCommand(handle: number): void {
		this._agents.deleteAndDispose(handle);
	}
}
