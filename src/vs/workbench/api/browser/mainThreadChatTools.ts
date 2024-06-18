/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostChatToolsShape, ExtHostContext, MainContext, MainThreadChatToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatToolData, IChatToolsService } from 'vs/workbench/contrib/chat/common/chatToolsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatTools)
export class MainThreadChatTools extends Disposable implements MainThreadChatToolsShape {

	private readonly _proxy: ExtHostChatToolsShape;
	private readonly _tools = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@IChatToolsService private readonly _chatToolsService: IChatToolsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatTools);

		this._register(this._chatToolsService.onDidChangeTools(e => this._proxy.$acceptToolDelta(e)));
	}

	async $getTools(): Promise<IChatToolData[]> {
		return Array.from(this._chatToolsService.getTools());
	}

	$invokeTool(name: string, parameters: any, token: CancellationToken): Promise<void> {
		return this._chatToolsService.invokeTool(name, parameters, token);
	}

	$registerTool(data: IChatToolData): void {
		const disposable = this._chatToolsService.registerTool({
			...data,
			invoke: async (parameters, token) => {
				return await this._proxy.$invokeTool(data.id, parameters, token);
			},
		});
		this._tools.set(data.id, disposable);
	}

	$unregisterTool(id: string): void {
		this._tools.deleteAndDispose(id);
	}
}
