/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { MainThreadChatTask } from 'vs/workbench/api/browser/mainThreadChatAgents2';
import { ExtHostContext, ExtHostLanguageModelToolsShape, ILanguageModelToolInvocationContext, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatAgentLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ILanguageModelToolsService, IToolData, IToolResult } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadLanguageModelTools)
export class MainThreadLanguageModelTools extends Disposable implements MainThreadLanguageModelToolsShape {

	private readonly _proxy: ExtHostLanguageModelToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageModelTools);

		this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$acceptToolDelta(e)));
	}

	async $getTools(): Promise<IToolData[]> {
		return Array.from(this._languageModelToolsService.getTools());
	}

	async $invokeTool(name: string, parameters: any, context: ILanguageModelToolInvocationContext, token: CancellationToken): Promise<IToolResult> {
		// Does this participant have access to this tool?
		// if (!this._chatAgentsService.hasPermission(participantId, name)) {

		// Shortcut to write to the model directly here, but could call all the way back to use the real stream
		const agent = this._chatAgentService.getAgent(context.participantId);
		if (!agent) {
			throw new Error('Invalid tool call');
		}

		const model = this._chatService.getSession(context.sessionId) as ChatModel;
		const request = model.getRequests().at(-1)!;
		const onConfirmed = new DeferredPromise<string>();
		model.acceptResponseProgress(request, {
			kind: 'confirmationAwaitable',
			title: localize('toolConfirmationTitle', 'Allow tool call?'),
			message: localize('toolConfirmationMessage', 'Allow {0} to call {1}?', `${chatAgentLeader}${agent.name}`, name),
			buttons: ['Once', 'Always', 'No'],
			confirmed: onConfirmed
		});

		const selection = await onConfirmed.p;
		if (selection === 'No') {
			throw new Error('Disallowed');
		} else {
			const task = new MainThreadChatTask(new MarkdownString('Calling tool ' + name));
			model.acceptResponseProgress(request, task);
			try {
				return await this._languageModelToolsService.invokeTool(name, parameters, token);
			} finally {
				task.complete();
			}
		}
		// }
	}

	$registerTool(name: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			name,
			{
				invoke: async (parameters, token) => {
					// Store somewhere
					// context.getPermission
					return await this._proxy.$invokeTool(name, parameters, token);
				},
			});
		this._tools.set(name, disposable);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
