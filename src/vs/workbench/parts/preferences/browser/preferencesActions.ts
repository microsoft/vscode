/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export class DefineSettingAction extends Action {

	public static ID = 'workbench.action.defineSetting';
	public static LABEL = nls.localize('defineSetting', "Define Setting");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.preferencesService.pickSetting();
	}
}

export class DefineUserSettingAction extends Action {

	public static ID = 'workbench.action.defineGlobalSetting';
	public static LABEL = nls.localize('defineGlobalSetting', "Define User Setting");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.preferencesService.pickSetting(ConfigurationTarget.USER);
	}
}

export class DefineWorkspaceSettingAction extends Action {

	public static ID = 'workbench.action.defineWorkspaceSetting';
	public static LABEL = nls.localize('defineWorkspaceSetting', "Define Workspace Setting");

	constructor(
		id: string,
		label: string,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IPreferencesService private contextService: IWorkspaceContextService
	) {
		super(id, label);
		this.enabled = !!contextService.getWorkspace();
	}

	public run(event?: any): TPromise<void> {
		return this.preferencesService.pickSetting(ConfigurationTarget.WORKSPACE);
	}
}

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