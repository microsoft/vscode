/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ChatModel } from '../../contrib/chat/common/chatModel.js';
import { IChatService, IChatTask } from '../../contrib/chat/common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult } from '../../contrib/chat/common/languageModelToolsService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostLanguageModelToolsShape, MainContext, MainThreadLanguageModelToolsShape } from '../common/extHost.protocol.js';
import { MainThreadChatTask } from './mainThreadChatAgents2.js';

@extHostNamedCustomer(MainContext.MainThreadLanguageModelTools)
export class MainThreadLanguageModelTools extends Disposable implements MainThreadLanguageModelToolsShape {

	private readonly _proxy: ExtHostLanguageModelToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());
	private readonly _countTokenCallbacks = new Map</* call ID */string, CountTokensCallback>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageModelTools);

		this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$onDidChangeTools([...this._languageModelToolsService.getTools()])));
	}

	async $getTools(): Promise<IToolData[]> {
		return Array.from(this._languageModelToolsService.getTools());
	}

	async $invokeTool(dto: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
		// Shortcut to write to the model directly here, but could call all the way back to use the real stream.
		// TODO move this to the tools service?
		let task: IChatTask | undefined;
		if (dto.context) {
			const model = this._chatService.getSession(dto.context?.sessionId) as ChatModel;
			const request = model.getRequests().at(-1)!;
			const tool = this._languageModelToolsService.getTool(dto.toolId);
			task = new MainThreadChatTask(new MarkdownString(`Using ${tool?.displayName ?? dto.toolId}`));
			model.acceptResponseProgress(request, task);
		}

		try {
			return await this._languageModelToolsService.invokeTool(
				dto,
				(input, token) => this._proxy.$countTokensForInvocation(dto.callId, input, token),
				token,
			);
		} finally {
			task?.complete();
		}
	}

	$countTokensForInvocation(callId: string, input: string, token: CancellationToken): Promise<number> {
		const fn = this._countTokenCallbacks.get(callId);
		if (!fn) {
			throw new Error(`Tool invocation call ${callId} not found`);
		}

		return fn(input, token);
	}

	$registerTool(name: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			name,
			{
				invoke: async (dto, countTokens, token) => {
					try {
						this._countTokenCallbacks.set(dto.callId, countTokens);
						return await this._proxy.$invokeTool(dto, token);
					} finally {
						this._countTokenCallbacks.delete(dto.callId);
					}
				},
			});
		this._tools.set(name, disposable);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
