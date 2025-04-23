/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiSettingsSearchService = createDecorator<IAiSettingsSearchService>('IAiSettingsSearchService');

export enum AiSettingsSearchResultKind {
	EMBEDDED = 1,
	LLM_RANKED = 2,
	CANCELED = 3,
}

export interface AiSettingsSearchResult {
	query: string;
	kind: AiSettingsSearchResultKind;
	settings: string[];
}

export interface AiSettingsSearchProviderOptions {
	limit: number;
}

export interface IAiSettingsSearchService {
	readonly _serviceBrand: undefined;

	// Called from the Settings editor
	isEnabled(): boolean;
	startSearch(query: string, token: CancellationToken): void;
	getEmbeddingsResults(query: string, token: CancellationToken): Promise<string[] | null>;
	getLLMRankedResults(query: string, token: CancellationToken): Promise<string[] | null>;

	// Called from the main thread
	registerSettingsSearchProvider(provider: IAiSettingsSearchProvider): IDisposable;
	handleSearchResult(results: AiSettingsSearchResult): void;
}

export interface IAiSettingsSearchProvider {
	searchSettings(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): void;
}
