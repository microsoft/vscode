/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { SettingListItem } from '../../../platform/embeddings/common/vscodeIndex';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { raceTimeout } from '../../../util/vs/base/common/async';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { SettingsEditorSuggestQueryPrompt } from '../../prompts/node/settingsEditor/settingsEditorSuggestQueryPrompt';

export class SettingsEditorSearchResultsSelector {
	private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IInteractionService private readonly interactionService: IInteractionService,
	) { }

	async selectTopSearchResults(endpoint: IChatEndpoint, query: string, settings: SettingListItem[], token: CancellationToken): Promise<string[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		const promptRenderer = PromptRenderer
			.create(
				this.instantiationService,
				endpoint,
				SettingsEditorSuggestQueryPrompt,
				{
					query,
					settings
				}
			);
		const prompt = await promptRenderer.render(undefined, token);

		this.interactionService.startInteraction();
		const fetchResult = await raceTimeout(endpoint
			.makeChatRequest(
				'settingsEditorSearchSuggestions',
				prompt.messages,
				undefined,
				token,
				ChatLocation.Other,
				undefined,
				{
					temperature: 0.1
				}
			), SettingsEditorSearchResultsSelector.DEFAULT_TIMEOUT);

		if (token.isCancellationRequested || fetchResult === undefined || fetchResult.type !== ChatFetchResponseType.Success) {
			return [];
		}

		const rawSuggestions = fetchResult.value;
		return rawSuggestions.split('\n').map(setting => setting.trim());
	}
}