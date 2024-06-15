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
		currentHistoryItemGroup?: SourceControlHistoryItemGroup;

		/**
		 * Fires when the current history item group changes after
		 * a user action (ex: commit, checkout, fetch, pull, push)
		 */
		onDidChangeCurrentHistoryItemGroup: Event<void>;

		/**
		 * Fires when the history item groups change (ex: commit, push, fetch)
		 */
		// onDidChangeHistoryItemGroups: Event<SourceControlHistoryChangeEvent>;

		provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions, token: CancellationToken): ProviderResult<SourceControlHistoryItem[]>;
		provideHistoryItemSummary?(historyItemId: string, historyItemParentId: string | undefined, token: CancellationToken): ProviderResult<SourceControlHistoryItem>;
		provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined, token: CancellationToken): ProviderResult<SourceControlHistoryItemChange[]>;

		resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string | undefined, token: CancellationToken): ProviderResult<{ id: string; ahead: number; behind: number }>;
	}

	export interface SourceControlHistoryOptions {
		readonly cursor?: string;
		readonly limit?: number | { id?: string };
	}

	export interface SourceControlHistoryItemGroup {
		readonly id: string;
		readonly name: string;
		readonly base?: Omit<SourceControlRemoteHistoryItemGroup, 'base'>;
	}

	export interface SourceControlRemoteHistoryItemGroup {
		readonly id: string;
		readonly name: string;
	}

	export interface SourceControlHistoryItemStatistics {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	}

	export interface SourceControlHistoryItem {
		readonly id: string;
		readonly parentIds: string[];
		readonly message: string;
		readonly author?: string;
		readonly icon?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
		readonly timestamp?: number;
		readonly statistics?: SourceControlHistoryItemStatistics;
	}

	export interface SourceControlHistoryItemChange {
		readonly uri: Uri;
		readonly originalUri: Uri | undefined;
		readonly modifiedUri: Uri | undefined;
		readonly renameUri: Uri | undefined;
	}

	// export interface SourceControlHistoryChangeEvent {
	// 	readonly added: Iterable<SourceControlHistoryItemGroup>;
	// 	readonly removed: Iterable<SourceControlHistoryItemGroup>;
	// 	readonly modified: Iterable<SourceControlHistoryItemGroup>;
	// }

}
