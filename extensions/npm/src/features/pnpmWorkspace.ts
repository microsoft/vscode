/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IPnpmWorkspaceDocument {
	lineAt(lineNumber: number): { text: string };
}

export interface IPnpmWorkspacePosition {
	line: number;
	character: number;
}

export interface IPnpmWorkspaceRange {
	line: number;
	startCharacter: number;
	endCharacter: number;
}

export interface IPnpmWorkspacePackageEntry {
	packageName: string;
	range: IPnpmWorkspaceRange;
}

interface ParsedYamlKeyLine {
	indent: number;
	key: string;
	keyRange: { startCharacter: number; endCharacter: number };
	valueRange: { startCharacter: number; endCharacter: number } | undefined;
	hasInlineValue: boolean;
}

export function getPnpmWorkspacePackageEntry(document: IPnpmWorkspaceDocument, position: IPnpmWorkspacePosition): IPnpmWorkspacePackageEntry | undefined {
	const stack: { indent: number; key: string }[] = [];

	for (let lineNumber = 0; lineNumber <= position.line; lineNumber++) {
		const parsedLine = parseYamlKeyLine(document, lineNumber);
		if (!parsedLine) {
			continue;
		}

		while (stack.length && stack[stack.length - 1].indent >= parsedLine.indent) {
			stack.pop();
		}

		if (lineNumber === position.line) {
			if (!parsedLine.hasInlineValue) {
				return undefined;
			}

			const hoveredRange = contains(parsedLine.keyRange, position.character)
				? parsedLine.keyRange
				: parsedLine.valueRange && contains(parsedLine.valueRange, position.character)
					? parsedLine.valueRange
					: undefined;

			if (!hoveredRange) {
				return undefined;
			}

			const rootSection = stack[0]?.key;
			if (rootSection === 'catalog') {
				return {
					packageName: parsedLine.key,
					range: {
						line: lineNumber,
						startCharacter: hoveredRange.startCharacter,
						endCharacter: hoveredRange.endCharacter,
					}
				};
			}
			if (rootSection === 'catalogs' && stack.length === 2) {
				return {
					packageName: parsedLine.key,
					range: {
						line: lineNumber,
						startCharacter: hoveredRange.startCharacter,
						endCharacter: hoveredRange.endCharacter,
					}
				};
			}

			return undefined;
		}

		if (!parsedLine.hasInlineValue) {
			stack.push({ indent: parsedLine.indent, key: parsedLine.key });
		}
	}

	return undefined;
}

function parseYamlKeyLine(document: IPnpmWorkspaceDocument, lineNumber: number): ParsedYamlKeyLine | undefined {
	const line = document.lineAt(lineNumber).text;
	const match = line.match(/^(\s*)(?:"([^"]+)"|'([^']+)'|([^"'#][^:]*?))\s*:(.*)$/);
	if (!match) {
		return undefined;
	}

	const indent = match[1].length;
	const doubleQuotedKey = match[2];
	const singleQuotedKey = match[3];
	const unquotedKey = match[4];
	const rawValue = match[5];
	const rawValueStartColumn = line.length - rawValue.length;

	let key: string;
	let keyStartColumn: number;
	let keyEndColumn: number;

	if (doubleQuotedKey !== undefined) {
		key = doubleQuotedKey;
		keyStartColumn = indent;
		keyEndColumn = keyStartColumn + doubleQuotedKey.length + 2;
	} else if (singleQuotedKey !== undefined) {
		key = singleQuotedKey;
		keyStartColumn = indent;
		keyEndColumn = keyStartColumn + singleQuotedKey.length + 2;
	} else {
		key = unquotedKey.trim();
		keyStartColumn = indent;
		keyEndColumn = keyStartColumn + unquotedKey.length;
	}

	const valueRange = getValueRange(rawValue, rawValueStartColumn);

	return {
		indent,
		key,
		keyRange: { startCharacter: keyStartColumn, endCharacter: keyEndColumn },
		valueRange,
		hasInlineValue: valueRange !== undefined
	};
}

function getValueRange(rawValue: string, rawValueStartColumn: number): { startCharacter: number; endCharacter: number } | undefined {
	const trimmedStartLength = rawValue.length - rawValue.trimStart().length;
	const valueText = rawValue.slice(trimmedStartLength);
	if (!valueText) {
		return undefined;
	}

	const valueLength = getValueLength(valueText);
	if (valueLength <= 0) {
		return undefined;
	}

	const valueStartColumn = rawValueStartColumn + trimmedStartLength;
	return { startCharacter: valueStartColumn, endCharacter: valueStartColumn + valueLength };
}

function getValueLength(valueText: string): number {
	const firstChar = valueText[0];
	if (firstChar === '"') {
		return getDoubleQuotedValueLength(valueText);
	}
	if (firstChar === '\'') {
		return getSingleQuotedValueLength(valueText);
	}

	let end = valueText.length;
	for (let index = 0; index < valueText.length; index++) {
		if (valueText[index] === '#' && (index === 0 || /\s/.test(valueText[index - 1]))) {
			end = index;
			break;
		}
	}

	while (end > 0 && /\s/.test(valueText[end - 1])) {
		end--;
	}

	return end;
}

function getDoubleQuotedValueLength(valueText: string): number {
	for (let index = 1; index < valueText.length; index++) {
		if (valueText[index] === '\\') {
			index++;
			continue;
		}
		if (valueText[index] === '"') {
			return index + 1;
		}
	}

	return valueText.length;
}

function getSingleQuotedValueLength(valueText: string): number {
	for (let index = 1; index < valueText.length; index++) {
		if (valueText[index] === '\'' && valueText[index + 1] === '\'') {
			index++;
			continue;
		}
		if (valueText[index] === '\'') {
			return index + 1;
		}
	}

	return valueText.length;
}

function contains(range: { startCharacter: number; endCharacter: number }, character: number): boolean {
	return range.startCharacter <= character && character <= range.endCharacter;
}
