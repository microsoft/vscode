/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum SettingsSearchResultBundleKind {
		EMBEDDED = 1,
		LLM_RANKED = 2,
		CANCELED = 3
	}

	export interface SettingsSearchResult {
		setting: string;
		weight: number;
	}

	export interface SettingsSearchResultBundle {
		kind: SettingsSearchResultBundleKind;
		settings: SettingsSearchResult[];
	}

	export interface SettingsSearchProviderOptions {
		limit: number;
	}

	export interface SettingsSearchProvider {
		provideSettingsSearchResults(query: string, option: SettingsSearchProviderOptions, progress: Progress<SettingsSearchResultBundle>, token: CancellationToken): Thenable<void>;
	}

	export namespace ai {
		export function registerSettingsSearchProvider(provider: SettingsSearchProvider): Disposable;
	}
}
