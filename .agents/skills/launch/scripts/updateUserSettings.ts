/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const [settingsFile, windowTitleDescription, repo] = process.argv.slice(2);
if (!settingsFile || !windowTitleDescription?.trim() || !repo) {
	console.error('Usage: updateUserSettings.ts <settings-file> <window-title-description> <repo>');
	process.exit(2);
}

interface IEdit {
	readonly offset: number;
	readonly length: number;
	readonly content: string;
}

interface IJsonEditModule {
	applyEdits(text: string, edits: IEdit[]): string;
	setProperty(text: string, path: string[], value: unknown, formattingOptions: { tabSize: number; insertSpaces: boolean; eol: string }): IEdit[];
}

interface IJsonModule {
	parse(text: string, errors: object[], options: { allowTrailingComma: boolean; allowEmptyContent: boolean }): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const jsonEdit: IJsonEditModule = await import(pathToFileURL(path.join(repo, 'out/vs/base/common/jsonEdit.js')).href);
const json: IJsonModule = await import(pathToFileURL(path.join(repo, 'out/vs/base/common/json.js')).href);

let text = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '';
const parseErrors: object[] = [];
const settings = json.parse(text, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
if (parseErrors.length > 0 || (settings !== undefined && !isRecord(settings))) {
	throw new Error(`Unable to parse settings.json without data loss: ${settingsFile}`);
}

const indentation = text.match(/^([ \t]+)"/m)?.[1] ?? '  ';
const formattingOptions = {
	tabSize: indentation.length,
	insertSpaces: !indentation.startsWith('\t'),
	eol: text.includes('\r\n') ? '\r\n' : '\n',
};
const updateSetting = (key: string, value: unknown): void => {
	text = jsonEdit.applyEdits(text, jsonEdit.setProperty(text, [key], value, formattingOptions));
};

updateSetting('files.simpleDialog.enable', true);

const defaultWindowTitle = process.platform === 'darwin'
	? '${activeEditorShort}${separator}${rootName}${separator}${profileName}'
	: '${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}';
const configuredWindowTitle = isRecord(settings) ? settings['window.title'] : undefined;
if (configuredWindowTitle !== undefined && typeof configuredWindowTitle !== 'string') {
	throw new Error('window.title must be a string');
}

const suffix = `\${separator}[${windowTitleDescription.trim().replace(/\s+/g, ' ')}]`;
const windowTitle = configuredWindowTitle ?? defaultWindowTitle;
updateSetting('window.title', windowTitle.endsWith(suffix) ? windowTitle : windowTitle + suffix);

fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
fs.writeFileSync(settingsFile, text);
