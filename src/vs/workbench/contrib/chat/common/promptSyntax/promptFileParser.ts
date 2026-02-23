/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../base/common/iterator.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { parse, YamlNode, YamlParseError } from '../../../../../base/common/yaml.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { PositionOffsetTransformer } from '../../../../../editor/common/core/text/positionToOffsetImpl.js';
import { Target } from './service/promptsService.js';

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
			header = new PromptHeader(range, uri, linesWithEOL);
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
	export const paths = 'paths';
	export const tools = 'tools';
	export const handOffs = 'handoffs';
	export const advancedOptions = 'advancedOptions';
	export const argumentHint = 'argument-hint';
	export const excludeAgent = 'excludeAgent';
	export const target = 'target';
	export const infer = 'infer';
	export const license = 'license';
	export const compatibility = 'compatibility';
	export const metadata = 'metadata';
	export const agents = 'agents';
	export const userInvokable = 'user-invokable';
	export const userInvocable = 'user-invocable';
	export const disableModelInvocation = 'disable-model-invocation';
}

export namespace GithubPromptHeaderAttributes {
	export const mcpServers = 'mcp-servers';
}

export namespace ClaudeHeaderAttributes {
	export const disallowedTools = 'disallowedTools';
}

export function isTarget(value: unknown): value is Target {
	return value === Target.VSCode || value === Target.GitHubCopilot || value === Target.Claude || value === Target.Undefined;
}

export class PromptHeader {
	private _parsed: ParsedHeader | undefined;

	constructor(public readonly range: Range, public readonly uri: URI, private readonly linesWithEOL: string[]) {
	}

	private get _parsedHeader(): ParsedHeader {
		if (this._parsed === undefined) {
			const yamlErrors: YamlParseError[] = [];
			const headerContent = this.linesWithEOL.slice(this.range.startLineNumber - 1, this.range.endLineNumber - 1).join('');
			const node = parse(headerContent, yamlErrors);
			const transformer = new PositionOffsetTransformer(headerContent);
			const asRange = ({ startOffset, endOffset }: { startOffset: number; endOffset: number }): Range => {
				const startPos = transformer.getPosition(startOffset), endPos = transformer.getPosition(endOffset);
				const headerDelta = this.range.startLineNumber - 1;
				return new Range(startPos.lineNumber + headerDelta, startPos.column, endPos.lineNumber + headerDelta, endPos.column);
			};
			const asValue = (node: YamlNode): IValue => {
				switch (node.type) {
					case 'scalar':
						return { type: 'scalar', value: node.value, range: asRange(node), format: node.format };
					case 'sequence':
						return { type: 'sequence', items: node.items.map(item => asValue(item)), range: asRange(node) };
					case 'map': {
						const properties = node.properties.map(property => ({ key: asValue(property.key) as IScalarValue, value: asValue(property.value) }));
						return { type: 'map', properties, range: asRange(node) };
					}
				}
			};

			const attributes = [];
			const errors: ParseError[] = yamlErrors.map(err => ({ message: err.message, range: asRange(err), code: err.code }));
			if (node) {
				if (node.type !== 'map') {
					errors.push({ message: 'Invalid header, expecting <key: value> pairs', range: this.range, code: 'INVALID_YAML' });
				} else {
					for (const property of node.properties) {
						attributes.push({
							key: property.key.value,
							range: asRange({ startOffset: property.key.startOffset, endOffset: property.value.endOffset }),
							value: asValue(property.value)
						});
					}
				}
			}
			this._parsed = { node, attributes, errors };
		}
		return this._parsed;
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
		if (attribute?.value.type === 'scalar') {
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

	public get model(): readonly string[] | undefined {
		return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.model);
	}

	public get applyTo(): string | undefined {
		return this.getStringAttribute(PromptHeaderAttributes.applyTo);
	}

	/**
	 * Gets the 'paths' attribute from the header.
	 * The `paths` field supports a list of glob patterns that scope the instruction
	 * to specific files (used by Claude rules). Returns a string array or undefined.
	 */
	public get paths(): readonly string[] | undefined {
		return this.getStringOrStringArrayAttribute(PromptHeaderAttributes.paths);
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
		let value = toolsAttribute.value;
		if (value.type === 'scalar') {
			value = parseCommaSeparatedList(value);
		}
		if (value.type === 'sequence') {
			const tools: string[] = [];
			for (const item of value.items) {
				if (item.type === 'scalar' && item.value) {
					tools.push(item.value);
				}
			}
			return tools;
		}
		return undefined;
	}

	public get handOffs(): IHandOff[] | undefined {
		const handoffsAttribute = this._parsedHeader.attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
		if (!handoffsAttribute) {
			return undefined;
		}
		if (handoffsAttribute.value.type === 'sequence') {
			// Array format: list of objects: { agent, label, prompt, send?, showContinueOn?, model? }
			const handoffs: IHandOff[] = [];
			for (const item of handoffsAttribute.value.items) {
				if (item.type === 'map') {
					let agent: string | undefined;
					let label: string | undefined;
					let prompt: string | undefined;
					let send: boolean | undefined;
					let showContinueOn: boolean | undefined;
					let model: string | undefined;
					for (const prop of item.properties) {
						if (prop.key.value === 'agent' && prop.value.type === 'scalar') {
							agent = prop.value.value;
						} else if (prop.key.value === 'label' && prop.value.type === 'scalar') {
							label = prop.value.value;
						} else if (prop.key.value === 'prompt' && prop.value.type === 'scalar') {
							prompt = prop.value.value;
						} else if (prop.key.value === 'send' && prop.value.type === 'scalar') {
							send = parseBoolean(prop.value);
						} else if (prop.key.value === 'showContinueOn' && prop.value.type === 'scalar') {
							showContinueOn = parseBoolean(prop.value);
						} else if (prop.key.value === 'model' && prop.value.type === 'scalar') {
							model = prop.value.value;
						}
					}
					if (agent && label && prompt !== undefined) {
						const handoff: IHandOff = {
							agent,
							label,
							prompt,
							...(send !== undefined ? { send } : {}),
							...(showContinueOn !== undefined ? { showContinueOn } : {}),
							...(model !== undefined ? { model } : {})
						};
						handoffs.push(handoff);
					}
				}
			}
			return handoffs;
		}
		return undefined;
	}

	private getStringArrayAttribute(key: string): string[] | undefined {
		const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
		if (!attribute) {
			return undefined;
		}
		if (attribute.value.type === 'sequence') {
			const result: string[] = [];
			for (const item of attribute.value.items) {
				if (item.type === 'scalar' && item.value) {
					result.push(item.value);
				}
			}
			return result;
		}
		return undefined;
	}

	private getStringOrStringArrayAttribute(key: string): readonly string[] | undefined {
		const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
		if (!attribute) {
			return undefined;
		}
		if (attribute.value.type === 'scalar') {
			return [attribute.value.value];
		}
		if (attribute.value.type === 'sequence') {
			const result: string[] = [];
			for (const item of attribute.value.items) {
				if (item.type === 'scalar') {
					result.push(item.value);
				}
			}
			return result;
		}
		return undefined;
	}

	public get agents(): string[] | undefined {
		return this.getStringArrayAttribute(PromptHeaderAttributes.agents);
	}

	public get userInvocable(): boolean | undefined {
		// TODO: user-invokable is deprecated, remove later and only keep user-invocable
		return this.getBooleanAttribute(PromptHeaderAttributes.userInvocable) ?? this.getBooleanAttribute(PromptHeaderAttributes.userInvokable);
	}

	public get disableModelInvocation(): boolean | undefined {
		return this.getBooleanAttribute(PromptHeaderAttributes.disableModelInvocation);
	}

	private getBooleanAttribute(key: string): boolean | undefined {
		const attribute = this._parsedHeader.attributes.find(attr => attr.key === key);
		if (attribute?.value.type === 'scalar') {
			return parseBoolean(attribute.value);
		}
		return undefined;
	}
}

function parseBoolean(stringValue: IScalarValue): boolean | undefined {
	if (stringValue.value === 'true') {
		return true;
	} else if (stringValue.value === 'false') {
		return false;
	}
	return undefined;
}

export interface IHandOff {
	readonly agent: string;
	readonly label: string;
	readonly prompt: string;
	readonly send?: boolean;
	readonly showContinueOn?: boolean; // treated exactly like send (optional boolean)
	readonly model?: string; // qualified model name to switch to (e.g., "GPT-5 (copilot)")
}

export interface IHeaderAttribute {
	readonly range: Range;
	readonly key: string;
	readonly value: IValue;
}

export interface IScalarValue {
	readonly type: 'scalar';
	readonly value: string;
	readonly range: Range;
	readonly format: 'single' | 'double' | 'none' | 'literal' | 'folded';
}

export interface ISequenceValue {
	readonly type: 'sequence';
	readonly items: readonly IValue[];
	readonly range: Range;
}

export interface IMapValue {
	readonly type: 'map';
	readonly properties: { key: IScalarValue; value: IValue }[];
	readonly range: Range;
}

export type IValue = IScalarValue | ISequenceValue | IMapValue;


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
					if (match.index > 0 && line[match.index - 1] === '!') {
						continue; // skip image links
					}
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

/**
 * Parses a comma-separated list of values into an array of strings.
 * Values can be unquoted or quoted (single or double quotes).
 *
 * @param input A string containing comma-separated values
 * @returns An ISequenceValue containing the parsed values and their ranges
 */
export function parseCommaSeparatedList(stringValue: IScalarValue): ISequenceValue {
	const result: IScalarValue[] = [];
	const input = stringValue.value;
	const positionOffset = stringValue.range.getStartPosition();
	let pos = 0;
	const isWhitespace = (char: string): boolean => char === ' ' || char === '\t';

	while (pos < input.length) {
		// Skip leading whitespace
		while (pos < input.length && isWhitespace(input[pos])) {
			pos++;
		}

		if (pos >= input.length) {
			break;
		}

		const startPos = pos;
		let value = '';
		let endPos: number;
		let quoteStyle: 'single' | 'double' | 'none';

		const char = input[pos];
		if (char === '"' || char === `'`) {
			// Quoted string
			const quote = char;
			pos++; // Skip opening quote

			while (pos < input.length && input[pos] !== quote) {
				value += input[pos];
				pos++;
			}
			endPos = pos + 1; // Include closing quote in the range

			if (pos < input.length) {
				pos++;
			}
			quoteStyle = quote === '"' ? 'double' : 'single';
		} else {
			// Unquoted string - read until comma or end
			const startPos = pos;
			while (pos < input.length && input[pos] !== ',') {
				value += input[pos];
				pos++;
			}
			value = value.trimEnd();
			endPos = startPos + value.length;
			quoteStyle = 'none';
		}

		result.push({ type: 'scalar', value: value, range: new Range(positionOffset.lineNumber, positionOffset.column + startPos, positionOffset.lineNumber, positionOffset.column + endPos), format: quoteStyle });

		// Skip whitespace after value
		while (pos < input.length && isWhitespace(input[pos])) {
			pos++;
		}

		// Skip comma if present
		if (pos < input.length && input[pos] === ',') {
			pos++;
		}
	}

	return { type: 'sequence', items: result, range: stringValue.range };
}


