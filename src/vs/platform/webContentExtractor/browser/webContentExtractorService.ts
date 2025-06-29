/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../files/common/files.js';
import { IWebContentExtractorService } from '../common/webContentExtractor.js';
import { URI } from '../../../base/common/uri.js';

export class FileServiceWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	async extract(uris: URI[]): Promise<string[]> {
		const results: string[] = [];

		for (const uri of uris) {
			try {
				// Try to read the content via file service
				const fileContent = await this._fileService.readFile(uri);
				// Convert VSBuffer to string
				results.push(fileContent.value.toString());
			} catch (error) {
				// If file service can't read it, return empty content
				results.push('');
			}
		}

		return results;
	}
}
