/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { Progress } from 'vs/platform/progress/common/progress';
import { ExtHostChatAgentsShape, IMainContext, MainContext, MainThreadChatAgentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostChatProvider } from 'vs/workbench/api/common/extHostChatProvider';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { ChatMessageRole } from 'vs/workbench/api/common/extHostTypes';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import type * as vscode from 'vscode';

export class ExtHostChatAgents implements ExtHostChatAgentsShape {

	private static _idPool = 0;

	private readonly _agents = new Map<number, { extension: ExtensionIdentifier; agent: vscode.ChatAgent }>();
	private readonly _proxy: MainThreadChatAgentsShape;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostChatProvider: ExtHostChatProvider,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents);
	}

	registerAgent(extension: ExtensionIdentifier, name: string, agent: vscode.ChatAgent, metadata: vscode.ChatAgentMetadata): IDisposable {
		const handle = ExtHostChatAgents._idPool++;
		this._agents.set(handle, { extension, agent });
		this._proxy.$registerAgent(handle, name, metadata);

		return toDisposable(() => {
			this._proxy.$unregisterAgent(handle);
			this._agents.delete(handle);
		});
	}

	async $invokeAgent(handle: number, requestId: number, prompt: string, context: { history: IChatMessage[] }, token: CancellationToken): Promise<any> {
		const data = this._agents.get(handle);
		if (!data) {
			this._logService.warn(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
			return;
		}

		let done = false;
		function throwIfDone() {
			if (done) {
				throw new Error('Only valid while executing the command');
			}
		}

		const commandExecution = new DeferredPromise<void>();
		token.onCancellationRequested(() => commandExecution.complete());
		setTimeout(() => commandExecution.complete(), 3 * 1000);
		this._extHostChatProvider.allowListExtensionWhile(data.extension, commandExecution.p);

		const task = data.agent(
			{ role: ChatMessageRole.User, content: prompt },
			{ history: context.history.map(typeConvert.ChatMessage.to) },
			new Progress<vscode.ChatAgentResponse>(p => {
				throwIfDone();
				this._proxy.$handleProgressChunk(requestId, { content: isInteractiveProgressFileTree(p.message) ? p.message : p.message.value });
			}),
			token
		);

		try {
			return await raceCancellation(Promise.resolve(task).then((v) => {
				if (v && 'followUp' in v) {
					const convertedFollowup = v?.followUp?.map(f => typeConvert.ChatFollowup.from(f));
					return { followUp: convertedFollowup };
				}
				return undefined;
			}), token);
		} finally {
			done = true;
			commandExecution.complete();
		}
	}
}

function isInteractiveProgressFileTree(thing: unknown): thing is vscode.InteractiveProgressFileTree {
	return !!thing && typeof thing === 'object' && 'treeData' in thing;
}
