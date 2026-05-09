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
import { ISearchPanelPromptContext, SearchPanelPrompt } from '../../prompts/node/panel/searchPanelPrompt';


class SearchIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(intent, location, endpoint);
	}

	createRenderer(promptContext: ISearchPanelPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		return PromptRenderer.create(this.instantiationService, endpoint, SearchPanelPrompt, {
			promptContext,
			endpoint
		});
	}
}

export class SearchPanelIntent implements IIntent {
	static readonly ID = Intent.SearchPanel;

	readonly id = SearchPanelIntent.ID;

	readonly description = l10n.t('Search code in your current workspace');

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
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		return this.instantiationService.createInstance(SearchIntentInvocation, this, location, endpoint);
	}
}
