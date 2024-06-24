/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import StateBlock from "markdown-it/lib/rules_block/state_block";

declare function require(path: string): any;

const markdownMathSetting = "markdown.math";

/*
Custom parser for fenced math blocks.
*/
function mathBlockParser(
	state: StateBlock,
	startLine: number,
	endLine: number,
	silent: boolean
): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (
		state.src.charCodeAt(pos) !== 0x60 /* ` */ &&
		state.src.charCodeAt(pos) !== 0x7e /* ~ */
	) {
		return false;
	}
	const marker = state.src.charCodeAt(pos);
	const start = pos;
	while (pos < max && state.src.charCodeAt(pos) === marker) {
		pos++;
	}
	const length = pos - start;
	if (length < 3) return false;

	const markup = state.src.slice(start, pos);
	const params = state.src.slice(pos, max).trim();

	if (params !== "math") return false;
	if (silent) return true;

	let nextLine = startLine;
	for (; ;) {
		nextLine++;
		if (nextLine >= endLine) break;

		pos = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];

		if (pos < max && state.src.charCodeAt(pos) === marker) {
			let i = pos;
			while (i < max && state.src.charCodeAt(i) === marker) {
				i++;
			}

			if (i - pos >= length) {
				if (state.src.slice(pos, max).trim().length === i - pos) {
					nextLine++;
					break;
				}
			}
		}
	}

	const content = state.getLines(
		startLine + 1,
		nextLine - 1,
		state.blkIndent,
		true
	);

	state.line = nextLine;

	const token = state.push("math_block", "math", 0);
	token.block = true;
	token.info = params;
	token.content = content;
	token.markup = markup;
	token.map = [startLine, state.line];

	return true;
}

export function activate(context: vscode.ExtensionContext) {
	function isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("markdown");
		return config.get<boolean>("math.enabled", true);
	}

	function getMacros(): { [key: string]: string } {
		const config = vscode.workspace.getConfiguration("markdown");
		return config.get<{ [key: string]: string }>("math.macros", {});
	}

	vscode.workspace.onDidChangeConfiguration(
		(e) => {
			if (e.affectsConfiguration(markdownMathSetting)) {
				vscode.commands.executeCommand("markdown.api.reloadPlugins");
			}
		},
		undefined,
		context.subscriptions
	);

	return {
		extendMarkdownIt(md: MarkdownIt) {
			if (isEnabled()) {
				const katex = require("@vscode/markdown-it-katex").default;
				const settingsMacros = getMacros();
				const options = { globalGroup: true, macros: { ...settingsMacros } };
				md.core.ruler.push("reset-katex-macros", () => {
					options.macros = { ...settingsMacros };
				});

				md.block.ruler.before("fence", "math_block", mathBlockParser, {
					alt: ["paragraph"],
				});

				return md.use(katex, options);
			}
			return md;
		},
	};
}
