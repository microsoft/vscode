/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult } from '../../contrib/chat/common/languageModelToolsService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostLanguageModelToolsShape, MainContext, MainThreadLanguageModelToolsShape } from '../common/extHost.protocol.js';

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

		this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$onDidChangeTools([...this._languageModelToolsService.getTools()])));
	}

	async $getTools(): Promise<IToolData[]> {
		return Array.from(this._languageModelToolsService.getTools());
	}

	async $invokeTool(dto: IToolInvocation, token?: CancellationToken): Promise<IToolResult> {
		return await this._languageModelToolsService.invokeTool(
			dto,
			(input, token) => this._proxy.$countTokensForInvocation(dto.callId, input, token),
			token ?? CancellationToken.None,
		);
	}

	$countTokensForInvocation(callId: string, input: string, token: CancellationToken): Promise<number> {
		const fn = this._countTokenCallbacks.get(callId);
		if (!fn) {
			throw new Error(`Tool invocation call ${callId} not found`);
		}

		return fn(input, token);
	}

	$registerTool(id: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			id,
			{
				invoke: async (dto, countTokens, token) => {
					try {
						this._countTokenCallbacks.set(dto.callId, countTokens);
						return await this._proxy.$invokeTool(dto, token);
					} finally {
						this._countTokenCallbacks.delete(dto.callId);
					}
				},
				prepareToolInvocation: (parameters, token) => this._proxy.$prepareToolInvocation(id, parameters, token),
			});
		this._tools.set(id, disposable);
	}

	$unregisterTool(name: string): void {
		this._tools.deleteAndDispose(name);
	}
}
