/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/editor/standalone-languages/all';
import './standaloneSchemas';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ClassNames, ContentWidgetPositionPreference, OverlayWidgetPositionPreference} from 'vs/editor/browser/editorBrowser';
import {Colorizer} from 'vs/editor/browser/standalone/colorizer';
import * as standaloneCodeEditor from 'vs/editor/browser/standalone/standaloneCodeEditor';
import {ILanguageDef} from 'vs/editor/standalone-languages/types';

var global:any = self;
if (!global.Monaco) {
	global.Monaco = {};
}
var Monaco = global.Monaco;
if (!Monaco.Editor) {
	Monaco.Editor = {};
}
Monaco.Editor.setupServices = standaloneCodeEditor.setupServices;
Monaco.Editor.create = standaloneCodeEditor.create;
Monaco.Editor.createModel = standaloneCodeEditor.createModel;
Monaco.Editor.createDiffEditor = standaloneCodeEditor.createDiffEditor;
Monaco.Editor.configureMode = standaloneCodeEditor.configureMode;
Monaco.Editor.registerWorkerParticipant = standaloneCodeEditor.registerWorkerParticipant;
Monaco.Editor.getOrCreateMode = standaloneCodeEditor.getOrCreateMode;
Monaco.Editor.createCustomMode = standaloneCodeEditor.createCustomMode;
Monaco.Editor.colorize = standaloneCodeEditor.colorize;
Monaco.Editor.colorizeElement = standaloneCodeEditor.colorizeElement;
Monaco.Editor.colorizeLine = Colorizer.colorizeLine;
Monaco.Editor.colorizeModelLine = Colorizer.colorizeModelLine;

// -- export common constants
Monaco.Editor.SelectionDirection = editorCommon.SelectionDirection;
Monaco.Editor.WrappingIndent = editorCommon.WrappingIndent;
Monaco.Editor.wrappingIndentFromString = editorCommon.wrappingIndentFromString;
Monaco.Editor.OverviewRulerLane = editorCommon.OverviewRulerLane;
Monaco.Editor.EndOfLinePreference = editorCommon.EndOfLinePreference;
Monaco.Editor.EndOfLineSequence = editorCommon.EndOfLineSequence;
Monaco.Editor.LineTokensBinaryEncoding = editorCommon.LineTokensBinaryEncoding;
Monaco.Editor.TrackedRangeStickiness = editorCommon.TrackedRangeStickiness;
Monaco.Editor.VerticalRevealType = editorCommon.VerticalRevealType;
Monaco.Editor.MouseTargetType = editorCommon.MouseTargetType;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS = editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_FOCUS = editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS = editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS = editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION = editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION;
Monaco.Editor.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID = editorCommon.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID;
Monaco.Editor.ViewEventNames = editorCommon.ViewEventNames;
Monaco.Editor.CodeEditorStateFlag = editorCommon.CodeEditorStateFlag;
Monaco.Editor.EditorType = editorCommon.EditorType;
Monaco.Editor.ClassName = editorCommon.ClassName;
Monaco.Editor.EventType = editorCommon.EventType;
Monaco.Editor.Handler = editorCommon.Handler;

// -- export browser constants
Monaco.Editor.ClassNames = ClassNames;
Monaco.Editor.ContentWidgetPositionPreference = ContentWidgetPositionPreference;
Monaco.Editor.OverlayWidgetPositionPreference = OverlayWidgetPositionPreference;

// Register all built-in standalone languages
let MonacoEditorLanguages: ILanguageDef[] = this.MonacoEditorLanguages || [];
MonacoEditorLanguages.forEach((language) => {
	standaloneCodeEditor.registerStandaloneLanguage(language, language.defModule);
});

// Register all built-in standalone JSON schemas
let MonacoEditorSchemas: { [url:string]: IJSONSchema } = this.MonacoEditorSchemas || {};
for (var uri in MonacoEditorSchemas) {
	standaloneCodeEditor.registerStandaloneSchema(uri, MonacoEditorSchemas[uri]);
}
