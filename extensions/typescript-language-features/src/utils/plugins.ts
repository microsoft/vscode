/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';
import { memoize } from './memoize';

export interface TypeScriptServerPlugin {
	readonly path: string;
	readonly name: string;
	readonly enableForWorkspaceTypeScriptVersions: boolean;
	readonly languages: ReadonlyArray<string>;
}

export class PluginManager extends Disposable {
	private readonly _pluginConfigurations = new Map<string, {}>();

	@memoize
	public get plugins(): ReadonlyArray<TypeScriptServerPlugin> {
		const plugins: TypeScriptServerPlugin[] = [];
		for (const extension of vscode.extensions.all) {
			const pack = extension.packageJSON;
			if (pack.contributes && Array.isArray(pack.contributes.typescriptServerPlugins)) {
				for (const plugin of pack.contributes.typescriptServerPlugins) {
					plugins.push({
						name: plugin.name,
						enableForWorkspaceTypeScriptVersions: !!plugin.enableForWorkspaceTypeScriptVersions,
						path: extension.extensionPath,
						languages: Array.isArray(plugin.languages) ? plugin.languages : [],
					});
				}
			}
		}
		return plugins;
	}

	private readonly _onDidUpdateConfig = this._register(new vscode.EventEmitter<{ pluginId: string, config: {} }>());
	public readonly onDidUpdateConfig = this._onDidUpdateConfig.event;

	public setConfiguration(pluginId: string, config: {}) {
		this._pluginConfigurations.set(pluginId, config);
		this._onDidUpdateConfig.fire({ pluginId, config });
	}

	public configurations(): IterableIterator<[string, {}]> {
		return this._pluginConfigurations.entries();
	}
}