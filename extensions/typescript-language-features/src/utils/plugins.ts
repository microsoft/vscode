/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';

export interface TypeScriptServerPlugin {
	readonly path: string;
	readonly name: string;
	readonly languages: string[];
}

export function getContributedTypeScriptServerPlugins(): TypeScriptServerPlugin[] {
	const plugins: TypeScriptServerPlugin[] = [];
	for (const extension of vscode.extensions.all) {
		const pack = extension.packageJSON;
		if (pack.contributes && pack.contributes.typescriptServerPlugins && Array.isArray(pack.contributes.typescriptServerPlugins)) {
			for (const plugin of pack.contributes.typescriptServerPlugins) {
				plugins.push({
					name: plugin.name,
					path: extension.extensionPath,
					languages: Array.isArray(plugin.languages) ? plugin.languages : [],
				});
			}
		}
	}
	return plugins;
}


export class PluginConfigProvider extends Disposable {
	private readonly _config = new Map<string, {}>();

	private readonly _onDidUpdateConfig = this._register(new vscode.EventEmitter<{ pluginId: string, config: {} }>());
	public readonly onDidUpdateConfig = this._onDidUpdateConfig.event;

	public set(pluginId: string, config: {}) {
		this._config.set(pluginId, config);
		this._onDidUpdateConfig.fire({ pluginId, config });
	}

	public entries(): IterableIterator<[string, {}]> {
		return this._config.entries();
	}
}