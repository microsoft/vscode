/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostLanguageModelToolsShape, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ILanguageModelToolsService, IToolData, IToolInvokation, IToolPromptContext, IToolTsxPromptPiece } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadLanguageModelTools)
export class MainThreadLanguageModelTools extends Disposable implements MainThreadLanguageModelToolsShape {

	private readonly _proxy: ExtHostLanguageModelToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageModelTools);

		this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$acceptToolDelta(e)));
	}

	async $getTools(): Promise<IToolData[]> {
		return Array.from(this._languageModelToolsService.getTools());
	}

	$invokeTool(name: string, parameters: any, token: CancellationToken): Promise<IToolInvokation> {
		return this._languageModelToolsService.invokeTool(name, parameters, token);
	}

	$freeToolInvokation(invokationId: string): void {
		this._languageModelToolsService.freeToolInvokation(invokationId);
	}

	$invokeToolRender(callerId: string, invokationId: string, objectIdOrContentType: number | string, context: IToolPromptContext, token: CancellationToken | undefined): Promise<IToolTsxPromptPiece> {
		return this._languageModelToolsService.invokeToolRender(
			callerId,
			invokationId,
			objectIdOrContentType,
			context,
			token,
			(input, token) => this._proxy.$invokeToolCountTokens(callerId, input, token)
		);
	}

	$invokeToolCountTokens(callerId: string, input: string, token: CancellationToken | undefined): Promise<number> {
		return this._languageModelToolsService.invokeToolCountTokens(callerId, input, token);
	}

	$registerTool(name: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			name,
			{
				invoke: async (parameters, token) => {
					return await this._proxy.$invokeTool(name, parameters, token);
				},
				free: (invokationId) => {
					this._proxy.$freeToolInvokation(invokationId);
				},
				render: (callerId, invokationId, objectIdOrContentType, context, token) => {
					return this._proxy.$invokeToolRender(callerId, invokationId, objectIdOrContentType, context, token);
				},
			});
		this._tools.set(name, disposable);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
