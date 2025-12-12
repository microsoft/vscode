/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides hover information for Typst documents using static data.
 */
export class TypstHoverProvider implements vscode.HoverProvider {

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): vscode.Hover | undefined {
		const config = vscode.workspace.getConfiguration('typst');
		if (!config.get<boolean>('hover.preview.enabled', true)) {
			return undefined;
		}

		const range = document.getWordRangeAtPosition(position, /#?[\w\-.]+/);
		if (!range) {
			return undefined;
		}

		const word = document.getText(range).replace(/^#/, '');
		const info = TYPST_DOCS.get(word);

		if (info) {
			const markdown = new vscode.MarkdownString();
			markdown.appendMarkdown(`### ${word}\n\n`);
			markdown.appendMarkdown(info.description);
			if (info.signature) {
				markdown.appendMarkdown(`\n\n**Signature:**\n\`\`\`typst\n${info.signature}\n\`\`\``);
			}
			if (info.example) {
				markdown.appendMarkdown(`\n\n**Example:**\n\`\`\`typst\n${info.example}\n\`\`\``);
			}
			return new vscode.Hover(markdown, range);
		}

		return undefined;
	}
}

interface DocEntry {
	description: string;
	signature?: string;
	example?: string;
}

const TYPST_DOCS = new Map<string, DocEntry>([
	// Keywords
	['set', {
		description: 'Apply style rules to all matching elements in the current scope.',
		signature: '#set element(..args)',
		example: '#set text(font: "New Computer Modern")\n#set par(justify: true)'
	}],
	['show', {
		description: 'Transform how elements of a certain type are displayed.',
		signature: '#show selector: replacement',
		example: '#show heading: it => [\n  #set text(blue)\n  #it.body\n]'
	}],
	['let', {
		description: 'Define a variable or function.',
		signature: '#let name = value\n#let func(args) = body',
		example: '#let name = "Typst"\n#let greet(name) = [Hello, #name!]'
	}],
	['if', {
		description: 'Conditional expression.',
		signature: '#if condition { then } else { else }',
		example: '#if x > 0 [Positive] else [Non-positive]'
	}],
	['for', {
		description: 'Loop over a collection.',
		signature: '#for item in collection { body }',
		example: '#for i in range(5) [Item #i ]'
	}],
	['while', {
		description: 'Loop while a condition is true.',
		signature: '#while condition { body }',
		example: '#let i = 0\n#while i < 5 { [#i ]; i += 1 }'
	}],
	['import', {
		description: 'Import items from another module or file.',
		signature: '#import "path" or #import "@namespace/package"',
		example: '#import "@preview/cetz:0.2.0": canvas, draw'
	}],
	['include', {
		description: 'Include another Typst file.',
		signature: '#include "path"',
		example: '#include "chapter1.typ"'
	}],

	// Common functions
	['heading', {
		description: 'Create a heading at a specified level.',
		signature: 'heading(level: int, body)',
		example: '= First Level\n== Second Level\n#heading(level: 3)[Third]'
	}],
	['text', {
		description: 'Style text with various properties.',
		signature: 'text(size, font, fill, weight, ..args)[body]',
		example: '#text(size: 14pt, weight: "bold", fill: blue)[Styled]'
	}],
	['image', {
		description: 'Include an image from a file.',
		signature: 'image(path, width, height, alt, fit)',
		example: '#image("photo.png", width: 50%)'
	}],
	['table', {
		description: 'Create a table with rows and columns.',
		signature: 'table(columns, rows, gutter, ..cells)',
		example: '#table(\n  columns: 3,\n  [A], [B], [C],\n  [1], [2], [3],\n)'
	}],
	['figure', {
		description: 'Create a figure with an optional caption.',
		signature: 'figure(body, caption, placement, gap)',
		example: '#figure(\n  image("photo.jpg"),\n  caption: [A photo],\n)'
	}],
	['link', {
		description: 'Create a hyperlink.',
		signature: 'link(dest)[body]',
		example: '#link("https://typst.app")[Typst website]'
	}],
	['cite', {
		description: 'Cite a bibliography entry.',
		signature: 'cite(key, supplement, form)',
		example: '#cite(<einstein1905>)'
	}],
	['bibliography', {
		description: 'Insert the bibliography.',
		signature: 'bibliography(path, title, style)',
		example: '#bibliography("refs.bib")'
	}],
	['pagebreak', {
		description: 'Insert a page break.',
		signature: 'pagebreak(weak: bool)',
		example: '#pagebreak()'
	}],
	['lorem', {
		description: 'Generate Lorem Ipsum placeholder text.',
		signature: 'lorem(words: int)',
		example: '#lorem(50)'
	}],
	['v', {
		description: 'Insert vertical spacing.',
		signature: 'v(amount)',
		example: '#v(1em)'
	}],
	['h', {
		description: 'Insert horizontal spacing.',
		signature: 'h(amount)',
		example: '#h(1fr)'
	}],
	['align', {
		description: 'Align content within its container.',
		signature: 'align(alignment)[body]',
		example: '#align(center)[Centered text]'
	}],
	['block', {
		description: 'Create a block-level element.',
		signature: 'block(width, height, fill, stroke, inset, radius)[body]',
		example: '#block(fill: luma(230), inset: 8pt)[Content]'
	}],
	['box', {
		description: 'Create an inline-level element.',
		signature: 'box(width, height, fill, stroke, inset, radius)[body]',
		example: '#box(baseline: 25%, image("icon.svg", height: 1em))'
	}],
	['grid', {
		description: 'Arrange content in a grid layout.',
		signature: 'grid(columns, rows, gutter, ..cells)',
		example: '#grid(\n  columns: (1fr, 1fr),\n  [Left], [Right]\n)'
	}],
	['emph', {
		description: 'Emphasize text (typically rendered as italic).',
		signature: 'emph[body]',
		example: '#emph[emphasized] or _emphasized_'
	}],
	['strong', {
		description: 'Make text strong (typically rendered as bold).',
		signature: 'strong[body]',
		example: '#strong[strong] or *strong*'
	}],
	['raw', {
		description: 'Display raw/code text.',
		signature: 'raw(text, lang, block)',
		example: '#raw("let x = 1", lang: "rust")'
	}],
	['footnote', {
		description: 'Create a footnote.',
		signature: 'footnote[body]',
		example: 'Text#footnote[Note content]'
	}],
]);
