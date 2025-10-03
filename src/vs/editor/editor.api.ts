/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOptions, WrappingIndent, EditorAutoIndentStrategy } from './common/config/editorOptions.js';
import { createMonacoBaseAPI } from './common/services/editorBaseApi.js';
import { createMonacoEditorAPI } from './standalone/browser/standaloneEditor.js';
import { createMonacoLanguagesAPI } from './standalone/browser/standaloneLanguages.js';
import { FormattingConflicts } from './contrib/format/browser/format.js';

// Set defaults for standalone editor
EditorOptions.wrappingIndent.defaultValue = WrappingIndent.None;
EditorOptions.glyphMargin.defaultValue = false;
EditorOptions.autoIndent.defaultValue = EditorAutoIndentStrategy.Advanced;
EditorOptions.overviewRulerLanes.defaultValue = 2;

// We need to register a formatter selector which simply picks the first available formatter.
// See https://github.com/microsoft/monaco-editor/issues/2327
FormattingConflicts.setFormatterSelector((formatter, document, mode) => Promise.resolve(formatter[0]));

const api = createMonacoBaseAPI();
api.editor = createMonacoEditorAPI();
api.languages = createMonacoLanguagesAPI();
export const CancellationTokenSource = api.CancellationTokenSource;
export const Emitter = api.Emitter;
export const KeyCode = api.KeyCode;
export const KeyMod = api.KeyMod;
export const Position = api.Position;
export const Range = api.Range;
export const Selection = api.Selection;
export const SelectionDirection = api.SelectionDirection;
export const MarkerSeverity = api.MarkerSeverity;
export const MarkerTag = api.MarkerTag;
export const Uri = api.Uri;
export const Token = api.Token;
export const editor = api.editor;
export const languages = api.languages;

interface IMonacoEnvironment {
	globalAPI?: boolean;
}

// eslint-disable-next-line local/code-no-any-casts
const monacoEnvironment: IMonacoEnvironment | undefined = (globalThis as any).MonacoEnvironment;
// eslint-disable-next-line local/code-no-any-casts
if (monacoEnvironment?.globalAPI || (typeof (globalThis as any).define === 'function' && ((globalThis as any).define).amd)) {
	globalThis.monaco = api;
}

// eslint-disable-next-line local/code-no-any-casts
if (typeof (globalThis as any).require !== 'undefined' && typeof (globalThis as any).require.config === 'function') {
	// eslint-disable-next-line local/code-no-any-casts
	(globalThis as any).require.config({
		ignoreDuplicateModules: [
			'vscode-languageserver-types',
			'vscode-languageserver-types/main',
			'vscode-languageserver-textdocument',
			'vscode-languageserver-textdocument/main',
			'vscode-nls',
			'vscode-nls/vscode-nls',
			'jsonc-parser',
			'jsonc-parser/main',
			'vscode-uri',
			'vscode-uri/index',
			'vs/basic-languages/typescript/typescript'
		]
	});
}
