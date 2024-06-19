/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostLanguageModelToolsShape, ExtHostContext, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IToolData, ILanguageModelToolsService } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
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

	$invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string> {
		return this._languageModelToolsService.invokeTool(name, parameters, token);
	}

	$registerTool(id: string): void {
		const disposable = this._languageModelToolsService.registerToolImplementation(
			id,
			{
				invoke: async (parameters, token) => {
					return await this._proxy.$invokeTool(id, parameters, token);
				},
			});
		this._tools.set(id, disposable);
	}

	$unregisterTool(id: string): void {
		this._tools.deleteAndDispose(id);
	}
}
