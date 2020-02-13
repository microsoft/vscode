/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';
import { IFileService } from 'vs/platform/files/common/files';

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
		@IElectronEnvironmentService private readonly electronEnvironmentSerice: IElectronEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IElectronService private readonly electronService: IElectronService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const folderStat = await this.fileService.resolve(this.electronEnvironmentSerice.extHostLogsPath);
		if (folderStat.children && folderStat.children[0]) {
			return this.electronService.showItemInFolder(folderStat.children[0].resource.fsPath);
		}
	}
}
