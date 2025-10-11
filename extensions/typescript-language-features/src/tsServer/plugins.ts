/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as arrays from '../utils/arrays';
import { Disposable } from '../utils/dispose';

export interface TypeScriptServerPlugin {
	readonly extension: vscode.Extension<unknown>;
	readonly uri: vscode.Uri;
	readonly name: string;
	readonly enableForWorkspaceTypeScriptVersions: boolean;
	readonly languages: ReadonlyArray<string>;
	readonly configNamespace?: string;
}

namespace TypeScriptServerPlugin {
	export function equals(a: TypeScriptServerPlugin, b: TypeScriptServerPlugin): boolean {
		return a.uri.toString() === b.uri.toString()
			&& a.name === b.name
			&& a.enableForWorkspaceTypeScriptVersions === b.enableForWorkspaceTypeScriptVersions
			&& arrays.equals(a.languages, b.languages);
	}
}

export class PluginManager extends Disposable {
	private readonly _pluginConfigurations = new Map<string, unknown>();

	private _plugins?: Map<string, ReadonlyArray<TypeScriptServerPlugin>>;

	constructor() {
		super();

		vscode.extensions.onDidChange(() => {
			if (!this._plugins) {
				return;
			}

			const newPlugins = this.readPlugins();
			if (!arrays.equals(Array.from(this._plugins.values()).flat(), Array.from(newPlugins.values()).flat(), TypeScriptServerPlugin.equals)) {
				this._plugins = newPlugins;
				this._onDidUpdatePlugins.fire(this);
			}
		}, undefined, this._disposables);
	}

	public get plugins(): ReadonlyArray<TypeScriptServerPlugin> {
		this._plugins ??= this.readPlugins();
		return Array.from(this._plugins.values()).flat();
	}

	private readonly _onDidUpdatePlugins = this._register(new vscode.EventEmitter<this>());
	public readonly onDidChangePlugins = this._onDidUpdatePlugins.event;

	private readonly _onDidUpdateConfig = this._register(new vscode.EventEmitter<{ pluginId: string; config: unknown }>());
	public readonly onDidUpdateConfig = this._onDidUpdateConfig.event;

	public setConfiguration(pluginId: string, config: unknown) {
		this._pluginConfigurations.set(pluginId, config);
		this._onDidUpdateConfig.fire({ pluginId, config });
	}

	public configurations(): IterableIterator<[string, unknown]> {
		return this._pluginConfigurations.entries();
	}

	private readPlugins() {
		const pluginMap = new Map<string, ReadonlyArray<TypeScriptServerPlugin>>();
		for (const extension of vscode.extensions.all) {
			const pack = extension.packageJSON;
			if (pack.contributes && Array.isArray(pack.contributes.typescriptServerPlugins)) {
				const plugins: TypeScriptServerPlugin[] = [];
				for (const plugin of pack.contributes.typescriptServerPlugins) {
					plugins.push({
						extension,
						name: plugin.name,
						enableForWorkspaceTypeScriptVersions: !!plugin.enableForWorkspaceTypeScriptVersions,
						uri: extension.extensionUri,
						languages: Array.isArray(plugin.languages) ? plugin.languages : [],
						configNamespace: plugin.configNamespace,
					});
				}
				if (plugins.length) {
					pluginMap.set(extension.id, plugins);
				}
			}
		}
		return pluginMap;
	}
}
