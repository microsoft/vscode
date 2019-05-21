/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService, IResourceEncodings, IResourceEncoding } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserTextFileService extends TextFileService {

	readonly encoding: IResourceEncodings = {
		getPreferredWriteEncoding(): IResourceEncoding {
			return { encoding: 'utf8', hasBOM: false };
		}
	};
}

registerSingleton(ITextFileService, BrowserTextFileService);