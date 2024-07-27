/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostLanguageModelToolsShape, IMainContext, MainContext, MainThreadLanguageModelToolsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IToolData, IToolDelta } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import type * as vscode from 'vscode';

export class ExtHostLanguageModelTools implements ExtHostLanguageModelToolsShape {
	/** A map of tools that were registered in this EH */
	private readonly _registeredTools = new Map<string, { extension: IExtensionDescription; tool: vscode.LanguageModelTool }>();
	private readonly _proxy: MainThreadLanguageModelToolsShape;

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

	async invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string> {
		// Making the round trip here because not all tools were necessarily registered in this EH
		return await this._proxy.$invokeTool(name, parameters, token);
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

	async $invokeTool(name: string, parameters: any, token: CancellationToken): Promise<string> {
		const item = this._registeredTools.get(name);
		if (!item) {
			throw new Error(`Unknown tool ${name}`);
		}

		return await item.tool.invoke(parameters, token);
	}

	registerTool(extension: IExtensionDescription, name: string, tool: vscode.LanguageModelTool): IDisposable {
		this._registeredTools.set(name, { extension, tool });
		this._proxy.$registerTool(name);

		return toDisposable(() => {
			this._registeredTools.delete(name);
			this._proxy.$unregisterTool(name);
		});
	}
}
