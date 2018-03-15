/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/editor/editor.all';
import 'vs/editor/standalone/browser/accessibilityHelp/accessibilityHelp';
import 'vs/editor/standalone/browser/inspectTokens/inspectTokens';
import 'vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard';
import 'vs/editor/standalone/browser/quickOpen/quickOutline';
import 'vs/editor/standalone/browser/quickOpen/gotoLine';
import 'vs/editor/standalone/browser/quickOpen/quickCommand';
import 'vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast';

import { createMonacoBaseAPI } from 'vs/editor/common/standalone/standaloneBase';
import { createMonacoEditorAPI } from 'vs/editor/standalone/browser/standaloneEditor';
import { createMonacoLanguagesAPI } from 'vs/editor/standalone/browser/standaloneLanguages';
import { EDITOR_DEFAULTS, WrappingIndent } from 'vs/editor/common/config/editorOptions';

var global: any = self;

// When missing, polyfill the native promise
// with our winjs-based polyfill
import { PolyfillPromise } from 'vs/base/common/winjs.polyfill.promise';
if (typeof global.Promise === 'undefined') {
	global.Promise = PolyfillPromise;
}

// Set defaults for standalone editor
(<any>EDITOR_DEFAULTS).wrappingIndent = WrappingIndent.None;
(<any>EDITOR_DEFAULTS.contribInfo).folding = false;
(<any>EDITOR_DEFAULTS.viewInfo).glyphMargin = false;
(<any>EDITOR_DEFAULTS).autoIndent = false;

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
export const Severity = api.Severity;
export const Promise = api.Promise;
export const Uri = api.Uri;
export const Token = api.Token;
export const editor = api.editor;
export const languages = api.languages;

global.monaco = api;

if (typeof global.require !== 'undefined' && typeof global.require.config === 'function') {
	global.require.config({
		ignoreDuplicateModules: [
			'vscode-languageserver-types',
			'vscode-languageserver-types/main',
			'vscode-nls',
			'vscode-nls/vscode-nls',
			'jsonc-parser',
			'jsonc-parser/main',
			'vscode-uri',
			'vscode-uri/index'
		]
	});
}
