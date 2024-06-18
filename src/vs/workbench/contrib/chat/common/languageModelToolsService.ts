/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Iterable } from 'vs/base/common/iterator';

export interface IToolData {
	id: string;
	displayName?: string;
	description: string;
	parametersSchema?: Object;
}

interface IToolEntry {
	data: IToolData;
	impl?: IToolImpl;
}

export interface IToolImpl {
	invoke(parameters: any, token: CancellationToken): Promise<string>;
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
	registerToolImplementation(id: string, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string>;
}

export class LanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<IToolDelta>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	private _tools = new Map<string, IToolEntry>();

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

	registerToolImplementation(id: string, tool: IToolImpl): IDisposable {
		const entry = this._tools.get(id);
		if (!entry) {
			throw new Error(`Tool "${id}" was not contributed.`);
		}

		if (entry.impl) {
			throw new Error(`Tool "${id}" already has an implementation.`);
		}

		entry.impl = tool;
		return toDisposable(() => {
			entry.impl = undefined;
		});
	}

	getTools(): Iterable<Readonly<IToolData>> {
		return Iterable.map(this._tools.values(), i => i.data);
	}

	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string> {
		const tool = this._tools.get(name);
		if (!tool?.impl) {
			throw new Error(`Tool ${name} not found`);
		}

		return tool.impl.invoke(parameters, token);
	}
}
