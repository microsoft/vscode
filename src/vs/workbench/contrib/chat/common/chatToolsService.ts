/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IChatToolData {
	id: string;
	displayName: string;
	description: string;
	parametersSchema: Object;
}

export interface IChatTool extends IChatToolData {
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
	registerTool(tool: IChatTool): IDisposable;
	getTools(): Iterable<Readonly<IChatToolData>>;
	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string>;
}

export class ChatToolsService implements IChatToolsService {
	_serviceBrand: undefined;

	private _onDidChangeTools = new Emitter<IChatToolDelta>();
	readonly onDidChangeTools = this._onDidChangeTools.event;

	private _tools = new Map<string, IChatTool>();

	registerTool(tool: IChatTool): IDisposable {
		if (this._tools.has(tool.id)) {
			throw new Error(`Tool ${tool.id} already exists`);
		}

		this._tools.set(tool.id, tool);
		this._onDidChangeTools.fire({ added: tool });

		return toDisposable(() => {
			this._tools.delete(tool.id);
			this._onDidChangeTools.fire({ removed: tool.id });
		});
	}

	getTools(): Iterable<Readonly<IChatToolData>> {
		return this._tools.values();
	}

	invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string> {
		const tool = this._tools.get(name);
		if (!tool) {
			throw new Error(`Tool ${name} not found`);
		}

		return tool.invoke(parameters, token);
	}
}
