/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Comment, Context, CreateRule, ESTree, Fixer, RuleMeta, Visitor } from '@oxlint/plugins';
import { EOL } from 'os';

type CommentStyle = 'block' | 'line';
type HeaderLine = string | { readonly pattern: string; readonly template?: string };
type HeaderSettings = { readonly lineEndings?: 'unix' | 'windows' };

interface HeaderConfig {
	readonly style: CommentStyle;
	/** What each line of the header must be: the exact text, or a pattern. */
	readonly lines: readonly (string | RegExp)[];
	/** The text of each header line that a fix writes, if every line has one. */
	readonly fixLines: readonly string[] | undefined;
	/** The text of each header line that is added to a file without a header, even if some line has no text. */
	readonly addLines: readonly string[];
	readonly newlines: number;
	readonly eol: string;
}

function isPattern(value: unknown): value is Exclude<HeaderLine, string> {
	return typeof value === 'object' && value !== null && Object.hasOwn(value, 'pattern');
}

function isSettings(value: unknown): value is HeaderSettings {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && !isPattern(value);
}

/**
 * Reads the options `<'block' | 'line'>, <header>[, <newlines>][, { lineEndings }]`, where the header is a string, a
 * pattern object, or an array of lines that are strings or pattern objects.
 */
function parseOptions(options: readonly unknown[]): HeaderConfig {
	const settings = isSettings(options.at(-1)) ? options.at(-1) as HeaderSettings : undefined;
	const [style, header] = options;
	if (typeof style !== 'string' || header === undefined || isSettings(header)) {
		throw new Error('header: only the options `<\'block\' | \'line\'>, <header>[, <newlines>][, <settings>]` are supported');
	}

	// Like eslint-plugin-header, a pattern without a template is added as the text of the pattern object.
	const addLine = (line: HeaderLine) => isPattern(line) ? line.template || String(line) : line;
	let lines: (string | RegExp)[];
	let addLines: string[];
	if (Array.isArray(header)) {
		lines = header.map((line: HeaderLine) => isPattern(line) ? new RegExp(line.pattern) : line);
		addLines = header.map(addLine);
	} else if (isPattern(header)) {
		lines = [new RegExp(header.pattern)];
		addLines = [addLine(header)];
	} else {
		lines = String(header).split(/\r?\n/);
		addLines = lines as string[];
	}
	const canFix = Array.isArray(header) || isPattern(header)
		? [header].flat().every((line: HeaderLine) => !isPattern(line) || line.template)
		: true;

	return {
		style: style.toLowerCase() as CommentStyle,
		lines,
		fixLines: canFix ? addLines : undefined,
		addLines,
		// A third option that is not a number (the settings) counts as no line breaks.
		newlines: options.length > 2 ? (typeof options[2] === 'number' ? options[2] : 0) : 1,
		eol: settings?.lineEndings === 'unix' ? '\n' : settings?.lineEndings === 'windows' ? '\r\n' : EOL,
	};
}

function matches(actual: string | undefined, expected: string | RegExp): boolean {
	return typeof expected === 'string' ? actual === expected : expected.test(String(actual));
}

/** Whether the text after an optional shebang line starts with a comment. */
function startsWithComment(text: string): boolean {
	if (text.startsWith('#!')) {
		const lineBreak = /\r\n|\r|\n/.exec(text);
		if (lineBreak) {
			text = text.slice(lineBreak.index + lineBreak[0].length);
		}
	}
	return text.startsWith('/*') || text.startsWith('//');
}

/** Whether the text starts with at least `count` line breaks. */
function startsWithLineBreaks(text: string, count: number): boolean {
	for (let i = 0; i < count; i++) {
		const lineBreak = /^(\r\n|\r|\n)/.exec(text);
		if (!lineBreak) {
			return false;
		}
		text = text.slice(lineBreak[0].length);
	}
	return true;
}

/**
 * The comments that form the header: the first comment if it is a block comment, otherwise the first line comments
 * that are separated only by single line breaks.
 */
function leadingComments(text: string, comments: readonly Comment[]): Comment[] {
	const all = comments.filter(comment => comment.type !== 'Shebang');
	if (all[0].type === 'Block') {
		return [all[0]];
	}
	let count = 1;
	while (count < all.length && /^(\r\n|\r|\n)$/.test(text.slice(all[count - 1].range[1], all[count].range[0]))) {
		count++;
	}
	return all.slice(0, count);
}

function commentText(style: CommentStyle, lines: readonly string[], eol: string, newlines: number): string {
	const body = style === 'block' ? `/*${lines.join(eol)}*/` : `//${lines.join(`${eol}//`)}`;
	return body + eol.repeat(newlines);
}

/**
 * The `header` rule of `eslint-plugin-header`: files must start with the configured header comment, followed by the
 * configured number of line breaks. Fixes add the header, or replace the leading comments with it.
 */
export default new class Header implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'layout',
		fixable: 'whitespace',
		schema: false,
	};

	create(context: Context): Visitor {
		const config = parseOptions(context.options);
		const { style, lines, newlines, eol } = config;
		const sourceCode = context.sourceCode;

		return {
			Program(node: ESTree.Program) {
				const text = sourceCode.text;
				const report = (message: string, fixLines: readonly string[] | undefined, replace: readonly Comment[] | undefined) => {
					context.report({
						loc: node.loc,
						message,
						data: { commentType: style },
						fix: fixLines && ((fixer: Fixer) => {
							const header = commentText(style, fixLines, eol, newlines);
							if (!replace) {
								return fixer.insertTextBefore(node, header);
							}
							const start = replace[0].range[0];
							let end = replace[replace.length - 1].range[1];
							if (text[end] === eol) {
								end += eol.length;
							}
							return fixer.replaceTextRange([start, end], header);
						}),
					});
				};

				if (!startsWithComment(text)) {
					report('missing header', config.addLines, undefined);
					return;
				}

				const comments = leadingComments(text, sourceCode.getAllComments());
				const fixLines = config.fixLines;
				if (comments[0].type.toLowerCase() !== style) {
					report('header should be a {{commentType}} comment', fixLines, comments);
					return;
				}

				let afterHeader: number;
				if (style === 'line') {
					if (comments.length < lines.length || lines.some((line, i) => !matches(comments[i].value, line))) {
						report('incorrect header', fixLines, comments);
						return;
					}
					afterHeader = comments[lines.length - 1].range[1];
				} else {
					const actualLines = lines.length > 1 ? comments[0].value.split(/\r?\n/) : [comments[0].value];
					if (actualLines.length > lines.length || lines.some((line, i) => !matches(actualLines[i], line))) {
						// A multi-line block header is replaced as a single line that contains the line breaks.
						report('incorrect header', fixLines && lines.length > 1 ? [fixLines.join(eol)] : fixLines, comments);
						return;
					}
					afterHeader = comments[0].range[1];
				}

				if (!startsWithLineBreaks(text.substr(afterHeader, newlines * 2), newlines)) {
					report('no newline after header', fixLines, comments);
				}
			},
		};
	}
};
