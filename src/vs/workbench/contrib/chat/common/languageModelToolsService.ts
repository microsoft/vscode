/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export interface IToolData {
	name: string;
	icon?: { dark: URI; light?: URI } | ThemeIcon;
	displayName?: string;
	description: string;
	parametersSchema?: IJSONSchema;
	canBeInvokedManually?: boolean;
}

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

/**
 * Found in {@link IToolInvokation.result} as `{ [IsTsxElementToken]: true }`
 * when the tool returns something that looks like a prompt-tsx element.
 */
export const IsTsxElementToken = '$$isTSXElement';

export const IsFragmentMarker = '$$isFragment';

export interface IToolPromptContext {
	tokenBudget: number;
	endpoint: { modelMaxPromptTokens: number };
}

export interface IToolsTsxPromptElement {
	render(...args: any): IToolTsxPromptPiece | Promise<IToolTsxPromptPiece>;
}

export interface IToolTsxPromptPiece {
	ctor: string | { new(props: any, ...args: any[]): IToolsTsxPromptElement } | { [IsTsxElementToken]: number | string };
	props: any;
	children: (number | string | IToolTsxPromptPiece | undefined)[];
}

export interface IToolInvokation {
	id: string;
	result: IToolResult;
	asString: string;
}

export interface IToolResult {
	[contentType: string]: any;
}

export interface IToolImpl {
	invoke(parameters: any, token: CancellationToken): Promise<IToolInvokation>;
	render(callerId: string, invokationId: string, objectIdOrContentType: number | string, context: IToolPromptContext, token: CancellationToken | undefined): Promise<IToolTsxPromptPiece>;
	free(invokationId: string): void;
}

export const ILanguageModelToolsService = createDecorator<ILanguageModelToolsService>('ILanguageModelToolsService');

export interface IToolDelta {
	added?: IToolData;
	removed?: string;
}

export interface ILanguageModelToolsService {
	_serviceBrand: undefined;
	onDidChangeTools: Event<IToolDelta>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(name: string, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<IToolInvokation>;
	invokeToolRender(callerId: string, invokationId: string, objectIdOrContentType: number | string, context: IToolPromptContext, token: CancellationToken | undefined, countTokens: (input: string, token: CancellationToken | undefined) => Promise<number>): Promise<IToolTsxPromptPiece>;
	invokeToolCountTokens(callerId: string, input: string, token: CancellationToken | undefined): Promise<number>;
	freeToolInvokation(invokationId: string): void;
}

export class LanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<IToolDelta>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	private readonly _toolInvokations = new Map<string, IToolEntry>();
	private readonly _toolTokenCounters = new Map<string, (input: string, token: CancellationToken | undefined) => Promise<number>>();
	private _tools = new Map<string, IToolEntry>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService
	) { }

	registerToolData(toolData: IToolData): IDisposable {
		if (this._tools.has(toolData.name)) {
			throw new Error(`Tool "${toolData.name}" is already registered.`);
		}

		this._tools.set(toolData.name, { data: toolData });
		this._onDidChangeTools.fire({ added: toolData });

		return toDisposable(() => {
			this._tools.delete(toolData.name);
			this._onDidChangeTools.fire({ removed: toolData.name });
		});

	}

	registerToolImplementation(name: string, tool: IToolImpl): IDisposable {
		const entry = this._tools.get(name);
		if (!entry) {
			throw new Error(`Tool "${name}" was not contributed.`);
		}

		if (entry.impl) {
			throw new Error(`Tool "${name}" already has an implementation.`);
		}

		entry.impl = tool;
		return toDisposable(() => {
			entry.impl = undefined;
		});
	}

	getTools(): Iterable<Readonly<IToolData>> {
		return Iterable.map(this._tools.values(), i => i.data);
	}

	async invokeTool(name: string, parameters: any, token: CancellationToken): Promise<IToolInvokation> {
		let tool = this._tools.get(name);
		if (!tool) {
			throw new Error(`Tool ${name} was not contributed`);
		}

		if (!tool.impl) {
			await this._extensionService.activateByEvent(`onLanguageModelTool:${name}`);

			// Extension should activate and register the tool implementation
			tool = this._tools.get(name);
			if (!tool?.impl) {
				throw new Error(`Tool ${name} does not have an implementation registered.`);
			}
		}

		const result = await tool.impl.invoke(parameters, token);
		this._toolInvokations.set(result.id, tool);
		return result;
	}

	async invokeToolRender(callerId: string, invokationId: string, objectIdOrContentType: number | string, context: IToolPromptContext, token: CancellationToken | undefined, countTokens: (input: string, token: CancellationToken | undefined) => Promise<number>): Promise<IToolTsxPromptPiece> {
		const tool = this._toolInvokations.get(invokationId);
		if (!tool?.impl) {
			throw new Error(`Unknown invokation ${invokationId}`);
		}

		this._toolTokenCounters.set(callerId, countTokens);
		try {
			return await tool.impl.render(callerId, invokationId, objectIdOrContentType, context, token);
		} finally {
			this._toolTokenCounters.delete(callerId);
		}
	}

	async invokeToolCountTokens(callerId: string, input: string, token: CancellationToken | undefined): Promise<number> {
		return this._toolTokenCounters.get(callerId)?.(input, token) || 0;
	}

	freeToolInvokation(invokationId: string): void {
		this._toolInvokations.get(invokationId)?.impl?.free(invokationId);
		this._toolInvokations.delete(invokationId);
	}
}
