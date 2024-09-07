/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IChatAgentService, ChatAgentLocation } from '../../../chat/common/chatAgents.js';
import { TerminalChatContextKeys } from '../../../terminal/terminalContribExports.js';


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
