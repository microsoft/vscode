/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { IPromptContentsProvider } from '../contentProviders/types.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { BasePromptParser, IPromptParserOptions } from './basePromptParser.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { TextModelContentsProvider } from '../contentProviders/textModelContentsProvider.js';
import { FilePromptContentProvider } from '../contentProviders/filePromptContentsProvider.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../../../base/common/network.js';

/**
 * Get prompt contents provider object based on the prompt type.
 */
function getContentsProvider(
	uri: URI,
	options: Partial<IPromptParserOptions>,
	modelService: IModelService,
	instaService: IInstantiationService
): IPromptContentsProvider {
	// use text model contents provider for `untitled` documents
	if (uri.scheme === Schemas.untitled) {
		const model = modelService.getModel(uri);

		assertDefined(
			model,
			`Cannot find model of untitled document '${uri.path}'.`,
		);

		return instaService
			.createInstance(TextModelContentsProvider, model, options);
	}

	return instaService
		.createInstance(FilePromptContentProvider, uri, options);
}

/**
 * General prompt parser class that automatically infers a prompt
 * contents provider type by the type of provided prompt URI.
 */
export class PromptParser extends BasePromptParser<IPromptContentsProvider> {
	/**
	 * Underlying prompt contents provider instance.
	 */
	private readonly contentsProvider: IPromptContentsProvider;

	constructor(
		uri: URI,
		options: Partial<IPromptParserOptions>,
		@ILogService logService: ILogService,
		@IModelService modelService: IModelService,
		@IInstantiationService instaService: IInstantiationService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
	) {
		const contentsProvider = getContentsProvider(uri, options, modelService, instaService);

		super(
			contentsProvider,
			options,
			instaService,
			workspaceService,
			logService,
		);

		this.contentsProvider = this._register(contentsProvider);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		const { sourceName } = this.contentsProvider;

		return `prompt-parser:${sourceName}:${this.uri.path}`;
	}
}
