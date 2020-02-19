/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractTextFileService } from 'vs/workbench/services/textfile/browser/textFileService';
import { ITextFileService, IResourceEncodings, IResourceEncoding, TextFileEditorModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class BrowserTextFileService extends AbstractTextFileService {

	readonly encoding: IResourceEncodings = {
		getPreferredWriteEncoding(): IResourceEncoding {
			return { encoding: 'utf8', hasBOM: false };
		}
	};

	protected registerListeners(): void {
		super.registerListeners();

		// Lifecycle
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason)));
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean {
		if (this.files.models.some(model => model.hasState(TextFileEditorModelState.PENDING_SAVE))) {
			console.warn('Unload prevented: pending file saves');

			return true; // files are pending to be saved: veto
		}

		return false;
	}
}

registerSingleton(ITextFileService, BrowserTextFileService);
