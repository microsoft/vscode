/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type MarkdownIt = require('markdown-it');

declare function require(path: string): any;

const markdownMathSetting = 'markdown.math';


export function activate(context: vscode.ExtensionContext) {
	function isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('markdown');
		return config.get<boolean>('math.enabled', true);
	}

	function getMacros(): { [key: string]: string } {
		const config = vscode.workspace.getConfiguration('markdown');
		return config.get<{ [key: string]: string }>('math.macros', {});
	}

	function preprocessMarkdown(markdown: string): string {
		const fencedMathRegex = /```math\s+([\s\S]*?)\s+```/g;
		return markdown.replace(fencedMathRegex, (_, mathContent) => {
			return `$$\n${mathContent}\n$$`;
		});
	}

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(markdownMathSetting)) {
			vscode.commands.executeCommand('markdown.api.reloadPlugins');
		}
	}, undefined, context.subscriptions);

	return {
		extendMarkdownIt(md: MarkdownIt) {
			if (isEnabled()) {
				const katex = require('@vscode/markdown-it-katex').default;
				const settingsMacros = getMacros();
				const options = { globalGroup: true, macros: { ...settingsMacros } };
				md.core.ruler.push('reset-katex-macros', () => {
					options.macros = { ...settingsMacros };
				});
				md.core.ruler.before('normalize', 'fenced-math-preprocessor', (state) => {
					state.src = preprocessMarkdown(state.src);
				});
				return md.use(katex, options);
			}
			return md;
		}
	};
}