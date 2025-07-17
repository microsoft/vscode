/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ChatSessionDto, ExtHostChatSessionContentProvidersShape, IMainContext, MainContext, MainThreadChatSessionContentProvidersShape } from './extHost.protocol.js';
import { CommandsConverter } from './extHostCommands.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';

export class ExtHostChatSessionContentProviders implements ExtHostChatSessionContentProvidersShape {

	private static _providerHandlePool = 0;
	private static _sessionHandlePool = 0;

	private readonly _providers = new Map<number, vscode.ChatSessionContentProvider>();
	private readonly _proxy: MainThreadChatSessionContentProvidersShape;

	constructor(
		mainContext: IMainContext,
		private readonly _commandsConverter: CommandsConverter,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatSessionContentProviders);
	}

	registerChatSessionContentProvider(chatSessionType: string, provider: vscode.ChatSessionContentProvider): vscode.Disposable {
		const handle = ExtHostChatSessionContentProviders._providerHandlePool++;
		this._providers.set(handle, provider);
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionType);
		return toDisposable(() => {
			if (this._providers.delete(handle)) {
				this._proxy.$unregisterChatSessionContentProvider(handle);
			}
		});
	}

	async $provideChatSessionContent(handle: number, id: string, token: CancellationToken): Promise<ChatSessionDto> {
		const provider = this._providers.get(handle);
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const session = await provider.provideChatSessionContent(id, token);

		// TODO: leaked
		const sessionDisposables = new DisposableStore();

		const sessionId = ExtHostChatSessionContentProviders._sessionHandlePool++;
		return {
			id: sessionId + '',
			history: session.history.map(turn => {
				if (turn instanceof extHostTypes.ChatRequestTurn) {
					return { type: 'request', prompt: turn.prompt };
				} else {
					const responseTurn = turn as extHostTypes.ChatResponseTurn;
					const parts = coalesce(responseTurn.response.map(r => typeConvert.ChatResponsePart.from(r, this._commandsConverter, sessionDisposables)));

					return {
						type: 'response',
						parts
					};
				}
			})
		};
	}
}
