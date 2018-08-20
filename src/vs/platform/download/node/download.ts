/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDownloadService } from 'vs/platform/download/common/download';

export class DownloadService implements IDownloadService {

	_serviceBrand: any;

	download(from: URI, to: string): TPromise<void> {
		throw new Error('Not supported');
	}

}