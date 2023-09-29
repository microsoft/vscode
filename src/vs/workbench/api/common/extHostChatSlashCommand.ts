/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatSlashCommandsShape, IMainContext, MainContext, MainThreadChatSlashCommandsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostChatProvider } from 'vs/workbench/api/common/extHostChatProvider';
import { ChatMessageRole } from 'vs/workbench/api/common/extHostTypes';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';
import { Progress } from 'vs/platform/progress/common/progress';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { DeferredPromise, raceCancellation } from 'vs/base/common/async';

export class ExtHostChatSlashCommands implements ExtHostChatSlashCommandsShape {

	private static _idPool = 0;

	private readonly _commands = new Map<number, { extension: ExtensionIdentifier; command: vscode.SlashCommand }>();
	private readonly _proxy: MainThreadChatSlashCommandsShape;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostChatProvider: ExtHostChatProvider,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatSlashCommands);
	}

	registerCommand(extension: ExtensionIdentifier, name: string, command: vscode.SlashCommand, metadata: vscode.SlashCommandMetadata): IDisposable {

		const handle = ExtHostChatSlashCommands._idPool++;
		this._commands.set(handle, { extension, command });
		this._proxy.$registerCommand(handle, name, metadata.description);

		return toDisposable(() => {
			this._proxy.$unregisterCommand(handle);
			this._commands.delete(handle);
		});
	}

	async $executeCommand(handle: number, requestId: number, prompt: string, context: { history: IChatMessage[] }, token: CancellationToken): Promise<any> {
		const data = this._commands.get(handle);
		if (!data) {
			this._logService.warn(`[CHAT](${handle}) CANNOT execute command because the command is not registered`);
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
		setTimeout(() => commandExecution.complete(), 10 * 1000);
		this._extHostChatProvider.allowListExtensionWhile(data.extension, commandExecution.p);

		const task = data.command(
			{ role: ChatMessageRole.User, content: prompt },
			{ history: context.history.map(typeConvert.ChatMessage.to) },
			new Progress<vscode.SlashResponse>(p => {
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
