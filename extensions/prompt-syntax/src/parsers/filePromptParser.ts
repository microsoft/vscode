/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';

import { PromptParserBase } from './promptParserBase';
import { FileContentsProvider } from './contentProviders';
import { IFileSystemService, ILogService } from '../services/types';

/**
 * Class capable of parsing prompt syntax out of a provided file,
 * including all the nested child file references it may have.
 */
export class FilePromptParser extends PromptParserBase<FileContentsProvider> {
	constructor(
		uri: URI,
		seenReferences: string[] = [],
		filesystemService: IFileSystemService,
		logService: ILogService,
	) {
		const contentsProvider = new FileContentsProvider(uri, filesystemService, logService);
		super(contentsProvider, seenReferences, filesystemService, logService);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `file-prompt:${this.uri.path}`;
	}
}
