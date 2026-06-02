/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TsExpr {
	static str(value: string): TsExpr;
	static str(strings: TemplateStringsArray, ...values: unknown[]): TsExpr;
	static str(strings: TemplateStringsArray | string, ...values: unknown[]): TsExpr {
		if (typeof strings === 'string') {
			return new TsExpr([strings]);
		} else {
			const parts: (string | { value: unknown })[] = [];
			for (let i = 0; i < strings.length; i++) {
				parts.push(strings[i]);
				if (i < values.length) {
					parts.push({ value: values[i] });
				}
			}

			// TODO remove indentation

			return new TsExpr(parts);
		}

	}

	constructor(public readonly parts: (string | { value: unknown })[]) { }

	toString() {
		return _serializeToTs(this, 0);
	}
}

function _serializeToTs(data: unknown, newLineIndentation: number): string {
	if (data && typeof data === 'object') {

		if (data instanceof TsExpr) {
			let lastIndentation = 0;
			const result = data.parts.map(p => {
				if (typeof p === 'string') {
					lastIndentation = getIndentOfLastLine(p);
					return p;
				} else {
					return _serializeToTs(p.value, lastIndentation);
				}
			}).join('');

			return indentNonFirstLines(result, newLineIndentation);
		}

		if (Array.isArray(data)) {
			const entries: string[] = [];
			for (const value of data) {
				entries.push(_serializeToTs(value, newLineIndentation + 1));
			}

			return `[\n`
				+ entries.map(e => indentLine(e, newLineIndentation + 1) + ',\n').join('')
				+ indentLine(`]`, newLineIndentation);
		}

		const entries: string[] = [];
		for (const [key, value] of Object.entries(data)) {
			entries.push(`${serializeObjectKey(key)}: ${_serializeToTs(value, newLineIndentation + 1)},\n`);
		}
		return `{\n`
			+ entries.map(e => indentLine(e, newLineIndentation + 1)).join('')
			+ indentLine(`}`, newLineIndentation);
	}

	if (data === undefined) {
		return indentNonFirstLines('undefined', newLineIndentation);
	}

	return indentNonFirstLines(JSON.stringify(data, undefined, '\t'), newLineIndentation);
}

function getIndentOfLastLine(str: string): number {
	const lines = str.split('\n');
	const lastLine = lines[lines.length - 1];
	return lastLine.length - lastLine.trimStart().length;
}

function indentNonFirstLines(str: string, indentation: number): string {
	const lines = str.split('\n');
	return lines.map((line, i) => i === 0 ? line : indentLine(line, indentation)).join('\n');
}

function indentLine(str: string, indentation: number): string {
	return '\t'.repeat(indentation) + str;
}

function serializeObjectKey(key: string): string {
	if (/^[a-zA-Z_]\w*$/.test(key)) {
		return key;
	}
	return JSON.stringify(key);
}
