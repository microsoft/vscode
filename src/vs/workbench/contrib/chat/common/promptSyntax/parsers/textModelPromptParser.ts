/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptParser } from './basePromptParser.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
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
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@ILogService logService: ILogService,
	) {
		const contentsProvider = initService.createInstance(TextModelContentsProvider, model);

		super(contentsProvider, seenReferences, initService, workspaceService, logService);

		this._register(contentsProvider);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-model-prompt:${this.uri.path}`;
	}
}
