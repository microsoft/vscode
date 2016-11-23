/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IOpenSettingsService } from 'vs/workbench/parts/settings/common/openSettings';

export class OpenGlobalSettingsAction extends Action {

	public static ID = 'workbench.action.openGlobalSettings';
	public static LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	constructor(
		id: string,
		label: string,
		@IOpenSettingsService private openSettingsService: IOpenSettingsService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.openSettingsService.openGlobalSettings();
	}
}

export class OpenGlobalKeybindingsAction extends Action {

	public static ID = 'workbench.action.openGlobalKeybindings';
	public static LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IOpenSettingsService private openSettingsService: IOpenSettingsService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.openSettingsService.openGlobalKeybindingSettings();
	}
}

export class OpenWorkspaceSettingsAction extends Action {

	public static ID = 'workbench.action.openWorkspaceSettings';
	public static LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	constructor(
		id: string,
		label: string,
		@IOpenSettingsService private openSettingsService: IOpenSettingsService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<void> {
		return this.openSettingsService.openWorkspaceSettings();
	}
}