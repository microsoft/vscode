/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { BasePromptParser, IPromptParserOptions } from './basePromptParser.js';
import { TextModelContentsProvider } from '../contentProviders/textModelContentsProvider.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Class capable of parsing prompt syntax out of a provided text model,
 * including all the nested child file references it may have.
 */
export class TextModelPromptParser extends BasePromptParser<TextModelContentsProvider> {
	constructor(
		model: ITextModel,
		options: Partial<IPromptParserOptions>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@ILogService logService: ILogService,
	) {
		const contentsProvider = instantiationService.createInstance(
			TextModelContentsProvider,
			model,
			options,
		);

		super(contentsProvider, options, instantiationService, workspaceService, logService);

		this._register(contentsProvider);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `text-model-prompt:${this.uri.path}`;
	}
}
