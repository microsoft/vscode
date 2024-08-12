/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { generateUuid } from 'vs/base/common/uuid';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostLanguageModelToolsShape, IMainContext, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IsTsxElementToken, IToolData, IToolDelta, IToolInvokation, IToolPromptContext, IToolsTsxPromptElement, IToolTsxPromptPiece } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import type * as vscode from 'vscode';

let intermdiateIdCounter = 0;

export class ExtHostLanguageModelTools implements ExtHostLanguageModelToolsShape {
	/** A map of tools that were registered in this EH */
	private readonly _registeredTools = new Map<string, { extension: IExtensionDescription; tool: vscode.LanguageModelTool }>();
	private readonly _proxy: MainThreadLanguageModelToolsShape;
	private readonly _invokationCallers = new Map<string, {
		countTokens(text: string, token?: CancellationToken): Promise<number> | number;
	}>();

	private readonly _invokations = new Map<string, {
		/** Tool result returned by the model */
		result: vscode.LanguageModelToolResult;
		/** Intermediate objects on which functions can be called. */
		intermediates: Map<number, IToolTsxPromptPiece>;
	}>();

	/** A map of all known tools, from other EHs or registered in vscode core */
	private readonly _allTools = new Map<string, IToolData>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);

		this._proxy.$getTools().then(tools => {
			for (const tool of tools) {
				this._allTools.set(tool.name, revive(tool));
			}
		});
	}

	async invokeTool(name: string, parameters: any, token: CancellationToken): Promise<vscode.LanguageModelToolResult & vscode.Disposable> {
		// Making the round trip here because not all tools were necessarily registered in this EH
		const result = await this._proxy.$invokeTool(name, parameters, token);
		for (const [key, value] of Object.entries(result.result)) {
			if (typeConvert.LanguageModelToolResult.isPromptPieceLike(value) && typeof value.ctor === 'object') {
				result.result[key] = {
					...value,
					ctor: this.makeProxiedTsxElement(result.id, key),
				};
			}
		}

		return typeConvert.LanguageModelToolResult.to(result, () => {
			this._proxy.$freeToolInvokation(result.id);
		});
	}

	async $acceptToolDelta(delta: IToolDelta): Promise<void> {
		if (delta.added) {
			this._allTools.set(delta.added.name, delta.added);
		}

		if (delta.removed) {
			this._allTools.delete(delta.removed);
		}
	}

	get tools(): vscode.LanguageModelToolDescription[] {
		return Array.from(this._allTools.values())
			.map(tool => typeConvert.LanguageModelToolDescription.to(tool));
	}

	$freeToolInvokation(invokationId: string): void {
		this._invokations.delete(invokationId);
	}

	$invokeToolCountTokens(callerId: string, input: string): Promise<number> {
		const caller = this._invokationCallers.get(callerId);
		if (!caller) {
			throw new Error(`Unknown caller ${callerId}`);
		}

		return Promise.resolve(caller.countTokens(input));
	}

	async $invokeToolRender(callerId: string, invokationId: string, objectIdOrContentType: number | string, context: IToolPromptContext): Promise<IToolTsxPromptPiece> {
		const invokation = this._invokations.get(invokationId);
		if (!invokation) {
			throw new Error(`Unknown invokation ${invokationId}`);
		}

		const object: IToolTsxPromptPiece = typeof objectIdOrContentType === 'string'
			? (invokation.result.hasOwnProperty(objectIdOrContentType) && invokation.result[objectIdOrContentType])
			: invokation.intermediates.get(objectIdOrContentType);
		if (!object || typeof object.ctor !== 'function') {
			throw new Error(`Unknown object ${objectIdOrContentType}`);
		}

		function process(part: IToolTsxPromptPiece): IToolTsxPromptPiece {
			let ctor = part.ctor;
			if (typeof part.ctor === 'function') {
				const id = ++intermdiateIdCounter;
				invokation!.intermediates.set(id, part);
				ctor = { [IsTsxElementToken]: id };
			}

			return {
				...part,
				ctor,
				children: part.children.map((p): any => p && typeof p === 'object' ? process(p) : p),
			};
		}

		const element = new object.ctor(object.props || {});

		return process(await element.render({
			...context,
			countTokens: (text: string, token?: CancellationToken) => this._proxy.$invokeToolCountTokens(callerId, text, token),
		}));
	}

	async $invokeTool(name: string, parameters: any, token: CancellationToken): Promise<IToolInvokation> {
		const item = this._registeredTools.get(name);
		if (!item) {
			throw new Error(`Unknown tool ${name}`);
		}

		const extensionResult = await item.tool.invoke(parameters, token);
		const invokationId = generateUuid();
		this._invokations.set(invokationId, {
			result: extensionResult,
			intermediates: new Map<number, any>(),
		});

		return typeConvert.LanguageModelToolResult.from(invokationId, extensionResult);
	}

	registerTool(extension: IExtensionDescription, name: string, tool: vscode.LanguageModelTool): IDisposable {
		this._registeredTools.set(name, { extension, tool });
		this._proxy.$registerTool(name);

		return toDisposable(() => {
			this._registeredTools.delete(name);
			this._proxy.$unregisterTool(name);
		});
	}

	private makeProxiedTsxElement(invokationId: string, objectIdOrContentType: string | number) {
		const that = this;

		return class implements IToolsTsxPromptElement {
			constructor(_props: unknown) { }

			async render(_state: unknown, sizing: {
				readonly tokenBudget: number;
				readonly endpoint: { modelMaxPromptTokens: number };
				countTokens(text: string, token?: CancellationToken): Promise<number> | number;
			}, token?: CancellationToken) {
				const callerId = generateUuid();
				that._invokationCallers.set(callerId, { countTokens: sizing.countTokens });
				try {
					const result = await that._proxy.$invokeToolRender(callerId, invokationId, objectIdOrContentType, {
						endpoint: sizing.endpoint,
						tokenBudget: sizing.tokenBudget,
					}, token);

					const process = (part: IToolTsxPromptPiece): IToolTsxPromptPiece => {
						return {
							...part,
							ctor: typeof part.ctor === 'object' && IsTsxElementToken in part.ctor
								? that.makeProxiedTsxElement(invokationId, part.ctor[IsTsxElementToken])
								: part.ctor,
							children: part.children.map((p): any => typeof p === 'object' && p ? process(p) : p),
						};
					};

					return process(result);
				} finally {
					that._invokationCallers.delete(callerId);
				}
			}
		};
	}
}
