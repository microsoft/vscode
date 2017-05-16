/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { Marker, Variable, Placeholder, Text, SnippetParser, walk } from 'vs/editor/contrib/snippet/common/snippetParser';

export interface IIndentationNormalizer {
	normalizeIndentation(str: string): string;
}

export interface IPlaceHolder {
	id: string;
	value: string;
	occurences: Range[];
}

export interface ICodeSnippet {
	lines: string[];
	placeHolders: IPlaceHolder[];
	finishPlaceHolderIndex: number;
}

export interface ISnippetVariableResolver {
	resolve(name: string): string;
}

export class CodeSnippet implements ICodeSnippet {

	static fromTextmate(template: string, variableResolver?: ISnippetVariableResolver): CodeSnippet {
		const marker = new SnippetParser(true, false).parse(template);
		const snippet = new CodeSnippet();
		_resolveSnippetVariables(marker, variableResolver);
		_fillCodeSnippetFromMarker(snippet, marker);
		return snippet;
	}

	static fromInternal(template: string): CodeSnippet {
		const marker = new SnippetParser(false, true).parse(template);
		const snippet = new CodeSnippet();
		_fillCodeSnippetFromMarker(snippet, marker);
		return snippet;
	}

	static none(template: string): CodeSnippet {
		const snippet = new CodeSnippet();
		snippet.lines = template.split(/\r\n|\n|\r/);
		return snippet;
	}

	static fixEmmetFinalTabstop(template: string): string {

		let matchFinalStops = template.match(/\$\{0\}|\$0/g);
		if (!matchFinalStops || matchFinalStops.length === 1) {
			return template;
		}

		// string to string conversion that tries to fix the
		// snippet in-place

		let marker = new SnippetParser(true, false).parse(template);
		let maxIndex = -Number.MIN_VALUE;

		// find highest placeholder index
		walk(marker, candidate => {
			if (candidate instanceof Placeholder) {
				let index = Number(candidate.index);
				if (index > maxIndex) {
					maxIndex = index;
				}
			}
			return true;
		});

		// rewrite final tabstops
		walk(marker, candidate => {
			if (candidate instanceof Placeholder) {
				if (candidate.isFinalTabstop) {
					candidate.index = String(++maxIndex);
				}
			}
			return true;
		});

		// write back as string
		function toSnippetString(marker: Marker): string {
			if (marker instanceof Text) {
				return marker.string;
			} else if (marker instanceof Placeholder) {
				if (marker.defaultValue.length > 0) {
					return `\${${marker.index}:${marker.defaultValue.map(toSnippetString).join('')}}`;
				} else {
					return `\$${marker.index}`;
				}
			} else if (marker instanceof Variable) {
				if (marker.defaultValue.length > 0) {
					return `\${${marker.name}:${marker.defaultValue.map(toSnippetString).join('')}}`;
				} else {
					return `\$${marker.name}`;
				}
			} else {
				throw new Error('unexpected marker: ' + marker);
			}
		}
		return marker.map(toSnippetString).join('');
	}

	static fromEmmet(template: string): CodeSnippet {

		CodeSnippet.fixEmmetFinalTabstop(template);

		let matchFinalStops = template.match(/\$\{0\}|\$0/g);
		if (!matchFinalStops || matchFinalStops.length === 1) {
			return CodeSnippet.fromTextmate(template);
		}

		// Emmet sometimes returns snippets with multiple ${0}
		// In such cases, replace ${0} with incremental tab stops

		const snippetMarkers: Marker[] = new SnippetParser(true, false).parse(template) || [];
		let getMaxTabStop = (markers: Marker[]): number => {
			let currentMaxTabStop = -1;
			markers.forEach(marker => {
				if (marker instanceof Placeholder && /^\d+$/.test(marker['index'])) {
					let currentTabStop = Number(marker['index']);
					let nestedMaxTabStop = getMaxTabStop(marker['defaultValue'] || []);
					currentMaxTabStop = Math.max(currentMaxTabStop, currentTabStop, nestedMaxTabStop);
				}
			});
			return currentMaxTabStop;
		};

		let maxTabStop = getMaxTabStop(snippetMarkers);

		let setNextTabStop = (markers: Marker[]) => {
			markers.forEach(marker => {
				if (marker instanceof Placeholder) {
					if (marker['index'] === '0') {
						marker['index'] = ++maxTabStop + '';
					}
					setNextTabStop(marker['defaultValue'] || []);
				}
			});
		};

		setNextTabStop(snippetMarkers);

		const snippet = new CodeSnippet();
		_fillCodeSnippetFromMarker(snippet, snippetMarkers);
		return snippet;
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
		const resultLines: string[] = [];
		const resultPlaceHolders: IPlaceHolder[] = [];

		const referenceIndentation = this.extractLineIndentation(referenceLine, firstLineDeltaColumn + 1);

		// Compute resultLines & keep deltaColumns as a reference for adjusting placeholders
		const deltaColumns: number[] = [];

		for (let i = 0, len = this.lines.length; i < len; i++) {
			let originalLine = this.lines[i];
			if (i === 0) {
				deltaColumns[i + 1] = firstLineDeltaColumn;
				resultLines[i] = originalLine;
			} else {
				let originalLineIndentation = this.extractLineIndentation(originalLine);
				let remainingLine = originalLine.substr(originalLineIndentation.length);
				let indentation = config.normalizeIndentation(referenceIndentation + originalLineIndentation);
				deltaColumns[i + 1] = indentation.length - originalLineIndentation.length;
				resultLines[i] = indentation + remainingLine;
			}
		}

		// Compute resultPlaceHolders
		for (const originalPlaceHolder of this.placeHolders) {
			let resultOccurences = [];

			for (let { startLineNumber, startColumn, endLineNumber, endColumn } of originalPlaceHolder.occurences) {

				if (startColumn > 1 || startLineNumber === 1) {
					// placeholders that aren't at the beginning of new snippet lines
					// will be moved by how many characters the indentation has been
					// adjusted
					startColumn = startColumn + deltaColumns[startLineNumber];
					endColumn = endColumn + deltaColumns[endLineNumber];

				} else {
					// placeholders at the beginning of new snippet lines
					// will be indented by the reference indentation
					startColumn += referenceIndentation.length;
					endColumn += referenceIndentation.length;
				}

				resultOccurences.push({
					startLineNumber: startLineNumber + deltaLine,
					startColumn,
					endLineNumber: endLineNumber + deltaLine,
					endColumn,
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

function _resolveSnippetVariables(marker: Marker[], resolver: ISnippetVariableResolver) {
	if (resolver) {
		const stack = [...marker];

		while (stack.length > 0) {
			const marker = stack.shift();
			if (marker instanceof Variable) {

				try {
					marker.resolvedValue = resolver.resolve(marker.name);
				} catch (e) {
					//
				}
				if (marker.isDefined) {
					continue;
				}
			}

			if (marker instanceof Variable || marker instanceof Placeholder) {
				// 'recurse'
				stack.unshift(...marker.defaultValue);
			}
		}
	}
}

function _isFinishPlaceHolder(v: IPlaceHolder) {
	return (v.id === '' && v.value === '') || v.id === '0';
}

function _fillCodeSnippetFromMarker(snippet: CodeSnippet, marker: Marker[]) {

	let placeHolders: { [id: string]: IPlaceHolder } = Object.create(null);
	let hasFinishPlaceHolder = false;

	const stack = [...marker];
	snippet.lines = [''];
	while (stack.length > 0) {
		const marker = stack.shift();
		if (marker instanceof Text) {
			// simple text
			let lines = marker.string.split(/\r\n|\n|\r/);
			snippet.lines[snippet.lines.length - 1] += lines.shift();
			snippet.lines.push(...lines);

		} else if (marker instanceof Placeholder) {

			let placeHolder = placeHolders[marker.index];
			if (!placeHolder) {
				placeHolders[marker.index] = placeHolder = {
					id: marker.index,
					value: Marker.toString(marker.defaultValue),
					occurences: []
				};
				snippet.placeHolders.push(placeHolder);
			}
			hasFinishPlaceHolder = hasFinishPlaceHolder || _isFinishPlaceHolder(placeHolder);

			const line = snippet.lines.length;
			const column = snippet.lines[line - 1].length + 1;

			placeHolder.occurences.push(new Range(
				line,
				column,
				line,
				column + Marker.toString(marker.defaultValue).length // TODO multiline placeholders!
			));

			stack.unshift(...marker.defaultValue);

		} else if (marker instanceof Variable) {

			if (!marker.isDefined) {
				// contine as placeholder
				// THIS is because of us having falsy
				// advertised ${foo} as placeholder syntax
				stack.unshift(new Placeholder(marker.name, marker.defaultValue.length === 0
					? [new Text(marker.name)]
					: marker.defaultValue));

			} else if (marker.resolvedValue) {
				// contine with the value
				stack.unshift(new Text(marker.resolvedValue));

			} else {
				// continue with default values
				stack.unshift(...marker.defaultValue);
			}
		}

		if (stack.length === 0 && !hasFinishPlaceHolder) {
			stack.push(new Placeholder('0', []));
		}
	}

	// Named variables (e.g. {greeting} and {greeting:Hello}) are sorted first, followed by
	// tab-stops and numeric variables (e.g. $1, $2, ${3:foo}) which are sorted in ascending order
	snippet.placeHolders.sort((a, b) => {
		let nonIntegerId = (v: IPlaceHolder) => !(/^\d+$/).test(v.id);

		// Sort finish placeholder last
		if (_isFinishPlaceHolder(a)) {
			return 1;
		} else if (_isFinishPlaceHolder(b)) {
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

	if (snippet.placeHolders.length > 0) {
		snippet.finishPlaceHolderIndex = snippet.placeHolders.length - 1;
		snippet.placeHolders[snippet.finishPlaceHolderIndex].id = '';
	}
}
