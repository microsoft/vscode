/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Schemas } from 'vs/base/common/network';
import { ITextFileService, ISaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { toResource } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';

export class OpenLocalFileAction extends Action {

	static readonly ID = 'workbench.action.files.openLocalFile';
	static LABEL = nls.localize('openLocalFile', "Open Local File...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Promise<any> {
		return this.dialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data, availableFileSystems: [Schemas.file] });
	}
}

export class SaveLocalFileAction extends Action {

	static readonly ID = 'workbench.action.files.saveLocalFile';
	static LABEL = nls.localize('saveLocalFile', "Save Local File...");

	constructor(
		id: string,
		label: string,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	async run(event?: any, data?: ITelemetryData): Promise<any> {
		let resource: URI | undefined = toResource(this.editorService.activeEditor);
		const options: ISaveOptions = { force: true, availableFileSystems: [Schemas.file] };
		if (resource) {
			return this.textFileService.saveAs(resource, undefined, options);
		}
	}
}

export class OpenLocalFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openLocalFolder';
	static LABEL = nls.localize('openLocalFolder', "Open Local Folder...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Promise<any> {
		return this.dialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data, availableFileSystems: [Schemas.file] });
	}
}

export class OpenLocalFileFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openLocalFileFolder';
	static LABEL = nls.localize('openLocalFileFolder', "Open Local...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Promise<any> {
		return this.dialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data, availableFileSystems: [Schemas.file] });
	}
}
