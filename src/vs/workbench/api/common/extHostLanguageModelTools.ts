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
import { ExtensionEditToolId, InternalEditToolId } from '../../contrib/chat/common/tools/editFileTool.js';
import { InternalFetchWebPageToolId } from '../../contrib/chat/common/tools/tools.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostLanguageModelToolsShape, IMainContext, IToolDataDto, MainContext, MainThreadLanguageModelToolsShape } from './extHost.protocol.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import * as typeConvert from './extHostTypeConverters.js';
import { SearchExtensionsToolId } from '../../contrib/extensions/common/searchExtensionsTool.js';

export class ExtHostLanguageModelTools implements ExtHostLanguageModelToolsShape {
	/** A map of tools that were registered in this EH */
	private readonly _registeredTools = new Map<string, { extension: IExtensionDescription; tool: vscode.LanguageModelTool<Object> }>();
	private readonly _proxy: MainThreadLanguageModelToolsShape;
	private readonly _tokenCountFuncs = new Map</* call ID */string, (text: string, token?: vscode.CancellationToken) => Thenable<number>>();

	/** A map of all known tools, from other EHs or registered in vscode core */
	private readonly _allTools = new Map<string, IToolDataDto>();

	constructor(
		mainContext: IMainContext,
		private readonly _languageModels: ExtHostLanguageModels,
	) {
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

	async invokeTool(extension: IExtensionDescription, toolId: string, options: vscode.LanguageModelToolInvocationOptions<any>, token?: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const callId = generateUuid();
		if (options.tokenizationOptions) {
			this._tokenCountFuncs.set(callId, options.tokenizationOptions.countTokens);
		}

		try {
			if (options.toolInvocationToken && !isToolInvocationContext(options.toolInvocationToken)) {
				throw new Error(`Invalid tool invocation token`);
			}

			if ((toolId === InternalEditToolId || toolId === ExtensionEditToolId) && !isProposedApiEnabled(extension, 'chatParticipantPrivate')) {
				throw new Error(`Invalid tool: ${toolId}`);
			}

			// Making the round trip here because not all tools were necessarily registered in this EH
			const result = await this._proxy.$invokeTool({
				toolId,
				callId,
				parameters: options.input,
				tokenBudget: options.tokenizationOptions?.tokenBudget,
				context: options.toolInvocationToken as IToolInvocationContext | undefined,
				chatRequestId: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.chatRequestId : undefined,
				chatInteractionId: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.chatInteractionId : undefined,
			}, token);
			return typeConvert.LanguageModelToolResult.to(revive(result));
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

	getTools(extension: IExtensionDescription): vscode.LanguageModelToolInformation[] {
		return Array.from(this._allTools.values())
			.map(tool => typeConvert.LanguageModelToolDescription.to(tool))
			.filter(tool => {
				switch (tool.name) {
					case InternalEditToolId:
					case ExtensionEditToolId:
					case InternalFetchWebPageToolId:
					case SearchExtensionsToolId:
						return isProposedApiEnabled(extension, 'chatParticipantPrivate');
					default:
						return true;
				}
			});
	}

	async $invokeTool(dto: IToolInvocation, token: CancellationToken): Promise<Dto<IToolResult>> {
		const item = this._registeredTools.get(dto.toolId);
		if (!item) {
			throw new Error(`Unknown tool ${dto.toolId}`);
		}

		const options: vscode.LanguageModelToolInvocationOptions<Object> = {
			input: dto.parameters,
			toolInvocationToken: dto.context as vscode.ChatParticipantToolToken | undefined,
		};
		if (isProposedApiEnabled(item.extension, 'chatParticipantPrivate')) {
			options.chatRequestId = dto.chatRequestId;
			options.chatInteractionId = dto.chatInteractionId;
			options.chatSessionId = dto.context?.sessionId;

			if (dto.toolSpecificData?.kind === 'terminal') {
				options.terminalCommand = dto.toolSpecificData.command;
			}
		}

		if (isProposedApiEnabled(item.extension, 'chatParticipantAdditions') && dto.modelId) {
			options.model = await this.getModel(dto.modelId, item.extension);
		}

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

		return typeConvert.LanguageModelToolResult.from(extensionResult, item.extension);
	}

	private async getModel(modelId: string, extension: IExtensionDescription): Promise<vscode.LanguageModelChat> {
		let model: vscode.LanguageModelChat | undefined;
		if (modelId) {
			model = await this._languageModels.getLanguageModelByIdentifier(extension, modelId);
		}
		if (!model) {
			model = await this._languageModels.getDefaultLanguageModel(extension);
			if (!model) {
				throw new Error('Language model unavailable');
			}
		}

		return model;
	}

	async $prepareToolInvocation(toolId: string, input: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const item = this._registeredTools.get(toolId);
		if (!item) {
			throw new Error(`Unknown tool ${toolId}`);
		}

		const options: vscode.LanguageModelToolInvocationPrepareOptions<any> = { input };
		if (isProposedApiEnabled(item.extension, 'chatParticipantPrivate') && item.tool.prepareInvocation2) {
			const result = await item.tool.prepareInvocation2(options, token);
			if (!result) {
				return undefined;
			}

			return {
				confirmationMessages: result.confirmationMessages ? {
					title: result.confirmationMessages.title,
					message: typeof result.confirmationMessages.message === 'string' ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
				} : undefined,
				toolSpecificData: {
					kind: 'terminal',
					language: result.language,
					command: result.command,
				}
			};
		} else if (item.tool.prepareInvocation) {
			const result = await item.tool.prepareInvocation(options, token);
			if (!result) {
				return undefined;
			}

			if (result.pastTenseMessage || result.presentation) {
				checkProposedApiEnabled(item.extension, 'chatParticipantPrivate');
			}

			return {
				confirmationMessages: result.confirmationMessages ? {
					title: result.confirmationMessages.title,
					message: typeof result.confirmationMessages.message === 'string' ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
				} : undefined,
				invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage),
				pastTenseMessage: typeConvert.MarkdownString.fromStrict(result.pastTenseMessage),
				presentation: result.presentation
			};
		}

		return undefined;
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
