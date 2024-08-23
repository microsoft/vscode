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
	id: string;
	name?: string;
	icon?: { dark: URI; light?: URI } | ThemeIcon;
	displayName?: string;
	userDescription?: string;
	modelDescription: string;
	parametersSchema?: IJSONSchema;
	canBeInvokedManually?: boolean;
}

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

export interface IToolInvocation {
	callId: string;
	toolId: string;
	parameters: any;
	tokenBudget?: number;
}

export interface IToolResult {
	[contentType: string]: any;
	string: string;
}

export interface IToolImpl {
	invoke(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
}

export const ILanguageModelToolsService = createDecorator<ILanguageModelToolsService>('ILanguageModelToolsService');

export interface IToolDelta {
	added?: IToolData;
	removed?: string;
}

export type CountTokensCallback = (input: string, token: CancellationToken) => Promise<number>;

export interface ILanguageModelToolsService {
	_serviceBrand: undefined;
	onDidChangeTools: Event<IToolDelta>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(name: string, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	getTool(id: string): IToolData | undefined;
	getToolByName(name: string): IToolData | undefined;
	invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
}

export class LanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<IToolDelta>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	private _tools = new Map<string, IToolEntry>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService
	) { }

	registerToolData(toolData: IToolData): IDisposable {
		if (this._tools.has(toolData.id)) {
			throw new Error(`Tool "${toolData.id}" is already registered.`);
		}

		this._tools.set(toolData.id, { data: toolData });
		this._onDidChangeTools.fire({ added: toolData });

		return toDisposable(() => {
			this._tools.delete(toolData.id);
			this._onDidChangeTools.fire({ removed: toolData.id });
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

	getTool(id: string): IToolData | undefined {
		const entry = this._tools.get(id);
		return entry?.data;
	}

	getToolByName(name: string): IToolData | undefined {
		for (const entry of this._tools.values()) {
			if (entry.data.name === name) {
				return entry.data;
			}
		}
		return undefined;
	}

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		let tool = this._tools.get(dto.toolId);
		if (!tool) {
			throw new Error(`Tool ${dto.toolId} was not contributed`);
		}

		if (!tool.impl) {
			await this._extensionService.activateByEvent(`onLanguageModelTool:${dto.toolId}`);

			// Extension should activate and register the tool implementation
			tool = this._tools.get(dto.toolId);
			if (!tool?.impl) {
				throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
			}
		}

		return tool.impl.invoke(dto, countTokens, token);
	}
}
