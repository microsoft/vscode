/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as collections from 'vs/base/common/collections';

export class CodeSnippet implements ICodeSnippet {

	static fromTextmate(template:string):CodeSnippet {
		return TextMateSnippetParser.parse(template);
	}

	static fromEmmet(template: string): CodeSnippet {
		return EmmetSnippetParser.parse(template);
	}

	static fromInternal(template: string): CodeSnippet {
		return InternalFormatSnippetParser.parse(template);
	}

	public lines: string[] = [];
	public placeHolders: IPlaceHolder[] = [];
	public finishPlaceHolderIndex: number = -1;

	get isInsertOnly(): boolean {
		return this.placeHolders.length === 0;
	}

	get isSingleTabstopOnly(): boolean {
		if (this.placeHolders.length !== 1) {
			return false;
		}

		const [placeHolder] = this.placeHolders;
		if (placeHolder.value !== '' || placeHolder.occurences.length !== 1) {
			return false;
		}

		const [placeHolderRange] = placeHolder.occurences;
		if (!Range.isEmpty(placeHolderRange)) {
			return false;
		}
		return true;
	}

	private extractLineIndentation(str: string, maxColumn: number = Number.MAX_VALUE): string {
		var fullIndentation = strings.getLeadingWhitespace(str);

		if (fullIndentation.length > maxColumn - 1) {
			return fullIndentation.substring(0, maxColumn - 1);
		}

		return fullIndentation;
	}

	public bind(referenceLine: string, deltaLine: number, firstLineDeltaColumn: number, config: IIndentationNormalizer): ICodeSnippet {
		var resultLines: string[] = [];
		var resultPlaceHolders: IPlaceHolder[] = [];

		var referenceIndentation = this.extractLineIndentation(referenceLine, firstLineDeltaColumn + 1);
		var originalLine: string, originalLineIndentation: string, remainingLine: string, indentation: string;
		var i: number, len: number, j: number, lenJ: number;

		// Compute resultLines & keep deltaColumns as a reference for adjusting placeholders
		var deltaColumns: number[] = [];
		for (i = 0, len = this.lines.length; i < len; i++) {
			originalLine = this.lines[i];
			if (i === 0) {
				deltaColumns[i + 1] = firstLineDeltaColumn;
				resultLines[i] = originalLine;
			} else {
				originalLineIndentation = this.extractLineIndentation(originalLine);
				remainingLine = originalLine.substr(originalLineIndentation.length);
				indentation = config.normalizeIndentation(referenceIndentation + originalLineIndentation);
				deltaColumns[i + 1] = indentation.length - originalLineIndentation.length;
				resultLines[i] = indentation + remainingLine;
			}
		}

		// Compute resultPlaceHolders
		var originalPlaceHolder: IPlaceHolder, originalOccurence: editorCommon.IRange, resultOccurences: editorCommon.IRange[];
		for (i = 0, len = this.placeHolders.length; i < len; i++) {
			originalPlaceHolder = this.placeHolders[i];

			resultOccurences = [];
			for (j = 0, lenJ = originalPlaceHolder.occurences.length; j < lenJ; j++) {
				originalOccurence = originalPlaceHolder.occurences[j];

				resultOccurences.push({
					startLineNumber: originalOccurence.startLineNumber + deltaLine,
					startColumn: originalOccurence.startColumn + deltaColumns[originalOccurence.startLineNumber],
					endLineNumber: originalOccurence.endLineNumber + deltaLine,
					endColumn: originalOccurence.endColumn + deltaColumns[originalOccurence.endLineNumber]
				});
			}

			resultPlaceHolders.push({
				id: originalPlaceHolder.id,
				value: originalPlaceHolder.value,
				occurences: resultOccurences
			});
		}

		return {
			lines: resultLines,
			placeHolders: resultPlaceHolders,
			finishPlaceHolderIndex: this.finishPlaceHolderIndex
		};
	}
}


// --- parsing


interface ISnippetParser {
	parse(input: string): CodeSnippet;
}

interface IParsedLinePlaceHolderInfo {
	id: string;
	value: string;
	startColumn: number;
	endColumn: number;
}

interface IParsedLine {
	line: string;
	placeHolders: IParsedLinePlaceHolderInfo[];
}

const InternalFormatSnippetParser = new class implements ISnippetParser {

	private _lastGeneratedId: number;
	private _snippet: CodeSnippet;

	parse(template: string): CodeSnippet {
		this._lastGeneratedId = 0;
		this._snippet = new CodeSnippet();
		this.parseTemplate(template);
		return this._snippet;
	}

	private parseTemplate(template: string): void {

		var placeHoldersMap: collections.IStringDictionary<IPlaceHolder> = {};
		var i: number, len: number, j: number, lenJ: number, templateLines = template.split('\n');

		for (i = 0, len = templateLines.length; i < len; i++) {
			var parsedLine = this.parseLine(templateLines[i], (id: string) => {
				if (collections.contains(placeHoldersMap, id)) {
					return placeHoldersMap[id].value;
				}
				return '';
			});
			for (j = 0, lenJ = parsedLine.placeHolders.length; j < lenJ; j++) {
				var linePlaceHolder = parsedLine.placeHolders[j];
				var occurence = new Range(i + 1, linePlaceHolder.startColumn, i + 1, linePlaceHolder.endColumn);
				var placeHolder: IPlaceHolder;

				if (collections.contains(placeHoldersMap, linePlaceHolder.id)) {
					placeHolder = placeHoldersMap[linePlaceHolder.id];
				} else {
					placeHolder = {
						id: linePlaceHolder.id,
						value: linePlaceHolder.value,
						occurences: []
					};
					this._snippet.placeHolders.push(placeHolder);
					placeHoldersMap[linePlaceHolder.id] = placeHolder;
				}

				placeHolder.occurences.push(occurence);
			}

			this._snippet.lines.push(parsedLine.line);
		}

		// Named variables (e.g. {greeting} and {greeting:Hello}) are sorted first, followed by
		// tab-stops and numeric variables (e.g. $1, $2, ${3:foo}) which are sorted in ascending order
		this._snippet.placeHolders.sort((a, b) => {
			let nonIntegerId = (v: IPlaceHolder) => !(/^\d+$/).test(v.id);
			let isFinishPlaceHolder = (v: IPlaceHolder) => v.id === '' && v.value === '';

			// Sort finish placeholder last
			if (isFinishPlaceHolder(a)) {
				return 1;
			} else if (isFinishPlaceHolder(b)) {
				return -1;
			}

			// Sort named placeholders first
			if (nonIntegerId(a) && nonIntegerId(b)) {
				return 0;
			} else if (nonIntegerId(a)) {
				return -1;
			} else if (nonIntegerId(b)) {
				return 1;
			}

			if (a.id === b.id) {
				return 0;
			}

			return Number(a.id) < Number(b.id) ? -1 : 1;
		});

		if (this._snippet.placeHolders.length > 0 && this._snippet.placeHolders[this._snippet.placeHolders.length - 1].value === '') {
			this._snippet.finishPlaceHolderIndex = this._snippet.placeHolders.length - 1;
		}
	}

	private parseLine(line: string, findDefaultValueForId: (id: string) => string): IParsedLine {

		// Placeholder 0 is the entire line
		var placeHolderStack: { placeHolderId: string; placeHolderText: string; }[] = [{ placeHolderId: '', placeHolderText: '' }];
		var placeHolders: IParsedLinePlaceHolderInfo[] = [];

		var i = 0;
		var len = line.length;
		var resultIndex = 0;
		while (i < len) {

			var restOfLine = line.substr(i);

			// Look for the start of a placeholder {{
			if (/^{{/.test(restOfLine)) {
				i += 2;
				placeHolderStack.push({ placeHolderId: '', placeHolderText: '' });

				// Look for id
				var matches = restOfLine.match(/^{{(\w+):/);
				if (Array.isArray(matches) && matches.length === 2) {
					placeHolderStack[placeHolderStack.length - 1].placeHolderId = matches[1];
					i += matches[1].length + 1; // +1 to account for the : at the end of the id
				}

				continue;
			}

			// Look for the end of a placeholder. placeHolderStack[0] is the top-level line.
			if (placeHolderStack.length > 1 && /^}}/.test(restOfLine)) {
				i += 2;

				if (placeHolderStack[placeHolderStack.length - 1].placeHolderId.length === 0) {
					// This placeholder did not have an explicit id
					placeHolderStack[placeHolderStack.length - 1].placeHolderId = placeHolderStack[placeHolderStack.length - 1].placeHolderText;

					if (placeHolderStack[placeHolderStack.length - 1].placeHolderId === '_') {
						// This is just an empty tab stop
						placeHolderStack[placeHolderStack.length - 1].placeHolderId = 'TAB_STOP_' + String(++this._lastGeneratedId);
						placeHolderStack[placeHolderStack.length - 1].placeHolderText = '';
						--resultIndex; // Roll back one iteration of the result index as we made the text empty
					}
				}

				if (placeHolderStack[placeHolderStack.length - 1].placeHolderText.length === 0) {
					// This placeholder is empty or was a mirror
					var defaultValue = findDefaultValueForId(placeHolderStack[placeHolderStack.length - 1].placeHolderId);
					placeHolderStack[placeHolderStack.length - 1].placeHolderText = defaultValue;
					resultIndex += defaultValue.length;
				}

				placeHolders.push({
					id: placeHolderStack[placeHolderStack.length - 1].placeHolderId,
					value: placeHolderStack[placeHolderStack.length - 1].placeHolderText,
					startColumn: resultIndex + 1 - placeHolderStack[placeHolderStack.length - 1].placeHolderText.length,
					endColumn: resultIndex + 1
				});

				// Insert our text into the previous placeholder
				placeHolderStack[placeHolderStack.length - 2].placeHolderText += placeHolderStack[placeHolderStack.length - 1].placeHolderText;
				placeHolderStack.pop();
				continue;
			}

			// Look for escapes
			if (/^\\./.test(restOfLine)) {
				if (restOfLine.charAt(1) === '{' || restOfLine.charAt(1) === '}' || restOfLine.charAt(1) === '\\') {
					++i; // Skip the escape slash and take the character literally
				} else {
					// invalid escapes
					placeHolderStack[placeHolderStack.length - 1].placeHolderText += line.charAt(i);
					++resultIndex;
					++i;
				}
			}

			//This is an escape sequence or not a special character, just insert it
			placeHolderStack[placeHolderStack.length - 1].placeHolderText += line.charAt(i);
			++resultIndex;
			++i;
		}

		// Sort the placeholder in order of apperance:
		placeHolders.sort((a, b) => {
			if (a.startColumn < b.startColumn) {
				return -1;
			}
			if (a.startColumn > b.startColumn) {
				return 1;
			}
			if (a.endColumn < b.endColumn) {
				return -1;
			}
			if (a.endColumn > b.endColumn) {
				return 1;
			}
			return 0;
		});

		return {
			line: placeHolderStack[0].placeHolderText,
			placeHolders: placeHolders
		};
	}
};

const TextMateSnippetParser = new class implements ISnippetParser {

	parse(template: string): CodeSnippet {
		template = _convertExternalSnippet(template, ExternalSnippetType.TextMateSnippet);
		return InternalFormatSnippetParser.parse(template);
	}
};

const EmmetSnippetParser = new class implements ISnippetParser {

	parse(template: string): CodeSnippet {
		template = _convertExternalSnippet(template, ExternalSnippetType.EmmetSnippet);
		return InternalFormatSnippetParser.parse(template);
	}
};

export enum ExternalSnippetType {
	TextMateSnippet,
	EmmetSnippet
}

// This is used for both TextMate and Emmet
function _convertExternalSnippet(snippet: string, snippetType: ExternalSnippetType): string {
	var openBraces = 0;
	var convertedSnippet = '';
	var i = 0;
	var len = snippet.length;

	while (i < len) {
		var restOfLine = snippet.substr(i);

		// Cursor tab stop
		if (/^\$0/.test(restOfLine)) {
			i += 2;
			convertedSnippet += snippetType === ExternalSnippetType.EmmetSnippet ? '{{_}}' : '{{}}';
			continue;
		}
		if (/^\$\{0\}/.test(restOfLine)) {
			i += 4;
			convertedSnippet += snippetType === ExternalSnippetType.EmmetSnippet ? '{{_}}' : '{{}}';
			continue;
		}

		// Tab stops
		var matches = restOfLine.match(/^\$(\d+)/);
		if (Array.isArray(matches) && matches.length === 2) {
			i += 1 + matches[1].length;
			convertedSnippet += '{{' + matches[1] + ':}}';
			continue;
		}
		matches = restOfLine.match(/^\$\{(\d+)\}/);
		if (Array.isArray(matches) && matches.length === 2) {
			i += 3 + matches[1].length;
			convertedSnippet += '{{' + matches[1] + ':}}';
			continue;
		}

		// Open brace patterns placeholder
		if (/^\${/.test(restOfLine)) {
			i += 2;
			++openBraces;
			convertedSnippet += '{{';
			continue;
		}

		// Close brace patterns placeholder
		if (openBraces > 0 && /^}/.test(restOfLine)) {
			i += 1;
			--openBraces;
			convertedSnippet += '}}';
			continue;
		}

		// Escapes
		if (/^\\./.test(restOfLine)) {
			i += 2;
			if (/^\\\$/.test(restOfLine)) {
				convertedSnippet += '$';
			} else {
				convertedSnippet += restOfLine.substr(0, 2);
			}
			continue;
		}

		// Escape braces that don't belong to a placeholder
		matches = restOfLine.match(/^({|})/);
		if (Array.isArray(matches) && matches.length === 2) {
			i += 1;
			convertedSnippet += '\\' + matches[1];
			continue;
		}

		i += 1;
		convertedSnippet += restOfLine.charAt(0);
	}

	return convertedSnippet;
};



export interface IPlaceHolder {
	id: string;
	value: string;
	occurences: editorCommon.IRange[];
}

export interface IIndentationNormalizer {
	normalizeIndentation(str: string): string;
}

export interface ICodeSnippet {
	lines: string[];
	placeHolders: IPlaceHolder[];
	finishPlaceHolderIndex: number;
}
