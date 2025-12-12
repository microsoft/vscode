/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides completion items for Typst documents using static data.
 *
 * For full LSP-based completions, tinymist-web would need to be integrated.
 */
export class TypstCompletionProvider implements vscode.CompletionItemProvider {

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.CompletionContext
	): vscode.CompletionItem[] {
		const line = document.lineAt(position.line).text;
		const prefix = line.substring(0, position.character);

		// Check context and provide appropriate completions
		if (prefix.endsWith('#')) {
			return this.getCodeCompletions();
		} else if (prefix.match(/\$[^$]*$/)) {
			return this.getMathCompletions();
		}

		return [];
	}

	private getCodeCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// Keywords
		const keywords = [
			{ label: 'set', snippet: 'set $1($2)', detail: 'Set element properties' },
			{ label: 'show', snippet: 'show $1: $2', detail: 'Transform elements' },
			{ label: 'let', snippet: 'let $1 = $2', detail: 'Define variable' },
			{ label: 'if', snippet: 'if $1 {\n\t$2\n}', detail: 'Conditional' },
			{ label: 'else', snippet: 'else {\n\t$1\n}', detail: 'Else branch' },
			{ label: 'for', snippet: 'for $1 in $2 {\n\t$3\n}', detail: 'For loop' },
			{ label: 'while', snippet: 'while $1 {\n\t$2\n}', detail: 'While loop' },
			{ label: 'import', snippet: 'import "$1"', detail: 'Import module' },
			{ label: 'include', snippet: 'include "$1"', detail: 'Include file' },
			{ label: 'return', snippet: 'return $1', detail: 'Return value' },
			{ label: 'break', snippet: 'break', detail: 'Break loop' },
			{ label: 'continue', snippet: 'continue', detail: 'Continue loop' },
		];

		for (const kw of keywords) {
			const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
			item.insertText = new vscode.SnippetString(kw.snippet);
			item.detail = kw.detail;
			items.push(item);
		}

		// Functions
		const functions = [
			{ label: 'heading', snippet: 'heading(level: ${1:1})[$2]', detail: 'Create heading' },
			{ label: 'text', snippet: 'text($1)[$2]', detail: 'Style text' },
			{ label: 'emph', snippet: 'emph[$1]', detail: 'Emphasize' },
			{ label: 'strong', snippet: 'strong[$1]', detail: 'Bold text' },
			{ label: 'link', snippet: 'link("$1")[$2]', detail: 'Hyperlink' },
			{ label: 'image', snippet: 'image("$1", width: ${2:100%})', detail: 'Include image' },
			{ label: 'figure', snippet: 'figure(\n\t$1,\n\tcaption: [$2],\n)', detail: 'Figure with caption' },
			{ label: 'table', snippet: 'table(\n\tcolumns: ${1:2},\n\t$2\n)', detail: 'Create table' },
			{ label: 'grid', snippet: 'grid(\n\tcolumns: ${1:(1fr, 1fr)},\n\t$2\n)', detail: 'Grid layout' },
			{ label: 'align', snippet: 'align(${1:center})[$2]', detail: 'Align content' },
			{ label: 'block', snippet: 'block($1)[$2]', detail: 'Block element' },
			{ label: 'box', snippet: 'box($1)[$2]', detail: 'Inline box' },
			{ label: 'stack', snippet: 'stack(dir: ${1:ttb}, $2)', detail: 'Stack elements' },
			{ label: 'v', snippet: 'v(${1:1em})', detail: 'Vertical space' },
			{ label: 'h', snippet: 'h(${1:1em})', detail: 'Horizontal space' },
			{ label: 'pagebreak', snippet: 'pagebreak()', detail: 'Page break' },
			{ label: 'lorem', snippet: 'lorem(${1:50})', detail: 'Placeholder text' },
			{ label: 'cite', snippet: 'cite(<$1>)', detail: 'Citation' },
			{ label: 'bibliography', snippet: 'bibliography("$1")', detail: 'Bibliography' },
			{ label: 'footnote', snippet: 'footnote[$1]', detail: 'Footnote' },
			{ label: 'raw', snippet: 'raw("$1", lang: "$2")', detail: 'Code/raw text' },
			{ label: 'enum', snippet: 'enum(\n\t[$1],\n\t[$2],\n)', detail: 'Numbered list' },
			{ label: 'list', snippet: 'list(\n\t[$1],\n\t[$2],\n)', detail: 'Bullet list' },
			{ label: 'terms', snippet: 'terms(\n\t[$1]: [$2],\n)', detail: 'Term list' },
			{ label: 'rect', snippet: 'rect($1)[$2]', detail: 'Rectangle' },
			{ label: 'circle', snippet: 'circle($1)[$2]', detail: 'Circle' },
			{ label: 'ellipse', snippet: 'ellipse($1)[$2]', detail: 'Ellipse' },
			{ label: 'line', snippet: 'line(start: $1, end: $2)', detail: 'Line' },
			{ label: 'path', snippet: 'path($1)', detail: 'Path' },
			{ label: 'polygon', snippet: 'polygon($1)', detail: 'Polygon' },
			{ label: 'place', snippet: 'place(${1:top + right})[$2]', detail: 'Place element' },
			{ label: 'rotate', snippet: 'rotate(${1:45deg})[$2]', detail: 'Rotate' },
			{ label: 'scale', snippet: 'scale(${1:50%})[$2]', detail: 'Scale' },
			{ label: 'move', snippet: 'move(dx: $1, dy: $2)[$3]', detail: 'Move element' },
			{ label: 'pad', snippet: 'pad($1)[$2]', detail: 'Padding' },
			{ label: 'repeat', snippet: 'repeat[$1]', detail: 'Repeat content' },
			{ label: 'hide', snippet: 'hide[$1]', detail: 'Hide content' },
			{ label: 'strike', snippet: 'strike[$1]', detail: 'Strikethrough' },
			{ label: 'underline', snippet: 'underline[$1]', detail: 'Underline' },
			{ label: 'overline', snippet: 'overline[$1]', detail: 'Overline' },
			{ label: 'highlight', snippet: 'highlight[$1]', detail: 'Highlight' },
			{ label: 'smallcaps', snippet: 'smallcaps[$1]', detail: 'Small caps' },
			{ label: 'sub', snippet: 'sub[$1]', detail: 'Subscript' },
			{ label: 'super', snippet: 'super[$1]', detail: 'Superscript' },
			{ label: 'upper', snippet: 'upper[$1]', detail: 'Uppercase' },
			{ label: 'lower', snippet: 'lower[$1]', detail: 'Lowercase' },
			{ label: 'range', snippet: 'range(${1:10})', detail: 'Number range' },
			{ label: 'counter', snippet: 'counter(${1:heading})', detail: 'Counter' },
			{ label: 'state', snippet: 'state("$1", ${2:0})', detail: 'State variable' },
			{ label: 'locate', snippet: 'locate(loc => $1)', detail: 'Locate position' },
			{ label: 'query', snippet: 'query(${1:heading}, loc)', detail: 'Query elements' },
			{ label: 'document', snippet: 'document($1)', detail: 'Document metadata' },
			{ label: 'page', snippet: 'page($1)', detail: 'Page settings' },
			{ label: 'par', snippet: 'par[$1]', detail: 'Paragraph' },
		];

		for (const fn of functions) {
			const item = new vscode.CompletionItem(fn.label, vscode.CompletionItemKind.Function);
			item.insertText = new vscode.SnippetString(fn.snippet);
			item.detail = fn.detail;
			items.push(item);
		}

		return items;
	}

	private getMathCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// Greek letters
		const greekLetters = [
			'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
			'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
			'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
			'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
			'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
			'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
		];

		for (const letter of greekLetters) {
			const item = new vscode.CompletionItem(letter, vscode.CompletionItemKind.Constant);
			item.detail = 'Greek letter';
			items.push(item);
		}

		// Math functions
		const mathFunctions = [
			{ label: 'frac', snippet: 'frac($1, $2)', detail: 'Fraction' },
			{ label: 'sqrt', snippet: 'sqrt($1)', detail: 'Square root' },
			{ label: 'root', snippet: 'root($1, $2)', detail: 'nth root' },
			{ label: 'sum', snippet: 'sum', detail: 'Summation' },
			{ label: 'prod', snippet: 'prod', detail: 'Product' },
			{ label: 'integral', snippet: 'integral', detail: 'Integral' },
			{ label: 'lim', snippet: 'lim', detail: 'Limit' },
			{ label: 'sin', snippet: 'sin', detail: 'Sine' },
			{ label: 'cos', snippet: 'cos', detail: 'Cosine' },
			{ label: 'tan', snippet: 'tan', detail: 'Tangent' },
			{ label: 'log', snippet: 'log', detail: 'Logarithm' },
			{ label: 'ln', snippet: 'ln', detail: 'Natural log' },
			{ label: 'exp', snippet: 'exp', detail: 'Exponential' },
			{ label: 'vec', snippet: 'vec($1)', detail: 'Vector' },
			{ label: 'mat', snippet: 'mat(\n\t$1\n)', detail: 'Matrix' },
			{ label: 'cases', snippet: 'cases(\n\t$1\n)', detail: 'Piecewise' },
			{ label: 'binom', snippet: 'binom($1, $2)', detail: 'Binomial' },
		];

		for (const fn of mathFunctions) {
			const item = new vscode.CompletionItem(fn.label, vscode.CompletionItemKind.Function);
			if (fn.snippet.includes('$')) {
				item.insertText = new vscode.SnippetString(fn.snippet);
			}
			item.detail = fn.detail;
			items.push(item);
		}

		// Symbols
		// allow-any-unicode-next-line
		const symbols = [
			{ label: 'infinity', detail: '\u221E' },
			{ label: 'partial', detail: '\u2202' },
			{ label: 'nabla', detail: '\u2207' },
			{ label: 'approx', detail: '\u2248' },
			{ label: 'neq', detail: '\u2260' },
			{ label: 'leq', detail: '\u2264' },
			{ label: 'geq', detail: '\u2265' },
			{ label: 'subset', detail: '\u2282' },
			{ label: 'supset', detail: '\u2283' },
			{ label: 'in', detail: '\u2208' },
			{ label: 'forall', detail: '\u2200' },
			{ label: 'exists', detail: '\u2203' },
			{ label: 'times', detail: '\u00D7' },
			{ label: 'div', detail: '\u00F7' },
			{ label: 'pm', detail: '\u00B1' },
			{ label: 'mp', detail: '\u2213' },
			{ label: 'cdot', detail: '\u00B7' },
			{ label: 'dots', detail: '\u2026' },
			{ label: 'arrow.r', detail: '\u2192' },
			{ label: 'arrow.l', detail: '\u2190' },
			{ label: 'arrow.t', detail: '\u2191' },
			{ label: 'arrow.b', detail: '\u2193' },
			{ label: 'implies', detail: '\u27F9' },
			{ label: 'iff', detail: '\u27FA' },
		];

		for (const sym of symbols) {
			const item = new vscode.CompletionItem(sym.label, vscode.CompletionItemKind.Constant);
			item.detail = sym.detail;
			items.push(item);
		}

		return items;
	}
}
