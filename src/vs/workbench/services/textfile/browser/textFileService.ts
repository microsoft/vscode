/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService, IResourceEncodings, IResourceEncoding } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { Schemas } from 'vs/base/common/network';

export class BrowserTextFileService extends TextFileService {

	readonly encoding: IResourceEncodings = {
		getPreferredWriteEncoding(): IResourceEncoding {
			return { encoding: 'utf8', hasBOM: false };
		}
	};

	protected onBeforeShutdown(reason: ShutdownReason): boolean {
		// Web: we cannot perform long running in the shutdown phase
		// As such we need to check sync if there are any dirty files
		// that have not been backed up yet and then prevent the shutdown
		// if that is the case.
		return this.doBeforeShutdownSync();
	}

	private doBeforeShutdownSync(): boolean {
		const dirtyResources = this.getDirty();
		if (!dirtyResources.length) {
			return false; // no dirty: no veto
		}

		if (!this.isHotExitEnabled) {
			return true; // dirty without backup: veto
		}

		for (const dirtyResource of dirtyResources) {
			let hasBackup = false;

			if (this.fileService.canHandleResource(dirtyResource)) {
				const model = this.models.get(dirtyResource);
				hasBackup = !!(model && model.hasBackup());
			} else if (dirtyResource.scheme === Schemas.untitled) {
				hasBackup = this.untitledEditorService.hasBackup(dirtyResource);
			}

			if (!hasBackup) {
				console.warn('Unload prevented: pending backups');
				return true; // dirty without backup: veto
			}
		}

		return false; // dirty with backups: no veto
	}
}

registerSingleton(ITextFileService, BrowserTextFileService);
