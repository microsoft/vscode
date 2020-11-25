/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHostProfileService } from './runtimeExtensionsEditor';

export class SaveExtensionHostProfileAction extends Action {

	static readonly LABEL = nls.localize('saveExtensionHostProfile', "Save Extension Host Profile");
	static readonly ID = 'workbench.extensions.action.saveExtensionHostProfile';

	constructor(
		id: string = SaveExtensionHostProfileAction.ID, label: string = SaveExtensionHostProfileAction.LABEL,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
		@IFileService private readonly _fileService: IFileService
	) {
		super(id, label, undefined, false);
		this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this.enabled = (this._extensionHostProfileService.lastProfile !== null);
		});
	}

	run(): Promise<any> {
		return Promise.resolve(this._asyncRun());
	}

	private async _asyncRun(): Promise<any> {
		let picked = await this._nativeHostService.showSaveDialog({
			title: 'Save Extension Host Profile',
			buttonLabel: 'Save',
			defaultPath: `CPU-${new Date().toISOString().replace(/[\-:]/g, '')}.cpuprofile`,
			filters: [{
				name: 'CPU Profiles',
				extensions: ['cpuprofile', 'txt']
			}]
		});

		if (!picked || !picked.filePath || picked.canceled) {
			return;
		}

		const profileInfo = this._extensionHostProfileService.lastProfile;
		let dataToWrite: object = profileInfo ? profileInfo.data : {};

		let savePath = picked.filePath;

		if (this._environmentService.isBuilt) {
			const profiler = await import('v8-inspect-profiler');
			// when running from a not-development-build we remove
			// absolute filenames because we don't want to reveal anything
			// about users. We also append the `.txt` suffix to make it
			// easier to attach these files to GH issues
			let tmp = profiler.rewriteAbsolutePaths({ profile: dataToWrite as any }, 'piiRemoved');
			dataToWrite = tmp.profile;

			savePath = savePath + '.txt';
		}

		return this._fileService.writeFile(URI.file(savePath), VSBuffer.fromString(JSON.stringify(profileInfo ? profileInfo.data : {}, null, '\t')));
	}
}
