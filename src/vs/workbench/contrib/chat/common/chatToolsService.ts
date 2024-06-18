/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Iterable } from 'vs/base/common/iterator';

export interface IChatToolData {
	id: string;
	displayName?: string;
	description: string;
	parametersSchema?: Object;
}

interface IToolEntry {
	data: IChatToolData;
	impl?: IChatToolImpl;
}

export interface IChatToolImpl {
	invoke(parameters: any, token: CancellationToken): Promise<string>;
}

export const IChatToolsService = createDecorator<IChatToolsService>('IChatToolsService');

export interface IChatToolDelta {
	added?: IChatToolData;
	removed?: string;
}

export interface IChatToolsService {
	_serviceBrand: undefined;
	onDidChangeTools: Event<IChatToolDelta>;
	registerToolData(toolData: IChatToolData): IDisposable;
	registerToolImplementation(id: string, tool: IChatToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IChatToolData>>;
	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string>;
}

export class ChatToolsService implements IChatToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<IChatToolDelta>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	private _tools = new Map<string, IToolEntry>();

	registerToolData(toolData: IChatToolData): IDisposable {
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

	registerToolImplementation(id: string, tool: IChatToolImpl): IDisposable {
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

	getTools(): Iterable<Readonly<IChatToolData>> {
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
