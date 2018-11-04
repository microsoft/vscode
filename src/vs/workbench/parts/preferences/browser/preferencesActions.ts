/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export class OpenRawDefaultSettingsAction extends Action {

	public static readonly ID = 'workbench.action.openRawDefaultSettings';
	public static readonly LABEL = nls.localize('openRawDefaultSettings', "Open Raw Default Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openRawDefaultSettings();
	}
}

export class OpenSettings2Action extends Action {

	public static readonly ID = 'workbench.action.openSettings2';
	public static readonly LABEL = nls.localize('openSettings2', "Open Settings (UI)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openSettings(false);
	}
}

export class OpenSettingsAction extends Action {

	public static readonly ID = 'workbench.action.openSettings';
	public static readonly LABEL = nls.localize('openSettings', "Open Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openSettings();
	}
}

export class OpenSettingsJsonAction extends Action {

	public static readonly ID = 'workbench.action.openSettingsJson';
	public static readonly LABEL = nls.localize('openSettingsJson', "Open Settings (JSON)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openSettings(true);
	}
}

export class OpenGlobalSettingsAction extends Action {

	public static readonly ID = 'workbench.action.openGlobalSettings';
	public static readonly LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService,
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openGlobalSettings();
	}
}

export class OpenGlobalKeybindingsAction extends Action {

	public static readonly ID = 'workbench.action.openGlobalKeybindings';
	public static readonly LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openGlobalKeybindingSettings(false);
	}
}

export class OpenGlobalKeybindingsFileAction extends Action {

	public static readonly ID = 'workbench.action.openGlobalKeybindingsFile';
	public static readonly LABEL = nls.localize('openGlobalKeybindingsFile', "Open Keyboard Shortcuts File");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openGlobalKeybindingSettings(true);
	}
}

export class OpenDefaultKeybindingsFileAction extends Action {

	public static readonly ID = 'workbench.action.openDefaultKeybindingsFile';
	public static readonly LABEL = nls.localize('openDefaultKeybindingsFile', "Open Default Keyboard Shortcuts File");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openDefaultKeybindingsFile();
	}
}

export class OpenWorkspaceSettingsAction extends Action {

	public static readonly ID = 'workbench.action.openWorkspaceSettings';
	public static readonly LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
	) {
		super(id, label);
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	public run(event?: any): TPromise<any> {
		return this.preferencesService.openWorkspaceSettings();
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export const OPEN_FOLDER_SETTINGS_COMMAND = '_workbench.action.openFolderSettings';
export const OPEN_FOLDER_SETTINGS_LABEL = nls.localize('openFolderSettings', "Open Folder Settings");
export class OpenFolderSettingsAction extends Action {

	public static readonly ID = 'workbench.action.openFolderSettings';
	public static readonly LABEL = OPEN_FOLDER_SETTINGS_LABEL;

	private disposables: IDisposable[] = [];


	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@ICommandService private commandService: ICommandService,
	) {
		super(id, label);
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceContextService.getWorkspace().folders.length > 0;
	}

	public run(): TPromise<any> {
		return this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID)
			.then(workspaceFolder => {
				if (workspaceFolder) {
					return this.preferencesService.openFolderSettings(workspaceFolder.uri);
				}

				return null;
			});
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class ConfigureLanguageBasedSettingsAction extends Action {

	public static readonly ID = 'workbench.action.configureLanguageBasedSettings';
	public static readonly LABEL = nls.localize('configureLanguageBasedSettings', "Configure Language Specific Settings...");

	constructor(
		id: string,
		label: string,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const languages = this.modeService.getRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.sort().map((lang, index) => {
			let description: string = nls.localize('languageDescriptionConfigured', "({0})", this.modeService.getModeIdForLanguageName(lang.toLowerCase()));
			// construct a fake resource to be able to show nice icons if any
			let fakeResource: URI;
			const extensions = this.modeService.getExtensions(lang);
			if (extensions && extensions.length) {
				fakeResource = URI.file(extensions[0]);
			} else {
				const filenames = this.modeService.getFilenames(lang);
				if (filenames && filenames.length) {
					fakeResource = URI.file(filenames[0]);
				}
			}
			return {
				label: lang,
				iconClasses: getIconClasses(this.modelService, this.modeService, fakeResource),
				description
			} as IQuickPickItem;
		});

		return this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language") })
			.then(pick => {
				if (pick) {
					const modeId = this.modeService.getModeIdForLanguageName(pick.label.toLowerCase());
					return this.preferencesService.configureSettingsForLanguage(modeId);
				}
				return undefined;
			});

	}
}
