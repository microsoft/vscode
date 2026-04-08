/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { ISearchPanelKeywordsPromptContext, SearchPanelKeywordsPrompt } from '../../prompts/node/panel/searchPanelKeywordsPrompt';


class SearchKeywordsIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(intent, location, endpoint);
	}

	createRenderer(promptContext: ISearchPanelKeywordsPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		return PromptRenderer.create(this.instantiationService, endpoint, SearchPanelKeywordsPrompt, {
			promptContext,
			endpoint
		});
	}
}

export class SearchKeywordsIntent implements IIntent {
	static readonly ID = Intent.SearchKeywords;

	readonly id = SearchKeywordsIntent.ID;

	readonly description = l10n.t('Search code keywords in your current workspace');

	readonly locations = [ChatLocation.Other];

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: false,
		defaultEnablement: true,
	};

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		return this.instantiationService.createInstance(SearchKeywordsIntentInvocation, this, location, endpoint);
	}
}
