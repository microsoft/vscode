/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { IPreparedToolInvocation, isToolInvocationContext, IToolInvocation, IToolInvocationContext, IToolResult } from '../../contrib/chat/common/languageModelToolsService.js';
import { ExtHostLanguageModelToolsShape, IMainContext, IToolDataDto, MainContext, MainThreadLanguageModelToolsShape } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';

/**
 * @deprecated
 */
type CompatLanguageModelToolInvocationOptions<T = any> = vscode.LanguageModelToolInvocationOptions<T> & { parameters?: any };

/**
 * @deprecated
 */
type CompactLanguageModelToolInvocationPrepareOptions<T> = vscode.LanguageModelToolInvocationPrepareOptions<T> & { parameters: any };

export class ExtHostLanguageModelTools implements ExtHostLanguageModelToolsShape {
	/** A map of tools that were registered in this EH */
	private readonly _registeredTools = new Map<string, { extension: IExtensionDescription; tool: vscode.LanguageModelTool<Object> }>();
	private readonly _proxy: MainThreadLanguageModelToolsShape;
	private readonly _tokenCountFuncs = new Map</* call ID */string, (text: string, token?: vscode.CancellationToken) => Thenable<number>>();

	/** A map of all known tools, from other EHs or registered in vscode core */
	private readonly _allTools = new Map<string, IToolDataDto>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);

		this._proxy.$getTools().then(tools => {
			for (const tool of tools) {
				this._allTools.set(tool.id, revive(tool));
			}
		});
	}

	async $countTokensForInvocation(callId: string, input: string, token: CancellationToken): Promise<number> {
		const fn = this._tokenCountFuncs.get(callId);
		if (!fn) {
			throw new Error(`Tool invocation call ${callId} not found`);
		}

		return await fn(input, token);
	}

	async invokeTool(toolId: string, options: CompatLanguageModelToolInvocationOptions<any>, token?: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const callId = generateUuid();
		if (options.tokenizationOptions) {
			this._tokenCountFuncs.set(callId, options.tokenizationOptions.countTokens);
		}

		if (options.toolInvocationToken && !isToolInvocationContext(options.toolInvocationToken)) {
			throw new Error(`Invalid tool invocation token`);
		}

		try {
			// Making the round trip here because not all tools were necessarily registered in this EH
			const result = await this._proxy.$invokeTool({
				toolId,
				callId,
				parameters: options.input ?? options.parameters,
				tokenBudget: options.tokenizationOptions?.tokenBudget,
				context: options.toolInvocationToken as IToolInvocationContext | undefined,
			}, token);
			return typeConvert.LanguageModelToolResult.to(result);
		} finally {
			this._tokenCountFuncs.delete(callId);
		}
	}

	$onDidChangeTools(tools: IToolDataDto[]): void {
		this._allTools.clear();
		for (const tool of tools) {
			this._allTools.set(tool.id, tool);
		}
	}

	get tools(): vscode.LanguageModelToolInformation[] {
		return Array.from(this._allTools.values())
			.map(tool => typeConvert.LanguageModelToolDescription.to(tool));
	}

	async $invokeTool(dto: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
		const item = this._registeredTools.get(dto.toolId);
		if (!item) {
			throw new Error(`Unknown tool ${dto.toolId}`);
		}

		const options: CompatLanguageModelToolInvocationOptions<Object> = { input: dto.parameters, parameters: dto.parameters, toolInvocationToken: dto.context as vscode.ChatParticipantToolToken | undefined };
		if (dto.tokenBudget !== undefined) {
			options.tokenizationOptions = {
				tokenBudget: dto.tokenBudget,
				countTokens: this._tokenCountFuncs.get(dto.callId) || ((value, token = CancellationToken.None) =>
					this._proxy.$countTokensForInvocation(dto.callId, value, token))
			};
		}

		const extensionResult = await raceCancellation(Promise.resolve(item.tool.invoke(options, token)), token);
		if (!extensionResult) {
			throw new CancellationError();
		}

		return typeConvert.LanguageModelToolResult.from(extensionResult);
	}

	async $prepareToolInvocation(toolId: string, parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const item = this._registeredTools.get(toolId);
		if (!item) {
			throw new Error(`Unknown tool ${toolId}`);
		}

		if (!item.tool.prepareInvocation) {
			return undefined;
		}

		const options: CompactLanguageModelToolInvocationPrepareOptions<any> = { parameters, input: parameters };
		const result = await item.tool.prepareInvocation(options, token);
		if (!result) {
			return undefined;
		}

		return {
			confirmationMessages: result.confirmationMessages ? {
				title: result.confirmationMessages.title,
				message: typeof result.confirmationMessages.message === 'string' ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
			} : undefined,
			invocationMessage: result.invocationMessage
		};
	}

	registerTool(extension: IExtensionDescription, id: string, tool: vscode.LanguageModelTool<any>): IDisposable {
		this._registeredTools.set(id, { extension, tool });
		this._proxy.$registerTool(id);

		return toDisposable(() => {
			this._registeredTools.delete(id);
			this._proxy.$unregisterTool(id);
		});
	}
}
