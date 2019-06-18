/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService, IResourceEncodings, IResourceEncoding } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class BrowserTextFileService extends TextFileService {

	readonly encoding: IResourceEncodings = {
		getPreferredWriteEncoding(): IResourceEncoding {
			return { encoding: 'utf8', hasBOM: false };
		}
	};

	protected beforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {
		const veto = super.beforeShutdown(reason);

		// Web: there is no support for long running unload handlers. As such
		// we need to return a direct boolean veto when we detect that there
		// are dirty files around. 
		if (veto instanceof Promise) {
			return this.getDirty().length > 0;
		}

		return veto;
	}
}

registerSingleton(ITextFileService, BrowserTextFileService);