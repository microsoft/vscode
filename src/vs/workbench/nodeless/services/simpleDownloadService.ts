/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDownloadService } from 'vs/platform/download/common/download';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';

export class SimpleDownloadService implements IDownloadService {

	_serviceBrand: any;

	download(uri: URI, to: string, cancellationToken?: CancellationToken): Promise<void> {
		return Promise.resolve();
	}
}