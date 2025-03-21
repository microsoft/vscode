/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiSettingsSearchService = createDecorator<IAiSettingsSearchService>('IAiSettingsSearchService');

export enum AiSettingsSearchResultBundleKind {
	EMBEDDED = 1,
	LLM_RANKED = 2,
	CANCELED = 3,
}

export interface AiSettingsSearchResult {
	setting: string;
	weight: number;
}

export interface AiSettingsSearchResultBundle {
	kind: AiSettingsSearchResultBundleKind;
	settings: AiSettingsSearchResult[];
}

export interface AiSettingsSearchProviderOptions {
	limit: number;
}

export interface IAiSettingsSearchService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	registerSettingsSearchProvider(provider: IAiSettingsSearchProvider): IDisposable;
	onSettingsSearchResultBundle(bundle: AiSettingsSearchResultBundle): void;
	startSearch(query: string, token: CancellationToken): void;
	getResultsCache(kind: AiSettingsSearchResultBundleKind): AiSettingsSearchResult[];
}

export interface IAiSettingsSearchProvider {
	searchSettings(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): void;
}
