/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Progress, SettingsSearchProviderOptions, SettingsSearchResult, SettingsSearchResultKind } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { Embeddings, EmbeddingType, IEmbeddingsComputer } from '../../../platform/embeddings/common/embeddingsComputer';
import { ICombinedEmbeddingIndex, SettingListItem } from '../../../platform/embeddings/common/vscodeIndex';
import { ChatEndpointFamily, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ISettingsEditorSearchService } from '../../../platform/settingsEditor/common/settingsEditorSearchService';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { SettingsEditorSearchResultsSelector } from '../node/settingsEditorSearchResultsSelector';

export class SettingsEditorSearchServiceImpl implements ISettingsEditorSearchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ICombinedEmbeddingIndex private readonly embeddingIndex: ICombinedEmbeddingIndex,
		@IEmbeddingsComputer private readonly embeddingsComputer: IEmbeddingsComputer,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	async provideSettingsSearchResults(query: string, options: SettingsSearchProviderOptions, progress: Progress<SettingsSearchResult>, token: CancellationToken): Promise<void> {
		if (!query || options.limit <= 0) {
			return;
		}

		// Start searching for embedding results.
		let embeddingResult: Embeddings;
		try {
			embeddingResult = await this.embeddingsComputer.computeEmbeddings(EmbeddingType.text3small_512, [query], {}, new TelemetryCorrelationId('SettingsEditorSearchServiceImpl::provideSettingsSearchResults'), token);
		} catch {
			this.reportEmptyEmbeddingsResult(query, progress);
			if (!options.embeddingsOnly) {
				this.reportEmptyLLMRankedResult(query, progress);
			}
			return;
		}

		if (token.isCancellationRequested || !embeddingResult || embeddingResult.values.length === 0) {
			this.reportEmptyEmbeddingsResult(query, progress);
			if (!options.embeddingsOnly) {
				this.reportEmptyLLMRankedResult(query, progress);
			}
			return;
		}

		await this.embeddingIndex.loadIndexes();
		const embeddingSettings: SettingListItem[] = this.embeddingIndex.settingsIndex.nClosestValues(embeddingResult.values[0], 25);
		if (token.isCancellationRequested) {
			this.reportEmptyEmbeddingsResult(query, progress);
			if (!options.embeddingsOnly) {
				this.reportEmptyLLMRankedResult(query, progress);
			}
			return;
		}

		// Report final embedding results.
		progress.report({
			query,
			kind: SettingsSearchResultKind.EMBEDDED,
			settings: embeddingSettings.map(setting => setting.key)
		});

		if (options.embeddingsOnly) {
			return;
		}

		// Start searching LLM-ranked results.
		const copilotToken = await this.authenticationService.getCopilotToken();
		if (embeddingSettings.length === 0 || copilotToken.isFreeUser || copilotToken.isNoAuthUser) {
			this.reportEmptyLLMRankedResult(query, progress);
			return;
		}

		const endpointName: ChatEndpointFamily = 'copilot-base';
		const endpoint = await this.endpointProvider.getChatEndpoint(endpointName);
		const generator = this.instantiationService.createInstance(SettingsEditorSearchResultsSelector);
		const llmSearchSuggestions = await generator.selectTopSearchResults(endpoint, query, embeddingSettings, token);
		if (token.isCancellationRequested) {
			this.reportEmptyLLMRankedResult(query, progress);
			return;
		}

		// Report final LLM-ranked results.
		progress.report({
			query,
			kind: SettingsSearchResultKind.LLM_RANKED,
			settings: llmSearchSuggestions
		});
	}

	private reportEmptyEmbeddingsResult(query: string, progress: Progress<SettingsSearchResult>): void {
		progress.report({
			query,
			kind: SettingsSearchResultKind.EMBEDDED,
			settings: []
		});
	}

	private reportEmptyLLMRankedResult(query: string, progress: Progress<SettingsSearchResult>): void {
		progress.report({
			query,
			kind: SettingsSearchResultKind.LLM_RANKED,
			settings: []
		});
	}
}