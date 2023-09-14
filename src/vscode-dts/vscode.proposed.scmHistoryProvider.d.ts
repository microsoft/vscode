/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/185269

	export interface SourceControl {
		historyProvider?: SourceControlHistoryProvider;
	}

	export interface SourceControlHistoryProvider {
		actionButton?: SourceControlActionButton;

		onDidChange: Event<SourceControlHistoryChangeEvent>;
		onDidChangeActionButton: Event<void>;

		provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions, token: CancellationToken): ProviderResult<SourceControlHistoryItem[]>;
		provideHistoryItemChanges(historyItemId: string, token: CancellationToken): ProviderResult<SourceControlHistoryItemChange[]>;

		// resolveHistoryItemGroup(historyItemGroupId: string, token: CancellationToken): ProviderResult<SourceControlHistoryItemGroup | undefined>;
		resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string, token: CancellationToken): ProviderResult<SourceControlHistoryItem>;
	}

	export interface SourceControlHistoryOptions {
		readonly cursor?: string;
		readonly limit?: number | { id?: string };
	}

	export interface SourceControlHistoryChangeEvent {
		readonly added: Iterable<SourceControlHistoryItemGroup>;
		readonly removed: Iterable<SourceControlHistoryItemGroup>;
		readonly modified: Iterable<SourceControlHistoryItemGroup>;
	}

	export interface SourceControlHistoryItemGroup {
		readonly id: string;
		readonly label: string;
		readonly description?: string;
		readonly range: { start: string; end: string };
		readonly count?: number;
		readonly priority?: number;
	}

	export interface SourceControlHistoryItem {
		readonly id: string;
		readonly parentIds: string[];
		readonly label: string;
		readonly description?: string;
		readonly icon?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
		readonly timestamp?: number;
	}

	export interface SourceControlHistoryItemChange {
		readonly uri: Uri;
		readonly originalUri: Uri | undefined;
		readonly modifiedUri: Uri | undefined;
		readonly renameUri: Uri | undefined;
	}

}
