/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { join } from 'vs/base/common/path';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';

export class OpenLogsFolderAction extends Action {

	static readonly ID = 'workbench.action.openLogsFolder';
	static readonly LABEL = nls.localize('openLogsFolder', "Open Logs Folder");

	constructor(id: string, label: string,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IElectronService private readonly electronService: IElectronService,
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.electronService.showItemInFolder(URI.file(join(this.environmentService.logsPath, 'main.log')).fsPath);
	}
}

export class OpenExtensionLogsFolderAction extends Action {

	static readonly ID = 'workbench.action.openExtensionLogsFolder';
	static readonly LABEL = nls.localize('openExtensionLogsFolder', "Open Extension Logs Folder");

	constructor(id: string, label: string,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IElectronService private readonly electronService: IElectronService,
		@IElectronEnvironmentService private readonly electronEnvironmentService: IElectronEnvironmentService,
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const extensionLogsPath = URI.file(join(this.environmentService.logsPath, `exthost${this.electronEnvironmentService.windowId}`, 'exthost.log')).fsPath;
		return this.electronService.showItemInFolder(extensionLogsPath);
	}
}
