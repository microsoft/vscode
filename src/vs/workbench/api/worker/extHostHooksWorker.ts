/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { HookTypeValue } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { isToolInvocationContext, IToolInvocationContext } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { IHookCommandDto, MainContext, MainThreadHooksShape } from '../common/extHost.protocol.js';
import { IChatHookExecutionOptions, IExtHostHooks } from '../common/extHostHooks.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import * as typeConverters from '../common/extHostTypeConverters.js';
import { IHookResult } from '../../contrib/chat/common/hooks/hooksTypes.js';
import { HookCommandResultKind, IHookCommandResult } from '../../contrib/chat/common/hooks/hooksCommandTypes.js';

export class WorkerExtHostHooks implements IExtHostHooks {

	private readonly _mainThreadProxy: MainThreadHooksShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService
	) {
		this._mainThreadProxy = extHostRpc.getProxy(MainContext.MainThreadHooks);
	}

	async executeHook(hookType: HookTypeValue, options: IChatHookExecutionOptions, token?: CancellationToken): Promise<vscode.ChatHookResult[]> {
		if (!options.toolInvocationToken || !isToolInvocationContext(options.toolInvocationToken)) {
			this._logService.error('[WorkerExtHostHooks] Invalid or missing tool invocation token');
			return [];
		}

		const context = options.toolInvocationToken as IToolInvocationContext;

		const results = await this._mainThreadProxy.$executeHook(hookType, context.sessionResource, options.input, token ?? CancellationToken.None);
		return results.map(r => typeConverters.ChatHookResult.to(r as IHookResult));
	}

	async $runHookCommand(_hookCommand: IHookCommandDto, _input: unknown, _token: CancellationToken): Promise<IHookCommandResult> {
		this._logService.debug('[WorkerExtHostHooks] Hook commands are not supported in web worker context');

		// Web worker cannot run shell commands - return an error
		return {
			kind: HookCommandResultKind.Error,
			result: 'Hook commands are not supported in web worker context'
		};
	}
}
