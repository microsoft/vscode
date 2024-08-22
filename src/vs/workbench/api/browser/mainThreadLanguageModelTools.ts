/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostLanguageModelToolsShape, ExtHostContext, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/languageModels';
import { IToolData, ILanguageModelToolsService, IToolResult, IToolInvokation, CountTokensCallback } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadLanguageModelTools)
export class MainThreadLanguageModelTools extends Disposable implements MainThreadLanguageModelToolsShape {

	private readonly _proxy: ExtHostLanguageModelToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());
	private readonly _countTokenCallbacks = new Map</* call ID */string, CountTokensCallback>();

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

	$invokeTool(dto: IToolInvokation, token: CancellationToken): Promise<IToolResult> {
		return this._languageModelToolsService.invokeTool(
			dto,
			(input, token) => this._proxy.$countTokensForInvokation(dto.callId, input, token),
			token,
		);
	}

	$countTokensForInvokation(callId: string, input: string | IChatMessage, token: CancellationToken): Promise<number> {
		const fn = this._countTokenCallbacks.get(callId);
		if (!fn) {
			throw new Error(`Tool invokation call ${callId} not found`);
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
