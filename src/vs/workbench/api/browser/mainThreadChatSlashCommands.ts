/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ExtHostChatSlashCommandsShape, ExtHostContext, MainContext, MainThreadChatSlashCommandsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatSlashCommandService, IChatSlashFragment } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';


@extHostNamedCustomer(MainContext.MainThreadChatSlashCommands)
export class MainThreadChatSlashCommands implements MainThreadChatSlashCommandsShape {

	private readonly _commands = new DisposableMap<number>;
	private readonly _pendingProgress = new Map<number, IProgress<IChatSlashFragment>>();
	private readonly _proxy: ExtHostChatSlashCommandsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IChatSlashCommandService private readonly _chatSlashCommandService: IChatSlashCommandService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatSlashCommands);
	}

	dispose(): void {
		this._commands.clearAndDisposeAll();
	}

	$registerCommand(handle: number, name: string, detail: string): void {

		if (!this._chatSlashCommandService.hasCommand(name)) {
			// dynamic slash commands!
			this._chatSlashCommandService.registerSlashData({
				command: name,
				detail
			});
		}

		const d = this._chatSlashCommandService.registerSlashCallback(name, async (prompt, progress, history, token) => {
			const requestId = Math.random();
			this._pendingProgress.set(requestId, progress);
			try {
				return await this._proxy.$executeCommand(handle, requestId, prompt, { history }, token);
			} finally {
				this._pendingProgress.delete(requestId);
			}
		});
		this._commands.set(handle, d);
	}

	async $handleProgressChunk(requestId: number, chunk: IChatSlashFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(revive(chunk));
	}

	$unregisterCommand(handle: number): void {
		this._commands.deleteAndDispose(handle);
	}
}
