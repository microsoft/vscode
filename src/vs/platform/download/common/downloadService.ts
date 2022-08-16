/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IFileService } from 'vs/platform/files/common/files';
import { asTextOrError, IRequestService } from 'vs/platform/request/common/request';

export class DownloadService implements IDownloadService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService
	) { }

	async download(resource: URI, target: URI, cancellationToken: CancellationToken = CancellationToken.None): Promise<void> {
		if (resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote) {
			// Intentionally only support this for file|remote<->file|remote scenarios
			await this.fileService.copy(resource, target);
			return;
		}
		const options = { type: 'GET', url: resource.toString(true) };
		const context = await this.requestService.request(options, cancellationToken);
		if (context.res.statusCode === 200) {
			await this.fileService.writeFile(target, context.stream);
		} else {
			const message = await asTextOrError(context);
			throw new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
		}
	}
}
