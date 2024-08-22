/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../../base/common/buffer';
import { URI } from '../../../../base/common/uri';
import { IFileStatWithMetadata, IWriteFileOptions } from '../../../../platform/files/common/files';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IElevatedFileService } from '../common/elevatedFileService';

export class BrowserElevatedFileService implements IElevatedFileService {

	readonly _serviceBrand: undefined;

	isSupported(resource: URI): boolean {
		// Saving elevated is currently not supported in web for as
		// long as we have no generic support from the file service
		// (https://github.com/microsoft/vscode/issues/48659)
		return false;
	}

	async writeFileElevated(resource: URI, value: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		throw new Error('Unsupported');
	}
}

registerSingleton(IElevatedFileService, BrowserElevatedFileService, InstantiationType.Delayed);
