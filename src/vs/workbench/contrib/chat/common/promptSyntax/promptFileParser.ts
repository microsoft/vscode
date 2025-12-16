/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../base/common/iterator.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { parse, YamlNode, YamlParseError, Position as YamlPosition } from '../../../../../base/common/yaml.js';
import { Range } from '../../../../../editor/common/core/range.js';

export class PromptFileParser {
	constructor() {
	}

	public parse(uri: URI, content: string): ParsedPromptFile {
		const linesWithEOL = splitLinesIncludeSeparators(content);
		if (linesWithEOL.length === 0) {
			return new ParsedPromptFile(uri, undefined, undefined);
		}
		let header: PromptHeader | undefined = undefined;
		let body: PromptBody | undefined = undefined;
		let bodyStartLine = 0;
		if (linesWithEOL[0].match(/^---[\s\r\n]*$/)) {
			let headerEndLine = linesWithEOL.findIndex((line, index) => index > 0 && line.match(/^---[\s\r\n]*$/));
			if (headerEndLine === -1) {
				headerEndLine = linesWithEOL.length;
				bodyStartLine = linesWithEOL.length;
			} else {
				bodyStartLine = headerEndLine + 1;
			}
			// range starts on the line after the ---, and ends at the beginning of the line that has the closing ---
			const range = new Range(2, 1, headerEndLine + 1, 1);
			header = new PromptHeader(range, linesWithEOL);
		}
		if (bodyStartLine < linesWithEOL.length) {
			// range starts  on the line after the ---, and ends at the beginning of line after the last line
			const range = new Range(bodyStartLine + 1, 1, linesWithEOL.length + 1, 1);
			body = new PromptBody(range, linesWithEOL, uri);
		}
		return new ParsedPromptFile(uri, header, body);
	}
}


export class ParsedPromptFile {
	constructor(public readonly uri: URI, public readonly header?: PromptHeader, public readonly body?: PromptBody) {
	}
}

export interface ParseError {
	readonly message: string;
	readonly range: Range;
	readonly code: string;
}

interface ParsedHeader {
	readonly node: YamlNode | undefined;
	readonly errors: ParseError[];
	readonly attributes: IHeaderAttribute[];
}

export namespace PromptHeaderAttributes {
	export const name = 'name';
	export const description = 'description';
	export const agent = 'agent';
	export const mode = 'mode';
	export const model = 'model';
	export const applyTo = 'applyTo';
	export const tools = 'tools';
	export const handOffs = 'handoffs';
	export const advancedOptions = 'advancedOptions';
	export const argumentHint = 'argument-hint';
	export const excludeAgent = 'excludeAgent';
	export const target = 'target';
	export const infer = 'infer';
}

export namespace GithubPromptHeaderAttributes {
	export const mcpServers = 'mcp-servers';
}

export enum Target {
	VSCode = 'vscode',
	GitHubCopilot = 'github-copilot'
}

export class PromptHeader {
	private _parsed: ParsedHeader | undefined;

	constructor(public readonly range: Range, private readonly linesWithEOL: string[]) {
	}

	private get _parsedHeader(): ParsedHeader {
		if (this._parsed === undefined) {
			const yamlErrors: YamlParseError[] = [];
			const lines = this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join('');
			const node = parse(lines, yamlErrors);
			const attributes = [];
			const errors: ParseError[] = yamlErrors.map(err => ({ message: err.message, range: this.asRange(err), code: err.code }));
			if (node) {
				if (node.type !== 'object') {
					errors.push({ message: 'Invalid header, expecting <key: value> pairs', range: this.range, code: 'INVALID_YAML' });
				} else {
					for (const property of node.properties) {
						attributes.push({
							key: property.key.value,
							range: this.asRange({ start: property.key.start, end: property.value.end }),
							value: this.asValue(property.value)
						});
					}
				}
			}
			this._parsed = { node, attributes, errors };
		}
		return this._parsed;
	}

	private asRange({ start, end }: { start: YamlPosition; end: YamlPosition }): Range {
		return new Range(this.range.startLineNumber + start.line, start.character + 1, this.range.startLineNumber + end.line, end.character + 1);
	}

	private asValue(node: YamlNode): IValue {
		switch (node.type) {
			case 'string':
				return { type: 'string', value: node.value, range: this.asRange(node) };
			case 'number':
				return { type: 'number', value: node.value, range: this.asRange(node) };
			case 'boolean':
				return { type: 'boolean', value: node.value, range: this.asRange(node) };
			case 'null':
				return { type: 'null', value: node.value, range: this.asRange(node) };
			case 'array':
				return { type: 'array', items: node.items.map(item => this.asValue(item)), range: this.asRange(node) };
			case 'object': {
				const properties = node.properties.map(property => ({ key: this.asValue(property.key) as IStringValue, value: this.asValue(property.value) }));
				return { type: 'object', properties, range: this.asRange(node) };
			}
		}
	}

	public get attributes(): IHeaderAttribute[] {
		return this._parsedHeader.attributes;
	}

	public getAttribute(key: string): IHeaderAttribute | undefined {
		return this._parsedHeader.attributes.find(attr => attr.key === key);
	}

	public get errors(): ParseError[] {
		return this._parsedHeader.errors;
	}

	private getStringAttribute(key: string): string | undefined {
		const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
		if (attribute?.value.type === 'string') {
			return attribute.value.value;
		}
		return undefined;
	}

	private getBooleanAttribute(key: string): boolean | undefined {
		const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
		if (attribute?.value.type === 'boolean') {
			return attribute.value.value;
		}
		return undefined;
	}

	public get name(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.name);
	}

	public get description(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.description);
	}

	public get agent(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.agent) ?? this.getStringAttribute(PromptHeaderAttributes.mode);
	}

	public get model(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.model);
	}

	public get applyTo(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.applyTo);
	}

	public get argumentHint(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.argumentHint);
	}

	public get target(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.target);
	}

	public get infer(): boolean | undefined {
		return this.getBooleanAttribute(PromptHeaderAttributes.infer);
	}

	public get tools(): string[] | undefined {
		const toolsAttribute = this._parsedHeader.attributes.find(attr => attr.key === PromptHeaderAttributes.tools);
		if (!toolsAttribute) {
			return undefined;
		}
		if (toolsAttribute.value.type === 'array') {
			const tools: string[] = [];
			for (const item of toolsAttribute.value.items) {
				if (item.type === 'string' && item.value) {
					tools.push(item.value);
				}
			}
			return tools;
		} else if (toolsAttribute.value.type === 'object') {
			const tools: string[] = [];
			const collectLeafs = ({ key, value }: { key: IStringValue; value: IValue }) => {
				if (value.type === 'boolean') {
					tools.push(key.value);
				} else if (value.type === 'object') {
					value.properties.forEach(collectLeafs);
				}
			};
			toolsAttribute.value.properties.forEach(collectLeafs);
			return tools;
		}
		return undefined;
	}

	public get handOffs(): IHandOff[] | undefined {
		const handoffsAttribute = this._parsedHeader.attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
		if (!handoffsAttribute) {
			return undefined;
		}
		if (handoffsAttribute.value.type === 'array') {
			// Array format: list of objects: { agent, label, prompt, send?, showContinueOn? }
			const handoffs: IHandOff[] = [];
			for (const item of handoffsAttribute.value.items) {
				if (item.type === 'object') {
					let agent: string | undefined;
					let label: string | undefined;
					let prompt: string | undefined;
					let send: boolean | undefined;
					let showContinueOn: boolean | undefined;
					for (const prop of item.properties) {
						if (prop.key.value === 'agent' && prop.value.type === 'string') {
							agent = prop.value.value;
						} else if (prop.key.value === 'label' && prop.value.type === 'string') {
							label = prop.value.value;
						} else if (prop.key.value === 'prompt' && prop.value.type === 'string') {
							prompt = prop.value.value;
						} else if (prop.key.value === 'send' && prop.value.type === 'boolean') {
							send = prop.value.value;
						} else if (prop.key.value === 'showContinueOn' && prop.value.type === 'boolean') {
							showContinueOn = prop.value.value;
						}
					}
					if (agent && label && prompt !== undefined) {
						const handoff: IHandOff = {
							agent,
							label,
							prompt,
							...(send !== undefined ? { send } : {}),
							...(showContinueOn !== undefined ? { showContinueOn } : {})
						};
						handoffs.push(handoff);
					}
				}
			}
			return handoffs;
		}
		return undefined;
	}
}

export interface IHandOff {
	readonly agent: string;
	readonly label: string;
	readonly prompt: string;
	readonly send?: boolean;
	readonly showContinueOn?: boolean; // treated exactly like send (optional boolean)
}

export interface IHeaderAttribute {
	readonly range: Range;
	readonly key: string;
	readonly value: IValue;
}

export interface IStringValue { readonly type: 'string'; readonly value: string; readonly range: Range }
export interface INumberValue { readonly type: 'number'; readonly value: number; readonly range: Range }
export interface INullValue { readonly type: 'null'; readonly value: null; readonly range: Range }
export interface IBooleanValue { readonly type: 'boolean'; readonly value: boolean; readonly range: Range }

export interface IArrayValue {
	readonly type: 'array';
	readonly items: readonly IValue[];
	readonly range: Range;
}

export interface IObjectValue {
	readonly type: 'object';
	readonly properties: { key: IStringValue; value: IValue }[];
	readonly range: Range;
}

export type IValue = IStringValue | INumberValue | IBooleanValue | IArrayValue | IObjectValue | INullValue;


interface ParsedBody {
	readonly fileReferences: readonly IBodyFileReference[];
	readonly variableReferences: readonly IBodyVariableReference[];
	readonly bodyOffset: number;
}

export class PromptBody {
	private _parsed: ParsedBody | undefined;

	constructor(public readonly range: Range, private readonly linesWithEOL: string[], public readonly uri: URI) {
	}

	public get fileReferences(): readonly IBodyFileReference[] {
		return this.getParsedBody().fileReferences;
	}

	public get variableReferences(): readonly IBodyVariableReference[] {
		return this.getParsedBody().variableReferences;
	}

	public get offset(): number {
		return this.getParsedBody().bodyOffset;
	}

	private getParsedBody(): ParsedBody {
		if (this._parsed === undefined) {
			const markdownLinkRanges: Range[] = [];
			const fileReferences: IBodyFileReference[] = [];
			const variableReferences: IBodyVariableReference[] = [];
			const bodyOffset = Iterable.reduce(Iterable.slice(this.linesWithEOL, 0, this.range.startLineNumber - 1), (len, line) => line.length + len, 0);
			for (let i = this.range.startLineNumber - 1, lineStartOffset = bodyOffset; i < this.range.endLineNumber - 1; i++) {
				const line = this.linesWithEOL[i];
				// Match markdown links: [text](link)
				const linkMatch = line.matchAll(/\[(.*?)\]\((.+?)\)/g);
				for (const match of linkMatch) {
					const linkEndOffset = match.index + match[0].length - 1; // before the parenthesis
					const linkStartOffset = match.index + match[0].length - match[2].length - 1;
					const range = new Range(i + 1, linkStartOffset + 1, i + 1, linkEndOffset + 1);
					fileReferences.push({ content: match[2], range, isMarkdownLink: true });
					markdownLinkRanges.push(new Range(i + 1, match.index + 1, i + 1, match.index + match[0].length + 1));
				}
				// Match #file:<filePath> and #tool:<toolName>
				// Regarding the <toolName> pattern below, see also the variableReg regex in chatRequestParser.ts.
				const reg = /#file:(?<filePath>[^\s#]+)|#tool:(?<toolName>[\w_\-\.\/]+)/gi;
				const matches = line.matchAll(reg);
				for (const match of matches) {
					const fullMatch = match[0];
					const fullRange = new Range(i + 1, match.index + 1, i + 1, match.index + fullMatch.length + 1);
					if (markdownLinkRanges.some(mdRange => Range.areIntersectingOrTouching(mdRange, fullRange))) {
						continue;
					}
					const contentMatch = match.groups?.['filePath'] || match.groups?.['toolName'];
					if (!contentMatch) {
						continue;
					}
					const startOffset = match.index + fullMatch.length - contentMatch.length;
					const endOffset = match.index + fullMatch.length;
					const range = new Range(i + 1, startOffset + 1, i + 1, endOffset + 1);
					if (match.groups?.['filePath']) {
						fileReferences.push({ content: match.groups?.['filePath'], range, isMarkdownLink: false });
					} else if (match.groups?.['toolName']) {
						variableReferences.push({ name: match.groups?.['toolName'], range, offset: lineStartOffset + match.index });
					}
				}
				lineStartOffset += line.length;
			}
			this._parsed = { fileReferences: fileReferences.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), variableReferences, bodyOffset };
		}
		return this._parsed;
	}

	public getContent(): string {
		return this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join('');
	}

	public resolveFilePath(path: string): URI | undefined {
		try {
			if (path.startsWith('/')) {
				return this.uri.with({ path });
			} else if (path.match(/^[a-zA-Z]+:\//)) {
				return URI.parse(path);
			} else {
				const dirName = dirname(this.uri);
				return joinPath(dirName, path);
			}
		} catch {
			return undefined;
		}
	}
}

export interface IBodyFileReference {
	readonly content: string;
	readonly range: Range;
	readonly isMarkdownLink: boolean;
}

export interface IBodyVariableReference {
	readonly name: string;
	readonly range: Range;
	readonly offset: number;
}
