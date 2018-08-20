/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IRequestService } from 'vs/platform/request/node/request';
import { Schemas } from 'vs/base/common/network';
import { copy } from 'vs/base/node/pfs';
import { download, asText } from 'vs/base/node/request';

export class DownloadService implements IDownloadService {

	_serviceBrand: any;

	constructor(
		@IRequestService private requestService: IRequestService
	) { }

	download(from: URI, to: string): TPromise<void> {
		if (from.scheme === Schemas.file) {
			return copy(from.fsPath, to);
		}
		return this.requestService.request({ url: from.path })
			.then(context => {
				if (context.res.statusCode === 200) {
					return download(to, context);
				}
				return asText(context)
					.then(message => TPromise.wrapError(new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`)));
			});
	}

}