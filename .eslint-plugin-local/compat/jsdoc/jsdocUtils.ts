/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Comment, Context, ESTree, Fix, Fixer, Location, SourceCode, Token, Visitor } from '@oxlint/plugins';

// Shared infrastructure of the `jsdoc-js` rules: a parser of JSDoc blocks into lines of tokens, which can be edited and
// printed again for fixes, and the lookup of the JSDoc block that documents a node. Both follow the behavior of
// `eslint-plugin-jsdoc` with its default settings (`mode: 'typescript'`, `minLines: 0`, `maxLines: 1`).

/**
 * The parts of one line of a JSDoc block. Printing them in order gives the line back.
 */
export interface Tokens {
	start: string;
	delimiter: string;
	postDelimiter: string;
	tag: string;
	postTag: string;
	type: string;
	postType: string;
	name: string;
	postName: string;
	description: string;
	end: string;
	lineEnd: string;
}

/**
 * One line of a JSDoc block, numbered from 0 for the line on which the block starts.
 */
export interface Line {
	number: number;
	source: string;
	tokens: Tokens;
}

/**
 * A problem that the parser found in a tag.
 */
export interface Problem {
	code: string;
	message: string;
	line: number;
	critical: boolean;
}

/**
 * An inline tag such as `{@link Foo}`.
 */
export interface InlineTag {
	tag: string;
	namepathOrURL: string;
	text: string;
}

/**
 * A block tag such as `@param {string} name description`, with the lines of the block it spans.
 */
export interface Spec {
	tag: string;
	name: string;
	type: string;
	optional: boolean;
	default?: string;
	description: string;
	problems: Problem[];
	source: Line[];
	inlineTags: InlineTag[];
}

/**
 * A parsed JSDoc block.
 */
export interface Block {
	description: string;
	tags: Spec[];
	source: Line[];
	problems: Problem[];
	inlineTags: InlineTag[];
}

/**
 * Loose view of an AST node, token or comment, for walking the parents of nodes of any type.
 */
export interface LooseNode {
	readonly type: string;
	readonly parent?: LooseNode | null;
	readonly range: [number, number];
	readonly loc: Location;
	readonly [key: string]: unknown;
}

export function loose(node: ESTree.Node | Comment | Token): LooseNode {
	return node as unknown as LooseNode;
}

export function looseChild(node: LooseNode | null | undefined, key: string): LooseNode | undefined {
	const value = node?.[key];
	return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseNode : undefined;
}

export function looseChildren(node: LooseNode | null | undefined, key: string): LooseNode[] | undefined {
	const value = node?.[key];
	return Array.isArray(value) ? value as LooseNode[] : undefined;
}

export function nameOf(node: LooseNode | null | undefined): string | undefined {
	const name = node?.name;
	return typeof name === 'string' ? name : undefined;
}

//#region Parsing

/**
 * Tags whose text has no `{type}`.
 */
const noTypeTags = new Set(['default', 'defaultvalue', 'description', 'example', 'file', 'fileoverview', 'license', 'overview', 'see', 'summary']);

/**
 * Tags whose text has no name.
 */
const noNameTags = new Set(['access', 'author', 'default', 'defaultvalue', 'description', 'example', 'exception', 'file', 'fileoverview', 'kind', 'license', 'overview', 'return', 'returns', 'since', 'summary', 'throws', 'version', 'variation']);

export function seedTokens(tokens: Partial<Tokens> = {}): Tokens {
	return { start: '', delimiter: '', postDelimiter: '', tag: '', postTag: '', type: '', postType: '', name: '', postName: '', description: '', end: '', lineEnd: '', ...tokens };
}

function splitLeadingSpace(text: string): [string, string] {
	const match = /^\s+/.exec(text);
	return match ? [match[0], text.slice(match[0].length)] : ['', text];
}

/**
 * Splits the text of a block comment (including its delimiters) into lines of tokens.
 */
function parseLines(text: string): Line[] {
	const lines: Line[] = [];
	const sourceLines = text.split('\n');
	for (let number = 0; number < sourceLines.length; number++) {
		const source = sourceLines[number];
		const tokens = seedTokens();
		let rest = source;
		const crs = /\r+$/.exec(rest);
		if (crs) {
			tokens.lineEnd = crs[0];
			rest = rest.slice(0, -crs[0].length);
		}
		[tokens.start, rest] = splitLeadingSpace(rest);
		if (number === 0) {
			if (!rest.startsWith('/**') || rest.startsWith('/***')) {
				return [];
			}
			tokens.delimiter = '/**';
			rest = rest.slice(3);
			[tokens.postDelimiter, rest] = splitLeadingSpace(rest);
		}
		const isClosed = rest.trimEnd().endsWith('*/');
		if (tokens.delimiter === '' && rest.startsWith('*') && !rest.startsWith('*/')) {
			tokens.delimiter = '*';
			rest = rest.slice(1);
			[tokens.postDelimiter, rest] = splitLeadingSpace(rest);
		}
		if (isClosed) {
			const trimmed = rest.trimEnd();
			tokens.end = rest.slice(trimmed.length - 2);
			rest = trimmed.slice(0, -2);
		}
		tokens.description = rest;
		lines.push({ number, source, tokens });
		if (isClosed) {
			return lines;
		}
	}
	return [];
}

function tokenizeTag(spec: Spec): void {
	const { tokens } = spec.source[0];
	const match = /\s*(@(\S+))(\s*)/.exec(tokens.description);
	if (!match) {
		spec.problems.push({ code: 'spec:tag:prefix', message: 'tag should start with "@" symbol', line: spec.source[0].number, critical: true });
		return;
	}
	if (match[1].includes('/')) {
		return;
	}
	tokens.tag = match[1];
	tokens.postTag = match[3];
	tokens.description = tokens.description.slice(match[0].length);
	spec.tag = match[2];
}

function tokenizeType(spec: Spec): void {
	let curlies = 0;
	const lines: [Tokens, string][] = [];
	let descriptionBegun = false;
	let first = true;
	for (const { tokens } of spec.source) {
		if (!descriptionBegun) {
			if (!tokens.description.trim()) {
				continue;
			}
			descriptionBegun = true;
		}
		if (first && tokens.description[0] !== '{') {
			return;
		}
		first = false;
		let type = '';
		for (const ch of tokens.description) {
			if (ch === '{') {
				curlies++;
			}
			if (ch === '}') {
				curlies--;
			}
			type += ch;
			if (curlies === 0) {
				break;
			}
		}
		lines.push([tokens, type]);
		if (curlies === 0) {
			break;
		}
	}
	if (!descriptionBegun) {
		return;
	}
	if (curlies !== 0) {
		spec.problems.push({ code: 'spec:type:unpaired-curlies', message: 'unpaired curlies', line: spec.source[0].number, critical: true });
		return;
	}
	const parts: string[] = [];
	const offset = lines[0][0].postDelimiter.length;
	lines.forEach(([tokens, type], i) => {
		tokens.type = type;
		if (i > 0) {
			tokens.type = tokens.postDelimiter.slice(offset) + type;
			tokens.postDelimiter = tokens.postDelimiter.slice(0, offset);
		}
		[tokens.postType, tokens.description] = splitLeadingSpace(tokens.description.slice(type.length));
		parts.push(tokens.type);
	});
	parts[0] = parts[0].slice(1);
	parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
	spec.type = parts.join('\n');
}

function lastTypeLine(lines: readonly Line[]): number {
	let result = 0;
	lines.forEach((line, i) => {
		if (line.tokens.type !== '') {
			result = i;
		}
	});
	return result;
}

function isQuoted(text: string | undefined): boolean {
	return !!text && text.startsWith('"') && text.endsWith('"');
}

function tokenizeName(spec: Spec): void {
	let index = lastTypeLine(spec.source);
	let tokens = spec.source[index].tokens;
	if (spec.type) {
		while (spec.source[index]) {
			tokens = spec.source[index].tokens;
			if (tokens.description.trim()) {
				break;
			}
			index++;
		}
	}
	const source = tokens.description.trimStart();
	const quotedGroups = source.split('"');
	if (quotedGroups.length > 1 && quotedGroups[0] === '' && quotedGroups.length % 2 === 1) {
		spec.name = quotedGroups[1];
		tokens.name = `"${quotedGroups[1]}"`;
		[tokens.postName, tokens.description] = splitLeadingSpace(source.slice(tokens.name.length));
		return;
	}

	let brackets = 0;
	let name = '';
	for (const ch of source) {
		if (brackets === 0 && /^\s+$/.test(ch)) {
			break;
		}
		if (ch === '[') {
			brackets++;
		}
		if (ch === ']') {
			brackets--;
		}
		name += ch;
	}
	const problem = (code: string, message: string) => spec.problems.push({ code, message, line: spec.source[0].number, critical: true });
	if (brackets !== 0) {
		problem('spec:name:unpaired-brackets', 'unpaired brackets');
		return;
	}

	const nameToken = name;
	let optional = false;
	let defaultValue: string | undefined;
	if (name[0] === '[' && name[name.length - 1] === ']') {
		optional = true;
		name = name.slice(1, -1);
		const parts = name.split('=');
		name = parts[0].trim();
		if (parts[1] !== undefined) {
			defaultValue = parts.slice(1).join('=').trim();
		}
		if (name === '') {
			problem('spec:name:empty-name', 'empty name');
			return;
		}
		if (defaultValue === '') {
			problem('spec:name:empty-default', 'empty default value');
			return;
		}
		if (defaultValue !== undefined && !isQuoted(defaultValue) && /=(?!>)/.test(defaultValue)) {
			problem('spec:name:invalid-default', 'invalid default value syntax');
			return;
		}
	}
	if (!optional) {
		const eqIndex = name.search(/=(?!>)/);
		if (eqIndex !== -1) {
			const preEqual = name.slice(0, eqIndex).trim();
			const postEqual = name.slice(eqIndex + 1).trim();
			if (preEqual === '') {
				problem('spec:name:empty-name', 'empty name');
				return;
			}
			if (postEqual === '') {
				problem('spec:name:empty-default', 'empty default value');
				return;
			}
			if (/^[\p{ID_Start}$_.](?:[\p{ID_Continue}$_.]|\u200c|\u200d)*=/u.test(name)) {
				if (!isQuoted(postEqual) && /=(?!>)/.test(postEqual)) {
					problem('spec:name:invalid-default', 'invalid default value syntax');
					return;
				}
				name = preEqual;
				defaultValue = postEqual;
			}
		}
	}
	spec.optional = optional;
	spec.name = name;
	tokens.name = nameToken;
	if (defaultValue !== undefined) {
		spec.default = defaultValue;
	}
	[tokens.postName, tokens.description] = splitLeadingSpace(source.slice(tokens.name.length));
}

/**
 * The name of `@template` is a list of names, optionally with a default in brackets.
 */
function tokenizeTemplateName(spec: Spec): void {
	const { tokens } = spec.source[0];
	const remainder = tokens.description;
	let pos: number;
	if (remainder.startsWith('[') && remainder.includes(']')) {
		const endingBracketPos = remainder.lastIndexOf(']');
		pos = remainder.slice(endingBracketPos).search(/(?<![\s,])\s/);
		if (pos > -1) {
			pos += endingBracketPos;
		}
	} else {
		pos = remainder.search(/(?<![\s,])\s/);
	}
	const name = pos === -1 ? remainder : remainder.slice(0, pos);
	let postName = '';
	let description = '';
	let lineEnd = '';
	if (pos > -1) {
		const match = /(\s*)([^\r]*)(\r)?/.exec(remainder.slice(pos))!;
		postName = match[1];
		description = match[2];
		lineEnd = match[3] ?? '';
	}
	spec.optional = /^\[[^=]*=[^\]]*\]/.test(name);
	spec.name = name;
	tokens.name = name;
	tokens.postName = postName;
	tokens.description = description;
	tokens.lineEnd = lineEnd;
}

function joinTagDescription(source: readonly Line[]): string {
	let lines = source;
	if (lines.length === 0) {
		return '';
	}
	if (lines[0].tokens.description === '' && lines[0].tokens.delimiter === '/**') {
		lines = lines.slice(1);
	}
	const last = lines[lines.length - 1];
	if (last !== undefined && last.tokens.description === '' && last.tokens.end.endsWith('*/')) {
		lines = lines.slice(0, -1);
	}
	lines = lines.slice(lastTypeLine(lines));
	return lines.map(({ tokens }) => (tokens.delimiter === '' ? tokens.start : tokens.postDelimiter.slice(1)) + tokens.description).join('\n');
}

function parseSpec(source: Line[]): Spec {
	const spec: Spec = { tag: '', name: '', type: '', optional: false, description: '', problems: [], source, inlineTags: [] };
	const isCritical = () => spec.problems[spec.problems.length - 1]?.critical;
	tokenizeTag(spec);
	if (isCritical()) {
		return spec;
	}
	if (!noTypeTags.has(spec.tag)) {
		tokenizeType(spec);
		if (isCritical()) {
			return spec;
		}
	}
	if (spec.tag === 'template') {
		tokenizeTemplateName(spec);
	} else if (!noNameTags.has(spec.tag) && !(spec.tag === 'see' && /\{@link.+?\}/.test(spec.source[0].source))) {
		tokenizeName(spec);
		if (isCritical()) {
			return spec;
		}
	}
	spec.description = joinTagDescription(spec.source);
	return spec;
}

const prefixedInlineTag = /(?:\[(?<text>(?:[^\\\]]|\\[\s\S])+)\])\{@(?<tag>[^}\s]+)\s?(?<namepathOrURL>[^}\s|]*)\}/gu;
const suffixedInlineTag = /(?<!\])\{@(?<tag>[^}\s]+)\s?(?<namepathOrURL>[^}\s|]*)\s*(?<separator>[\s|])?\s*(?<text>(?:[^\\}]|\\[\s\S])*)\}/gu;

function parseInlineTags(description: string): InlineTag[] {
	return [...description.matchAll(prefixedInlineTag), ...description.matchAll(suffixedInlineTag)].map(match => ({
		tag: match.groups!.tag,
		namepathOrURL: match.groups!.namepathOrURL,
		text: match.groups!.text ?? '',
	}));
}

/**
 * Parses the text of a JSDoc block comment, including its delimiters.
 */
export function parseJSDoc(text: string): Block {
	const source = parseLines(text);
	const sections: Line[][] = [[]];
	let isFenced = false;
	for (const line of source) {
		if (/^@[^\s/]+(?=\s|$)/.test(line.tokens.description) && !isFenced) {
			sections.push([line]);
		} else {
			sections[sections.length - 1].push(line);
		}
		if (line.tokens.description.split('```').length % 2 === 0) {
			isFenced = !isFenced;
		}
	}
	const tags = sections.slice(1).map(parseSpec);
	const description = sections[0].map(line => line.tokens.description.trim()).filter(text => text !== '').join(' ');
	for (const tag of tags) {
		tag.inlineTags = parseInlineTags(tag.description);
	}
	return {
		description,
		tags,
		source,
		problems: tags.flatMap(tag => tag.problems),
		inlineTags: parseInlineTags(description),
	};
}

/**
 * Prints a block, as edited by a fix, back to text.
 */
export function stringifyJSDoc(block: Block): string {
	return block.source.map(({ tokens: t }) => t.start + t.delimiter + t.postDelimiter + t.tag + t.postTag + t.type + t.postType + t.name + t.postName + t.description + t.end + t.lineEnd).join('\n');
}

//#endregion

//#region Reporting

/**
 * A JSDoc comment with its parsed block, for rules that report on it.
 */
export class JSDoc {

	readonly block: Block;
	readonly context: Context;
	readonly comment: Comment;

	constructor(context: Context, comment: Comment) {
		this.context = context;
		this.comment = comment;
		this.block = parseJSDoc(context.sourceCode.getText(comment));
	}

	/**
	 * Reports a problem on the line `line` of the block (counted from 0), or on the whole comment. A fix edits
	 * `this.block`, which is printed at once, so that the fixes of later problems in the same block include the edit.
	 */
	report(message: string, line?: number, edit?: () => void): void {
		const loc = line === undefined
			? this.comment.loc
			: { start: { line: this.comment.loc.start.line + line, column: 0 }, end: { line: this.comment.loc.start.line + line, column: 0 } };
		let fix: ((fixer: Fixer) => Fix) | undefined;
		if (edit) {
			edit();
			fix = this.createFix(stringifyJSDoc(this.block));
		}
		this.context.report({ message, loc, node: this.comment, fix });
	}

	private createFix(replacement: string): (fixer: Fixer) => Fix {
		const range = this.comment.range;
		if (replacement) {
			return fixer => fixer.replaceTextRange(range, replacement);
		}
		const text = this.context.sourceCode.text;
		const lastLineBreak = text.slice(0, range[0]).search(/\n[ \t]*$/);
		if (lastLineBreak > -1) {
			return fixer => fixer.removeRange([lastLineBreak, range[1]]);
		}
		return fixer => fixer.removeRange(/\s/.test(text.charAt(range[1])) ? [range[0], range[1] + 1] : range);
	}
}

//#endregion

//#region Finding the JSDoc of a node

function isCommentToken(token: LooseNode): boolean {
	return token.type === 'Line' || token.type === 'Block' || token.type === 'Shebang';
}

export function getDecorator(node: LooseNode): LooseNode | undefined {
	return looseChildren(looseChild(node, 'declaration'), 'decorators')?.[0]
		|| looseChildren(node, 'decorators')?.[0]
		|| looseChildren(node.parent, 'decorators')?.[0];
}

function looksLikeExport(node: LooseNode): boolean {
	return node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportSpecifier';
}

const invokedExpressions = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression']);
const allowableCommentNodes = new Set(['AssignmentPattern', 'VariableDeclaration', 'ExpressionStatement', 'MethodDefinition', 'Property', 'ObjectProperty', 'ClassProperty', 'PropertyDefinition', 'ExportDefaultDeclaration', 'ReturnStatement']);

function tokenOrCommentBefore(sourceCode: SourceCode, node: LooseNode): LooseNode | null {
	const token = sourceCode.getTokenBefore(node as unknown as ESTree.Node, { includeComments: true });
	return token ? loose(token) : null;
}

function hasCommentsBefore(sourceCode: SourceCode, node: LooseNode): boolean {
	return sourceCode.getCommentsBefore(node as unknown as ESTree.Node).length > 0;
}

/**
 * Returns the node whose preceding comment documents `node`, e.g. the export declaration of an exported class, or the
 * variable declaration of a function expression.
 */
export function getReducedNode(node: LooseNode, sourceCode: SourceCode): LooseNode {
	let parent = node.parent;
	switch (node.type) {
		case 'TSInterfaceDeclaration':
		case 'TSTypeAliasDeclaration':
		case 'TSEnumDeclaration':
		case 'ClassDeclaration':
		case 'FunctionDeclaration':
			return parent && looksLikeExport(parent) ? parent : node;
		case 'TSDeclareFunction':
		case 'ClassExpression':
		case 'ObjectExpression':
		case 'ArrowFunctionExpression':
		case 'TSEmptyBodyFunctionExpression':
		case 'FunctionExpression': {
			if (!parent || invokedExpressions.has(parent.type)) {
				return node;
			}
			let token: LooseNode | null = node;
			do {
				token = tokenOrCommentBefore(sourceCode, token);
			} while (token && token.type === 'Punctuator' && token.value === '(');
			if (token && token.type === 'Block') {
				return node;
			}
			if (hasCommentsBefore(sourceCode, node)) {
				return node;
			}
			while (parent && !hasCommentsBefore(sourceCode, parent) && !/Function/.test(parent.type) && !allowableCommentNodes.has(parent.type)) {
				parent = parent.parent;
			}
			if (parent && parent.type !== 'FunctionDeclaration' && parent.type !== 'Program') {
				return parent.parent?.type === 'ExportNamedDeclaration' ? parent.parent : parent;
			}
			return node;
		}
		default:
			return node;
	}
}

/**
 * Returns the JSDoc comment (`/**` followed by whitespace) that ends on the line of `node` or on the line before it,
 * skipping line comments and decorators.
 */
function findJSDocComment(node: LooseNode, sourceCode: SourceCode): Comment | null {
	let current: LooseNode = node;
	let tokenBefore: LooseNode | null;
	let parenthesis: LooseNode | null = null;
	while (true) {
		current = getDecorator(current) ?? current;
		tokenBefore = tokenOrCommentBefore(sourceCode, current);
		if (tokenBefore && tokenBefore.type === 'Punctuator' && tokenBefore.value === '(') {
			parenthesis = tokenBefore;
			const [before] = sourceCode.getTokensBefore(current as unknown as ESTree.Node, { count: 2, includeComments: true });
			tokenBefore = before ? loose(before) : null;
		}
		if (!tokenBefore || !isCommentToken(tokenBefore)) {
			return null;
		}
		if (tokenBefore.type !== 'Line') {
			break;
		}
		current = tokenBefore;
	}
	const lines = current.loc.start.line - (parenthesis ?? tokenBefore).loc.end.line;
	if (tokenBefore.type === 'Block' && /^\*\s/.test(tokenBefore.value as string) && lines >= 0 && lines <= 1) {
		return tokenBefore as unknown as Comment;
	}
	return null;
}

const overloadMethodTypes = new Set(['MethodDefinition', 'TSAbstractMethodDefinition']);

function getMethodOverloadInfo(node: LooseNode) {
	const name = nameOf(looseChild(node, 'key'));
	if (!overloadMethodTypes.has(node.type) || node.computed || (node.kind !== 'method' && node.kind !== 'constructor') || !name) {
		return undefined;
	}
	return {
		bodyless: node.type === 'TSAbstractMethodDefinition' || looseChild(node, 'value')?.type === 'TSEmptyBodyFunctionExpression',
		kind: node.kind,
		name,
		static: Boolean(node.static),
	};
}

function getOverloadName(node: LooseNode, declarationTypes: readonly string[]): string | undefined {
	if (declarationTypes.includes(node.type)) {
		return nameOf(looseChild(node, 'id'));
	}
	if (node.type === 'ExportNamedDeclaration') {
		const declaration = looseChild(node, 'declaration');
		if (declaration && declarationTypes.includes(declaration.type)) {
			return nameOf(looseChild(declaration, 'id'));
		}
	}
	if (overloadMethodTypes.has(node.type) && !node.computed) {
		return nameOf(looseChild(node, 'key'));
	}
	return undefined;
}

function statementsOf(node: LooseNode | null | undefined): LooseNode[] | undefined {
	return node && ['BlockStatement', 'Program', 'StaticBlock', 'TSModuleBlock'].includes(node.type) ? looseChildren(node, 'body') : undefined;
}

function getPreviousOverloadSibling(node: LooseNode): LooseNode | undefined {
	const parent = node.parent;
	let child = node;
	let siblings: LooseNode[] | undefined;
	if (overloadMethodTypes.has(node.type) && parent?.type === 'ClassBody') {
		siblings = looseChildren(parent, 'body');
	} else if (parent?.type === 'ExportNamedDeclaration') {
		child = parent;
		siblings = statementsOf(parent.parent);
	} else {
		siblings = statementsOf(parent);
	}
	const index = siblings ? siblings.indexOf(child) : -1;
	return index > 0 ? siblings![index - 1] : undefined;
}

/**
 * Returns the JSDoc comment that documents `node`. With `checkOverloads`, an undocumented overload or implementation
 * of a function or method is documented by the comment of the overload before it.
 */
export function getJSDocComment(sourceCode: SourceCode, node: LooseNode, checkOverloads = false): Comment | null {
	const reduced = getReducedNode(node, sourceCode);
	const comment = findJSDocComment(reduced, sourceCode);
	if (!comment && checkOverloads) {
		const name = getOverloadName(reduced, ['TSDeclareFunction', 'FunctionDeclaration']);
		const previous = getPreviousOverloadSibling(reduced);
		if (previous && name && getOverloadName(previous, ['TSDeclareFunction']) === name) {
			const current = getMethodOverloadInfo(reduced);
			const before = previous && getMethodOverloadInfo(previous);
			if (!overloadMethodTypes.has(reduced.type) || (current && before?.bodyless && before.name === current.name && before.kind === current.kind && before.static === current.static)) {
				return getJSDocComment(sourceCode, previous, checkOverloads);
			}
		}
	}
	return comment;
}

/**
 * Returns a visitor that calls `check` on every JSDoc block comment (`/**` followed by whitespace) of a file: on the
 * comment of each node when the node is visited, which orders the problems and fixes as `eslint-plugin-jsdoc` does,
 * and on the other comments at the end.
 */
export function visitAllJSDocComments(context: Context, check: (jsdoc: JSDoc) => void): Visitor {
	const sourceCode = context.sourceCode;
	const checked = new Set<number>();
	return {
		'*:not(Program)'(node: ESTree.Node) {
			const comment = getJSDocComment(sourceCode, loose(node));
			if (comment && !checked.has(comment.range[0])) {
				checked.add(comment.range[0]);
				check(new JSDoc(context, comment));
			}
		},
		'Program:exit'() {
			for (const comment of sourceCode.getAllComments()) {
				if (comment.type === 'Block' && /^\*\s/.test(comment.value) && !checked.has(comment.range[0])) {
					check(new JSDoc(context, comment));
				}
			}
		},
	};
}

//#endregion
