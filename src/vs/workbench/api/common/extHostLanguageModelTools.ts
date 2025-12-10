/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { IPreparedToolInvocation, isToolInvocationContext, IToolInvocation, IToolInvocationContext, IToolInvocationPreparationContext, IToolResult, ToolInvocationPresentation } from '../../contrib/chat/common/languageModelToolsService.js';
import { ExtensionEditToolId, InternalEditToolId } from '../../contrib/chat/common/tools/editFileTool.js';
import { InternalFetchWebPageToolId } from '../../contrib/chat/common/tools/tools.js';
import { SearchExtensionsToolId } from '../../contrib/extensions/common/searchExtensionsTool.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { Dto, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostLanguageModelToolsShape, IMainContext, IToolDataDto, MainContext, MainThreadLanguageModelToolsShape } from './extHost.protocol.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import * as typeConvert from './extHostTypeConverters.js';

class Tool {

	private _data: IToolDataDto;
	private _apiObject = new Lazy<vscode.LanguageModelToolInformation>(() => {
		const that = this;
		return Object.freeze({
			get name() { return that._data.id; },
			get description() { return that._data.modelDescription; },
			get inputSchema() { return that._data.inputSchema; },
			get tags() { return that._data.tags ?? []; },
			get source() { return undefined; }
		});
	});

	private _apiObjectWithChatParticipantAdditions = new Lazy<vscode.LanguageModelToolInformation>(() => {
		const that = this;
		const source = typeConvert.LanguageModelToolSource.to(that._data.source);

		return Object.freeze({
			get name() { return that._data.id; },
			get description() { return that._data.modelDescription; },
			get inputSchema() { return that._data.inputSchema; },
			get tags() { return that._data.tags ?? []; },
			get source() { return source; }
		});
	});

	constructor(data: IToolDataDto) {
		this._data = data;
	}

	update(newData: IToolDataDto): void {
		this._data = newData;
	}

	get data(): IToolDataDto {
		return this._data;
	}

	get apiObject(): vscode.LanguageModelToolInformation {
		return this._apiObject.value;
	}

	get apiObjectWithChatParticipantAdditions() {
		return this._apiObjectWithChatParticipantAdditions.value;
	}
}

export class ExtHostLanguageModelTools implements ExtHostLanguageModelToolsShape {
	/** A map of tools that were registered in this EH */
	private readonly _registeredTools = new Map<string, { extension: IExtensionDescription; tool: vscode.LanguageModelTool<Object> }>();
	private readonly _proxy: MainThreadLanguageModelToolsShape;
	private readonly _tokenCountFuncs = new Map</* call ID */string, (text: string, token?: vscode.CancellationToken) => Thenable<number>>();

	/** A map of all known tools, from other EHs or registered in vscode core */
	private readonly _allTools = new Map<string, Tool>();

	constructor(
		mainContext: IMainContext,
		private readonly _languageModels: ExtHostLanguageModels,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);

		this._proxy.$getTools().then(tools => {
			for (const tool of tools) {
				this._allTools.set(tool.id, new Tool(revive(tool)));
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
				fromSubAgent: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.fromSubAgent : undefined,
			}, token);

			const dto: Dto<IToolResult> = result instanceof SerializableObjectWithBuffers ? result.value : result;
			return typeConvert.LanguageModelToolResult.to(revive(dto));
		} finally {
			this._tokenCountFuncs.delete(callId);
		}
	}

	$onDidChangeTools(tools: IToolDataDto[]): void {

		const oldTools = new Set(this._registeredTools.keys());

		for (const tool of tools) {
			oldTools.delete(tool.id);
			const existing = this._allTools.get(tool.id);
			if (existing) {
				existing.update(tool);
			} else {
				this._allTools.set(tool.id, new Tool(revive(tool)));
			}
		}

		for (const id of oldTools) {
			this._allTools.delete(id);
		}
	}

	getTools(extension: IExtensionDescription): vscode.LanguageModelToolInformation[] {
		const hasParticipantAdditions = isProposedApiEnabled(extension, 'chatParticipantPrivate');
		return Array.from(this._allTools.values())
			.map(tool => hasParticipantAdditions ? tool.apiObjectWithChatParticipantAdditions : tool.apiObject)
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

	async $invokeTool(dto: Dto<IToolInvocation>, token: CancellationToken): Promise<Dto<IToolResult> | SerializableObjectWithBuffers<Dto<IToolResult>>> {
		const item = this._registeredTools.get(dto.toolId);
		if (!item) {
			throw new Error(`Unknown tool ${dto.toolId}`);
		}

		const options: vscode.LanguageModelToolInvocationOptions<Object> = {
			input: dto.parameters,
			toolInvocationToken: revive(dto.context) as unknown as vscode.ChatParticipantToolToken | undefined,
		};
		if (isProposedApiEnabled(item.extension, 'chatParticipantPrivate')) {
			options.chatRequestId = dto.chatRequestId;
			options.chatInteractionId = dto.chatInteractionId;
			options.chatSessionId = dto.context?.sessionId;
			options.fromSubAgent = dto.fromSubAgent;
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

		let progress: vscode.Progress<{ message?: string | vscode.MarkdownString; increment?: number }> | undefined;
		if (isProposedApiEnabled(item.extension, 'toolProgress')) {
			let lastProgress: number | undefined;
			progress = {
				report: value => {
					if (value.increment !== undefined) {
						lastProgress = (lastProgress ?? 0) + value.increment;
					}

					this._proxy.$acceptToolProgress(dto.callId, {
						message: typeConvert.MarkdownString.fromStrict(value.message),
						progress: lastProgress === undefined ? undefined : lastProgress / 100,
					});
				}
			};
		}

		// todo: 'any' cast because TS can't handle the overloads
		// eslint-disable-next-line local/code-no-any-casts
		const extensionResult = await raceCancellation(Promise.resolve((item.tool.invoke as any)(options, token, progress!)), token);
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

	async $prepareToolInvocation(toolId: string, context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const item = this._registeredTools.get(toolId);
		if (!item) {
			throw new Error(`Unknown tool ${toolId}`);
		}

		const options: vscode.LanguageModelToolInvocationPrepareOptions<any> = {
			input: context.parameters,
			chatRequestId: context.chatRequestId,
			chatSessionId: context.chatSessionId,
			chatInteractionId: context.chatInteractionId
		};
		if (item.tool.prepareInvocation) {
			const result = await item.tool.prepareInvocation(options, token);
			if (!result) {
				return undefined;
			}

			if (result.pastTenseMessage || result.presentation) {
				checkProposedApiEnabled(item.extension, 'chatParticipantPrivate');
			}

			return {
				confirmationMessages: result.confirmationMessages ? {
					title: typeof result.confirmationMessages.title === 'string' ? result.confirmationMessages.title : typeConvert.MarkdownString.from(result.confirmationMessages.title),
					message: typeof result.confirmationMessages.message === 'string' ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
				} : undefined,
				invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage),
				pastTenseMessage: typeConvert.MarkdownString.fromStrict(result.pastTenseMessage),
				presentation: result.presentation as ToolInvocationPresentation | undefined
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
