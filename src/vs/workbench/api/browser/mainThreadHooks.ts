/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadHooksShape } from '../common/extHost.protocol.js';
import { HookResultKind, IHookResult, IHooksExecutionProxy, IHooksExecutionService } from '../../contrib/chat/common/hooksExecutionService.js';
import { HookTypeValue, IHookCommand } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { CancellationToken } from '../../../base/common/cancellation.js';

@extHostNamedCustomer(MainContext.MainThreadHooks)
export class MainThreadHooks extends Disposable implements MainThreadHooksShape {

	constructor(
		extHostContext: IExtHostContext,
		@IHooksExecutionService private readonly _hooksExecutionService: IHooksExecutionService,
	) {
		super();
		const extHostProxy = extHostContext.getProxy(ExtHostContext.ExtHostHooks);

		const proxy: IHooksExecutionProxy = {
			runHookCommand: async (hookCommand: IHookCommand, input: unknown, token: CancellationToken): Promise<IHookResult> => {
				const result = await extHostProxy.$runHookCommand(hookCommand, input, token);
				return {
					kind: result.kind as HookResultKind,
					result: result.result
				};
			}
		};

		this._hooksExecutionService.setProxy(proxy);
	}

	async $executeHook(hookType: string, sessionResource: UriComponents, input: unknown, token: CancellationToken): Promise<IHookResult[]> {
		const uri = URI.revive(sessionResource);
		return this._hooksExecutionService.executeHook(hookType as HookTypeValue, uri, { input, token });
	}
}
