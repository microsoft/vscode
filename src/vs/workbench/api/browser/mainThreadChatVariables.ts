/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostChatVariablesShape, ExtHostContext, MainContext, MainThreadChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatVariableData, IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatVariables)
export class MainThreadChatSlashCommands implements MainThreadChatVariablesShape {

	private readonly _proxy: ExtHostChatVariablesShape;
	private readonly _variables = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatVariablesService private readonly _chatVariablesService: IChatVariablesService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatVariables);
	}

	dispose(): void {
		this._variables.clearAndDisposeAll();
	}

	$registerVariable(handle: number, data: IChatVariableData): void {
		const registration = this._chatVariablesService.registerVariable(data, (messageText, _arg, _model, token) => {
			return this._proxy.$resolveVariable(handle, messageText, token);
		});
		this._variables.set(handle, registration);
	}

	$unregisterVariable(handle: number): void {
		this._variables.deleteAndDispose(handle);
	}
}
