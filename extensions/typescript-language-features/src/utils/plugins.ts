/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extensions } from 'vscode';

export interface TypeScriptServerPlugin {
	readonly path: string;
	readonly name: string;
	readonly languages: string[];
}

export function getContributedTypeScriptServerPlugins(): TypeScriptServerPlugin[] {
	const plugins: TypeScriptServerPlugin[] = [];
	for (const extension of extensions.all) {
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
