/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../../base/common/iterator.js';
import { dirname, resolvePath } from '../../../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import { parse, YamlNode, YamlParseError } from '../../../../../../base/common/yaml.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { chatVariableLeader } from '../../chatParserTypes.js';

export class NewPromptsParser {
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

interface ParsedHeader {
	readonly node: YamlNode | undefined;
	readonly errors: YamlParseError[];
	readonly attributes: IHeaderAttribute[];
}

export class PromptHeader {
	private _parsed: ParsedHeader | undefined;

	constructor(public readonly range: Range, private readonly linesWithEOL: string[]) {
	}

	public getParsedHeader(): ParsedHeader {
		if (this._parsed === undefined) {
			const errors: YamlParseError[] = [];
			const lines = Iterable.map(Iterable.slice(this.linesWithEOL, this.range.startLineNumber - 1, this.range.endLineNumber - 1), line => line.replace(/[\r\n]+$/, ''));
			const node = parse(lines, errors);
			const attributes = [];
			if (node?.type === 'object') {
				for (const property of node.properties) {
					attributes.push({
						key: property.key.value,
						range: new Range(this.range.startLineNumber + property.key.start.line, property.key.start.character + 1, this.range.startLineNumber + property.value.end.line, property.value.end.character + 1)
					});
				}
			}
			this._parsed = { node, attributes, errors };
		}
		return this._parsed;
	}

	public get attributes(): IHeaderAttribute[] {
		return this.getParsedHeader().attributes;
	}
}
interface IHeaderAttribute {
	readonly range: Range;
	readonly key: string;
}


interface ParsedBody {
	readonly fileReferences: readonly IBodyFileReference[];
	readonly variableReferences: readonly IBodyVariableReference[];
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

	private getParsedBody(): ParsedBody {
		if (this._parsed === undefined) {
			const fileReferences: IBodyFileReference[] = [];
			const variableReferences: IBodyVariableReference[] = [];
			for (let i = this.range.startLineNumber - 1; i < this.range.endLineNumber - 1; i++) {
				const line = this.linesWithEOL[i];
				const linkMatch = line.matchAll(/\[(.+?)\]\((.+?)\)/g);
				for (const match of linkMatch) {
					const linkEndOffset = match.index + match[0].length - 1; // before the parenthesis
					const linkStartOffset = match.index + match[0].length - match[2].length - 1;
					const range = new Range(i + 1, linkStartOffset + 1, i + 1, linkEndOffset + 1);
					fileReferences.push({ content: match[2], range });
				}
				const reg = new RegExp(`${chatVariableLeader}([\\w]+:)?([^\\s#]*)`, 'g');
				const matches = line.matchAll(reg);
				for (const match of matches) {
					const varType = match[1];
					if (varType) {
						if (varType === 'file:') {
							const linkStartOffset = match.index + match[0].length - match[2].length;
							const linkEndOffset = match.index + match[0].length;
							const range = new Range(i + 1, linkStartOffset + 1, i + 1, linkEndOffset + 1);
							fileReferences.push({ content: match[2], range });
						}
					} else {
						const contentStartOffset = match.index + 1; // after the #
						const contentEndOffset = match.index + match[0].length;
						const range = new Range(i + 1, contentStartOffset + 1, i + 1, contentEndOffset + 1);
						variableReferences.push({ content: match[2], range });
					}
				}
			}
			this._parsed = { fileReferences: fileReferences.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), variableReferences };
		}
		return this._parsed;
	}

	public resolveFilePath(path: string): URI | undefined {
		try {
			if (path.startsWith('/')) {
				return URI.file(path);
			} else if (path.match(/^[a-zA-Z]:\\/)) {
				return URI.parse(path);
			} else {
				return resolvePath(dirname(this.uri), path);
			}
		} catch {
			return undefined;
		}
	}
}

interface IBodyFileReference {
	content: string;
	range: Range;
}

interface IBodyVariableReference {
	content: string;
	range: Range;
}


