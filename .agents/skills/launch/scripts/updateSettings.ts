/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';

const settingsFile = process.argv[2];
const sessionTitle = process.argv[3]?.replace(/\s+/g, ' ').trim().replaceAll('$', '\uFF04');

if (!settingsFile) {
	throw new Error('Usage: updateSettings.ts <settings-file> [session-title]');
}

let settingsStat;
try {
	settingsStat = fs.lstatSync(settingsFile);
} catch (error) {
	if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
		throw error;
	}
}

let text;
if (settingsStat) {
	text = fs.readFileSync(settingsFile, 'utf8');
	if (settingsStat.isSymbolicLink()) {
		fs.unlinkSync(settingsFile);
	}
} else {
	text = '';
}

if (!text.trim()) {
	text = '{}\n';
}

text = setJsoncProperty(text, 'files.simpleDialog.enable', true);
if (sessionTitle) {
	text = setJsoncProperty(
		text,
		'window.title',
		`${sessionTitle}\${separator}\${rootName}\${separator}\${appName}`
	);
}

fs.writeFileSync(settingsFile, text);

function setJsoncProperty(text: string, key: string, value: boolean | string): string {
	const maskedText = maskComments(text);
	const property = findRootProperty(maskedText, key);
	const serializedValue = JSON.stringify(value);

	if (property) {
		return text.slice(0, property.valueStart) + serializedValue + text.slice(property.valueEnd);
	}

	const firstBrace = maskedText.indexOf('{');
	const lastBrace = maskedText.lastIndexOf('}');
	if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
		throw new Error(`settings.json has no top-level object - refusing to clobber it: ${settingsFile}`);
	}

	const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
	const contents = maskedText.slice(firstBrace + 1, lastBrace).trim();
	const separator = !contents || contents.endsWith(',') ? '' : ',';
	const insertion = `${separator}${lineEnding}  ${JSON.stringify(key)}: ${serializedValue}${lineEnding}`;
	return text.slice(0, lastBrace) + insertion + text.slice(lastBrace);
}

function findRootProperty(text: string, key: string): { valueStart: number; valueEnd: number } | undefined {
	let depth = 0;

	for (let index = 0; index < text.length; index++) {
		const current = text[index];
		if (current === '{' || current === '[') {
			depth++;
			continue;
		}
		if (current === '}' || current === ']') {
			depth--;
			continue;
		}
		if (current !== '"') {
			continue;
		}

		const stringEnd = findStringEnd(text, index);
		if (depth === 1 && JSON.parse(text.slice(index, stringEnd)) === key) {
			let valueStart = stringEnd;
			while (/\s/.test(text[valueStart])) {
				valueStart++;
			}
			if (text[valueStart] === ':') {
				valueStart++;
				while (/\s/.test(text[valueStart])) {
					valueStart++;
				}
				const valueMatch = /^(?:"(?:\\.|[^"\\\r\n])*"|true|false|null|-?\d+(?:\.\d+)?)/.exec(text.slice(valueStart));
				if (!valueMatch) {
					throw new Error(`Unsupported value for ${key} in ${settingsFile}`);
				}
				return { valueStart, valueEnd: valueStart + valueMatch[0].length };
			}
		}
		index = stringEnd - 1;
	}

	return undefined;
}

function findStringEnd(text: string, start: number): number {
	let escaped = false;
	for (let index = start + 1; index < text.length; index++) {
		if (escaped) {
			escaped = false;
		} else if (text[index] === '\\') {
			escaped = true;
		} else if (text[index] === '"') {
			return index + 1;
		}
	}
	throw new Error(`Unterminated string in ${settingsFile}`);
}

function maskComments(text: string): string {
	const characters = text.split('');
	let inString = false;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < characters.length; index++) {
		const current = characters[index];
		const next = characters[index + 1];

		if (inLineComment) {
			if (current === '\n') {
				inLineComment = false;
			} else if (current !== '\r') {
				characters[index] = ' ';
			}
			continue;
		}

		if (inBlockComment) {
			if (current === '*' && next === '/') {
				characters[index] = ' ';
				characters[index + 1] = ' ';
				index++;
				inBlockComment = false;
			} else if (current !== '\r' && current !== '\n') {
				characters[index] = ' ';
			}
			continue;
		}

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (current === '\\') {
				escaped = true;
			} else if (current === '"') {
				inString = false;
			}
			continue;
		}

		if (current === '"') {
			inString = true;
		} else if (current === '/' && next === '/') {
			characters[index] = ' ';
			characters[index + 1] = ' ';
			index++;
			inLineComment = true;
		} else if (current === '/' && next === '*') {
			characters[index] = ' ';
			characters[index + 1] = ' ';
			index++;
			inBlockComment = true;
		}
	}

	return characters.join('');
}
