/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { BasePromptParser, IPromptParserOptions } from './basePromptParser.js';
import { FilePromptContentProvider } from '../contentProviders/filePromptContentsProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

/**
 * Class capable of parsing prompt syntax out of a provided file,
 * including all the nested child file references it may have.
 */
export class FilePromptParser extends BasePromptParser<FilePromptContentProvider> {
	constructor(
		uri: URI,
		options: IPromptParserOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService envService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
	) {
		const contentsProvider = instantiationService.createInstance(FilePromptContentProvider, uri, options);
		super(contentsProvider, options, instantiationService, envService, logService);

		this._register(contentsProvider);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `file-prompt:${this.uri.path}`;
	}
}
