/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IChatAgentService, ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminal/browser/terminalContribExports';


export class TerminalChatEnabler {

	static Id = 'terminalChat.enabler';

	private readonly _ctxHasProvider: IContextKey<boolean>;

	private readonly _store = new DisposableStore();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService
	) {
		this._ctxHasProvider = TerminalChatContextKeys.hasChatAgent.bindTo(contextKeyService);
		this._store.add(chatAgentService.onDidChangeAgents(() => {
			const hasTerminalAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Terminal));
			this._ctxHasProvider.set(hasTerminalAgent);
		}));
	}

	dispose() {
		this._ctxHasProvider.reset();
		this._store.dispose();
	}
}
