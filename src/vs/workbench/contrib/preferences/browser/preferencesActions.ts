/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { dispose, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export class OpenRawDefaultSettingsAction extends Action {

	static readonly ID = 'workbench.action.openRawDefaultSettings';
	static readonly LABEL = nls.localize('openRawDefaultSettings', "Open Default Settings (JSON)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openRawDefaultSettings();
	}
}

export class OpenSettings2Action extends Action {

	static readonly ID = 'workbench.action.openSettings2';
	static readonly LABEL = nls.localize('openSettings2', "Open Settings (UI)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openSettings(false, undefined);
	}
}

export class OpenSettingsJsonAction extends Action {

	static readonly ID = 'workbench.action.openSettingsJson';
	static readonly LABEL = nls.localize('openSettingsJson', "Open Settings (JSON)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openSettings(true, undefined);
	}
}

export class OpenGlobalSettingsAction extends Action {

	static readonly ID = 'workbench.action.openGlobalSettings';
	static readonly LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openGlobalSettings();
	}
}

export class OpenRemoteSettingsAction extends Action {

	static readonly ID = 'workbench.action.openRemoteSettings';

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openRemoteSettings();
	}
}

export class OpenGlobalKeybindingsAction extends Action {

	static readonly ID = 'workbench.action.openGlobalKeybindings';
	static readonly LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openGlobalKeybindingSettings(false);
	}
}

export class OpenGlobalKeybindingsFileAction extends Action {

	static readonly ID = 'workbench.action.openGlobalKeybindingsFile';
	static readonly LABEL = nls.localize('openGlobalKeybindingsFile', "Open Keyboard Shortcuts (JSON)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openGlobalKeybindingSettings(true);
	}
}

export class OpenDefaultKeybindingsFileAction extends Action {

	static readonly ID = 'workbench.action.openDefaultKeybindingsFile';
	static readonly LABEL = nls.localize('openDefaultKeybindingsFile', "Open Default Keyboard Shortcuts (JSON)");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openDefaultKeybindingsFile();
	}
}

export class OpenWorkspaceSettingsAction extends Action {

	static readonly ID = 'workbench.action.openWorkspaceSettings';
	static readonly LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	private readonly disposables = new DisposableStore();

	constructor(
		id: string,
		label: string,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(id, label);
		this.update();
		this.disposables.add(this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this));
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	run(event?: any): Promise<any> {
		return this.preferencesService.openWorkspaceSettings();
	}

	dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}

export const OPEN_FOLDER_SETTINGS_COMMAND = '_workbench.action.openFolderSettings';
export const OPEN_FOLDER_SETTINGS_LABEL = nls.localize('openFolderSettings', "Open Folder Settings");
export class OpenFolderSettingsAction extends Action {

	static readonly ID = 'workbench.action.openFolderSettings';
	static readonly LABEL = OPEN_FOLDER_SETTINGS_LABEL;

	private disposables: IDisposable[] = [];


	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(id, label);
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceContextService.getWorkspace().folders.length > 0;
	}

	run(): Promise<any> {
		return this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID)
			.then(workspaceFolder => {
				if (workspaceFolder) {
					return this.preferencesService.openFolderSettings(workspaceFolder.uri);
				}

				return undefined;
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class ConfigureLanguageBasedSettingsAction extends Action {

	static readonly ID = 'workbench.action.configureLanguageBasedSettings';
	static readonly LABEL = nls.localize('configureLanguageBasedSettings', "Configure Language Specific Settings...");

	constructor(
		id: string,
		label: string,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const languages = this.modeService.getRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.sort().map((lang, index) => {
			const description: string = nls.localize('languageDescriptionConfigured', "({0})", this.modeService.getModeIdForLanguageName(lang.toLowerCase()));
			// construct a fake resource to be able to show nice icons if any
			let fakeResource: URI | undefined;
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
					if (typeof modeId === 'string') {
						return this.preferencesService.configureSettingsForLanguage(modeId);
					}
				}
				return undefined;
			});

	}
}
