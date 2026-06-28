/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

declare function require(path: string): any;

const markdownMathSetting = 'markdown.math';

/**
 * Determines if a dollar sign followed by parentheses represents a non-mathematical pattern
 * that should be escaped to prevent KaTeX parsing conflicts.
 */
function isNonMathDollarPattern(textAfterDollar: string): boolean {
	// Match various non-mathematical $ patterns
	const nonMathPatterns = [
		// JavaScript/jQuery patterns
		/^\(["'`][^"'`]*["'`]\)/,           // $("string"), $('string'), $(`string`)
		/^\(#[^)]+\)/,                      // $(#id) - CSS selectors
		/^\(\.[^)]+\)/,                     // $(.class) - CSS selectors
		/^\([a-zA-Z_$][a-zA-Z0-9_$]*\)/,    // $(variable) - JavaScript variables
		/^\(function\s*\(/,                 // $(function( - jQuery ready
		/^\(document\)/,                    // $(document)
		/^\(window\)/,                      // $(window)
		/^\(this\)/,                        // $(this)

		// Shell/Command patterns
		/^\([A-Z_][A-Z0-9_]*\)/,           // $(ENVIRONMENT_VAR) - shell variables
		/^\(echo\s/,                        // $(echo ...) - command substitution
		/^\(cat\s/,                         // $(cat ...) - command substitution
		/^\(grep\s/,                        // $(grep ...) - command substitution
		/^\(find\s/,                        // $(find ...) - command substitution
		/^\(which\s/,                       // $(which ...) - command substitution
		/^\(pwd\)/,                         // $(pwd) - command substitution
		/^\(date\)/,                        // $(date) - command substitution
		/^\(whoami\)/,                      // $(whoami) - command substitution

		// Programming language patterns
		/^\(.*\s*[=<>!]+\s*.*\)/,          // $(condition) - conditional expressions
		/^\([^)]*\.[a-zA-Z_][a-zA-Z0-9_]*\(/,  // $(obj.method()) - method calls
		/^\([^)]*\[[^\]]+\]\)/,            // $(array[index]) - array access

		// Template/placeholder patterns
		/^\(\{[^}]+\}\)/,                  // $({placeholder}) - template variables
		/^\([A-Z][A-Z_]*[A-Z]\)/,          // $(CONSTANT) - constants/env vars

		// Currency when followed by numbers (less common but possible)
		/^\([0-9]+\.?[0-9]*\)/,            // $(123.45) - currency amounts
	];

	return nonMathPatterns.some(pattern => pattern.test(textAfterDollar));
}

/**
 * Creates a markdown-it preprocessing rule to protect non-mathematical dollar patterns
 * from being processed by KaTeX.
 */
function createDollarSignProtectionRule() {
	return (state: any) => {
		// Comprehensive pattern matching for various $ usage contexts
		state.src = state.src.replace(/\$(?=\()/g, (match: string, offset: number, string: string) => {
			// Look ahead to see if this looks like a non-math usage
			const remaining = string.slice(offset + 1);

			if (isNonMathDollarPattern(remaining)) {
				// Escape the dollar sign to prevent KaTeX from processing it
				return '\\$';
			}

			// If it doesn't match known non-math patterns, leave it for potential math processing
			return match;
		});
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

				// Add preprocessing rule to handle non-math dollar patterns before KaTeX processing
				md.core.ruler.before('normalize', 'dollar-sign-protection', createDollarSignProtectionRule());

				return md.use(katex, options);
			}
			return md;
		}
	};
}
