/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface SettingsSearchResult {
		setting: string;
		weight: number;
	}

	export interface SettingsSearchProviderOptions {
		limit: number;
	}

	export interface SettingsSearchProvider {
		provideEmbeddingsSearchResults(query: string, option: SettingsSearchProviderOptions, token: CancellationToken): Thenable<SettingsSearchResult[]>;
		provideLLMRankedSearchResults(query: string, option: SettingsSearchProviderOptions, token: CancellationToken): Thenable<SettingsSearchResult[]>;
	}

	export namespace ai {
		export function registerSettingsSearchProvider(provider: SettingsSearchProvider): Disposable;
	}
}
