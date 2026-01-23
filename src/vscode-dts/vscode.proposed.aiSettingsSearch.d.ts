/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum SettingsSearchResultKind {
		EMBEDDED = 1,
		LLM_RANKED = 2,
		CANCELED = 3
	}

	export interface SettingsSearchResult {
		query: string;
		kind: SettingsSearchResultKind;
		settings: string[];
	}

	export interface SettingsSearchProviderOptions {
		limit: number;
		embeddingsOnly: boolean;
	}

	export interface SettingsSearchProvider {
		provideSettingsSearchResults(query: string, option: SettingsSearchProviderOptions, progress: Progress<SettingsSearchResult>, token: CancellationToken): Thenable<void>;
	}

	export namespace ai {
		export function registerSettingsSearchProvider(provider: SettingsSearchProvider): Disposable;
	}
}
