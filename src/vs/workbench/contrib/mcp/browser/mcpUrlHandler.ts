/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { McpConfigurationServer } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IOpenURLOptions, IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { McpAddConfigurationCommand } from './mcpCommandsAddConfiguration.js';

const providerScheme = 'mcp-install';

export class McpUrlHandler extends Disposable implements IWorkbenchContribution, ITextModelContentProvider, IURLHandler {
	public static readonly scheme = providerScheme;

	private installContent?: string;

	constructor(
		@IURLService urlService: IURLService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();
		this._register(urlService.registerHandler(this));
		textModelService.registerTextModelContentProvider(providerScheme, this);
	}

	provideTextContent(resource: URI): Promise<ITextModel> {
		return Promise.resolve(this._modelService.createModel(this.installContent || '', { onDidChange: Event.None, languageId: 'json' }, resource));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (uri.path !== 'mcp/install') {
			return false;
		}

		let parsed: McpConfigurationServer & { name: string };
		try {
			parsed = JSON.parse(decodeURIComponent(uri.query));
		} catch (e) {
			return false;
		}

		const { name, ...rest } = parsed;
		this.installContent = JSON.stringify(rest, null, '\t');

		const addConfigHelper = this._instaService.createInstance(McpAddConfigurationCommand, undefined);
		addConfigHelper.pickForUrlHandler(URI.from({ scheme: providerScheme, path: `/${encodeURIComponent(name)}.json` }), rest);

		return Promise.resolve(true);
	}
}
