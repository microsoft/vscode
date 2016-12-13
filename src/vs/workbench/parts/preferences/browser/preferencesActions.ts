/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { DefaultPreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';

export class OpenGlobalSettingsAction extends Action {

	public static ID = 'workbench.action.openGlobalSettings';
	public static LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.preferencesService.openGlobalSettings();
	}
}

export class OpenGlobalKeybindingsAction extends Action {

	public static ID = 'workbench.action.openGlobalKeybindings';
	public static LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openGlobalKeybindingSettings();
	}
}

export class OpenWorkspaceSettingsAction extends Action {

	public static ID = 'workbench.action.openWorkspaceSettings';
	public static LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.preferencesService.openWorkspaceSettings();
	}
}

export class StartSearchDefaultSettingsAction extends Action {

	public static ID = 'defaultSettings.action.focusSearch';
	public static LABEL = nls.localize('startSearchDefaultSettings', "Focus Default Settings Search");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private workbenchEditorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	get enabled(): boolean {
		return this.getDefaultPreferencesEditor() !== null;
	}

	public run(event?: any): TPromise<void> {
		const defaultPreferencesEditor = this.getDefaultPreferencesEditor();
		if (defaultPreferencesEditor) {
			defaultPreferencesEditor.focus();
		}
		return TPromise.as(null);
	}

	private getDefaultPreferencesEditor(): DefaultPreferencesEditor {
		const activeEditor = this.workbenchEditorService.getActiveEditor();
		if (activeEditor instanceof SideBySideEditor) {
			const detailsEditor = activeEditor.getDetailsEditor();
			if (detailsEditor instanceof DefaultPreferencesEditor) {
				return detailsEditor;
			}
		}
		return null;
	}
}