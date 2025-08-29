/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { BasePromptParser, IPromptParserOptions } from './basePromptParser.js';
import { TextModelContentsProvider } from '../contentProviders/textModelContentsProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

/**
 * Class capable of parsing prompt syntax out of a provided text model,
 * including all the nested child file references it may have.
 */
export class TextModelPromptParser extends BasePromptParser<TextModelContentsProvider> {
	constructor(
		model: ITextModel,
		options: IPromptParserOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService envService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
	) {
		const contentsProvider = instantiationService.createInstance(
			TextModelContentsProvider,
			model,
			options,
		);

		super(contentsProvider, options, instantiationService, envService, logService);

		this._register(contentsProvider);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `text-model-prompt:${this.uri.path}`;
	}
}
