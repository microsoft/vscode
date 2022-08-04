/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

declare function require(path: string): any;

const enabledSetting = 'markdown.math.enabled';

export function activate(context: vscode.ExtensionContext) {
	function isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('markdown');
		return config.get<boolean>('math.enabled', true);
	}

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(enabledSetting)) {
			vscode.commands.executeCommand('markdown.api.reloadPlugins');
		}
	}, undefined, context.subscriptions);

	return {
		extendMarkdownIt(md: any) {
			if (isEnabled()) {
				const katex = require('@iktakahiro/markdown-it-katex');
				const options = { globalGroup: true, macros: {} };
				md.core.ruler.push('reset-katex-macros', () => { options.macros = {}; });
				return md.use(katex, options);
			}
			return md;
		}
	};
}
