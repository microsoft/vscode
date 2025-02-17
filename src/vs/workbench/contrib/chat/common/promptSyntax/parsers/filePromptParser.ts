/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptParser } from './basePromptParser.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { FilePromptContentProvider } from '../contentProviders/filePromptContentsProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Class capable of parsing prompt syntax out of a provided file,
 * including all the nested child file references it may have.
 */
export class FilePromptParser extends BasePromptParser<FilePromptContentProvider> {
	constructor(
		uri: URI,
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@ILogService logService: ILogService,
	) {
		const contentsProvider = initService.createInstance(FilePromptContentProvider, uri);
		super(contentsProvider, seenReferences, initService, logService);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `file-prompt:${this.uri.path}`;
	}
}
