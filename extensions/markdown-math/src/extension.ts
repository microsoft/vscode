/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

declare function require(path: string): any;

const markdownMathSetting = 'markdown.math';

/**
 * Characters that, when appearing immediately after an opening `$`, indicate
 * that the `$` is not a math delimiter. These characters are common in
 * programming contexts (e.g. jQuery's `$.ajax`, `$(selector)`, `$#variable`)
 * and would never start a valid LaTeX math expression.
 */
const nonMathAfterDollarSign = new Set(['.', '(', '#', '\'', '"', ',', ';']);

/**
 * Rewrites the katex plugin's `math_inline` rule to prevent false-positive
 * math parsing when `$` is used as a non-math symbol (e.g. jQuery).
 *
 * The patched rule wraps the original and rejects opening `$` delimiters
 * whose next character is in {@link nonMathAfterDollarSign}.
 */
function patchInlineMathRule(md: any): void {
	const inlineRules: any[] | undefined = md.inline.ruler.__rules__;
	if (!inlineRules) {
		return;
	}

	const mathInlineEntry = inlineRules.find((r: any) => r.name === 'math_inline');
	if (!mathInlineEntry) {
		return;
	}

	const originalFn = mathInlineEntry.fn;
	mathInlineEntry.fn = function patchedInlineMath(state: any, silent: boolean): boolean {
		if (state.src[state.pos] === '$') {
			const nextChar = state.src[state.pos + 1];
			if (nextChar && nonMathAfterDollarSign.has(nextChar)) {
				// Not a math delimiter – let markdown-it continue with normal text processing
				if (!silent) {
					state.pending += '$';
				}
				state.pos += 1;
				return true;
			}
		}
		return originalFn.call(this, state, silent);
	};
}

export function activate(context: vscode.ExtensionContext) {
	function isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('markdown');
		return config.get<boolean>('math.enabled', true);
	}

	function getMacros(): { [key: string]: string } {
		const config = vscode.workspace.getConfiguration('markdown');
		return config.get<{ [key: string]: string }>('math.macros', {});
	}

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(markdownMathSetting)) {
			vscode.commands.executeCommand('markdown.api.reloadPlugins');
		}
	}, undefined, context.subscriptions);

	return {
		extendMarkdownIt(md: any) {
			if (isEnabled()) {
				const katex = require('@vscode/markdown-it-katex').default;
				const settingsMacros = getMacros();
				const options = {
					enableFencedBlocks: true,
					globalGroup: true,
					macros: { ...settingsMacros }
				};
				md.core.ruler.push('reset-katex-macros', () => {
					options.macros = { ...settingsMacros };
				});
				md = md.use(katex, options);
				patchInlineMathRule(md);
				return md;
			}
			return md;
		}
	};
}