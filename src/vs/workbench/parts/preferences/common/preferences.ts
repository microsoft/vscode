/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { LinkedMap as Map } from 'vs/base/common/map';
import { IRange } from 'vs/editor/common/editorCommon';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IKeybindingItemEntry } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';

export interface ISettingsGroup {
	id: string;
	range: IRange;
	title: string;
	titleRange: IRange;
	sections: ISettingsSection[];
}

export interface ISettingsSection {
	titleRange?: IRange;
	title?: string;
	settings: ISetting[];
}

export interface ISetting {
	range: IRange;
	key: string;
	keyRange: IRange;
	value: any;
	valueRange: IRange;
	description: string[];
	descriptionRanges: IRange[];
	overrides?: ISetting[];
	overrideOf?: ISetting;
}

export interface IFilterResult {
	filteredGroups: ISettingsGroup[];
	allGroups: ISettingsGroup[];
	matches: Map<string, IRange[]>;
}

export interface IPreferencesEditorModel<T> {
	uri: URI;
	content: string;
	getPreference(key: string): T;
	dispose(): void;
}

export interface ISettingsEditorModel extends IPreferencesEditorModel<ISetting> {
	settingsGroups: ISettingsGroup[];
	groupsTerms: string[];
	filterSettings(filter: string): IFilterResult;
}

export interface IKeybindingsEditorModel<T> extends IPreferencesEditorModel<T> {
}

export const IPreferencesService = createDecorator<IPreferencesService>('preferencesService');

export interface IPreferencesService {
	_serviceBrand: any;

	defaultSettingsResource: URI;
	userSettingsResource: URI;
	workspaceSettingsResource: URI;
	defaultKeybindingsResource: URI;

	createPreferencesEditorModel<T>(uri: URI): TPromise<IPreferencesEditorModel<T>>;

	openSettings(): TPromise<IEditor>;
	switchSettings(): TPromise<void>;
	openGlobalSettings(): TPromise<IEditor>;
	openWorkspaceSettings(): TPromise<IEditor>;
	openGlobalKeybindingSettings(textual: boolean): TPromise<void>;

	configureSettingsForLanguage(language: string): void;
}


export interface IKeybindingsEditor extends IEditor {

	activeKeybindingEntry: IKeybindingItemEntry;

	search(filter: string): void;
	defineKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	removeKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	resetKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	copyKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	showConflicts(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
}

export const CONTEXT_SETTINGS_EDITOR = new RawContextKey<boolean>('inSettingsEditor', false);
export const CONTEXT_KEYBINDINGS_EDITOR = new RawContextKey<boolean>('inKeybindings', false);
export const CONTEXT_KEYBINDING_FOCUS = new RawContextKey<boolean>('keybindingFocus', false);

export const SETTINGS_EDITOR_COMMAND_SEARCH = 'settings.action.search';
export const KEYBINDINGS_EDITOR_COMMAND_SEARCH = 'keybindings.editor.searchKeybindings';
export const KEYBINDINGS_EDITOR_COMMAND_DEFINE = 'keybindings.editor.defineKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_REMOVE = 'keybindings.editor.removeKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_RESET = 'keybindings.editor.resetKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_COPY = 'keybindings.editor.copyKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS = 'keybindings.editor.showConflicts';