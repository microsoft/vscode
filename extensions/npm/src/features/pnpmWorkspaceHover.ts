/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, DocumentSelector, Hover, HoverProvider, languages, Position, Range, TextDocument } from 'vscode';
import { XHRRequest } from 'request-light';
import { NpmPackageInfoProvider } from './packageInfo';

const PNPM_WORKSPACE_SELECTOR: DocumentSelector = [{ language: 'yaml', scheme: '*', pattern: '**/pnpm-workspace.yaml' }];

interface ParsedYamlKeyLine {
	indent: number;
	key: string;
	keyRange: Range;
	valueRange: Range | undefined;
	hasInlineValue: boolean;
}

export function addPnpmWorkspaceHoverProvider(xhr: XHRRequest, npmCommandPath: string | undefined): Disposable {
	return languages.registerHoverProvider(PNPM_WORKSPACE_SELECTOR, new PnpmWorkspaceHoverProvider(new NpmPackageInfoProvider(xhr, npmCommandPath)));
}

class PnpmWorkspaceHoverProvider implements HoverProvider {

	public constructor(private readonly packageInfoProvider: NpmPackageInfoProvider) {
	}

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Thenable<Hover | null> | null {
		if (token.isCancellationRequested) {
			return null;
		}

		if (!this.packageInfoProvider.isEnabled()) {
			return null;
		}

		const packageEntry = this.getPackageEntryAtPosition(document, position);
		if (!packageEntry) {
			return null;
		}

		if (token.isCancellationRequested) {
			return null;
		}

		return this.packageInfoProvider.fetchPackageInfo(packageEntry.packageName, document.uri).then(info => {
			if (token.isCancellationRequested) {
				return null;
			}

			if (!info) {
				return null;
			}

			return new Hover(this.packageInfoProvider.getDocumentation(info.description, info.version, info.time, info.homepage), packageEntry.range);
		});
	}

	private getPackageEntryAtPosition(document: TextDocument, position: Position): { packageName: string; range: Range } | undefined {
		const stack: { indent: number; key: string }[] = [];

		for (let lineNumber = 0; lineNumber <= position.line; lineNumber++) {
			const parsedLine = this.parseYamlKeyLine(document, lineNumber);
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

				const hoveredRange = parsedLine.keyRange.contains(position)
					? parsedLine.keyRange
					: parsedLine.valueRange?.contains(position)
						? parsedLine.valueRange
						: undefined;
				if (!hoveredRange) {
					return undefined;
				}

				const rootSection = stack[0]?.key;
				if (rootSection === 'catalog') {
					return { packageName: parsedLine.key, range: hoveredRange };
				}
				if (rootSection === 'catalogs' && stack.length === 2) {
					return { packageName: parsedLine.key, range: hoveredRange };
				}

				return undefined;
			}

			if (!parsedLine.hasInlineValue) {
				stack.push({ indent: parsedLine.indent, key: parsedLine.key });
			}
		}

		return undefined;
	}

	private parseYamlKeyLine(document: TextDocument, lineNumber: number): ParsedYamlKeyLine | undefined {
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

		const valueRange = this.getValueRange(lineNumber, rawValue, rawValueStartColumn);

		return {
			indent,
			key,
			keyRange: new Range(lineNumber, keyStartColumn, lineNumber, keyEndColumn),
			valueRange,
			hasInlineValue: valueRange !== undefined
		};
	}

	private getValueRange(lineNumber: number, rawValue: string, rawValueStartColumn: number): Range | undefined {
		const trimmedStartLength = rawValue.length - rawValue.trimStart().length;
		const valueText = rawValue.slice(trimmedStartLength);
		if (!valueText) {
			return undefined;
		}

		const valueLength = this.getValueLength(valueText);
		if (valueLength <= 0) {
			return undefined;
		}

		const valueStartColumn = rawValueStartColumn + trimmedStartLength;
		return new Range(lineNumber, valueStartColumn, lineNumber, valueStartColumn + valueLength);
	}

	private getValueLength(valueText: string): number {
		const firstChar = valueText[0];
		if (firstChar === '"') {
			return this.getDoubleQuotedValueLength(valueText);
		}
		if (firstChar === '\'') {
			return this.getSingleQuotedValueLength(valueText);
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

	private getDoubleQuotedValueLength(valueText: string): number {
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

	private getSingleQuotedValueLength(valueText: string): number {
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
}
