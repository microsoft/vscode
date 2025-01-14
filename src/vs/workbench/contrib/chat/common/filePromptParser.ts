/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { BasePromptParser } from './basePromptParser.js';
import { FilePromptContentProvider } from './promptContentProviders/filePromptContentsProvider.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Class capable of parsing prompt syntax out of a provided file,
 * including all the nested child file references it may have.
 */
export class FilePromptParser extends BasePromptParser<FilePromptContentProvider> {
	constructor(
		uri: URI,
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const contentsProvider = initService.createInstance(FilePromptContentProvider, uri);
		super(contentsProvider, seenReferences, initService, configService);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `file-prompt:${this.uri.path}`;
	}
}
