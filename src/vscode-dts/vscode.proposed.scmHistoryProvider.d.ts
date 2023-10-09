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
		currentHistoryItemGroup?: SourceControlHistoryItemGroup;

		/**
		 * Fires when the action button changes
		 */
		onDidChangeActionButton: Event<void>;

		/**
		 * Fires when the current history item group changes (ex: checkout)
		 */
		onDidChangeCurrentHistoryItemGroup: Event<void>;

		/**
		 * Fires when the history item groups change (ex: commit, push, fetch)
		 */
		// onDidChangeHistoryItemGroups: Event<SourceControlHistoryChangeEvent>;

		provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions, token: CancellationToken): ProviderResult<SourceControlHistoryItem[]>;
		provideHistoryItemChanges(historyItemId: string, token: CancellationToken): ProviderResult<SourceControlHistoryItemChange[]>;

		resolveHistoryItemGroupBase(historyItemGroupId: string, token: CancellationToken): ProviderResult<SourceControlHistoryItemGroup | undefined>;
		resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId: string, token: CancellationToken): ProviderResult<{ id: string; ahead: number; behind: number }>;
	}

	export interface SourceControlHistoryOptions {
		readonly cursor?: string;
		readonly limit?: number | { id?: string };
	}

	export interface SourceControlHistoryItemGroup {
		readonly id: string;
		readonly label: string;
		readonly upstream?: SourceControlRemoteHistoryItemGroup;
	}

	export interface SourceControlRemoteHistoryItemGroup {
		readonly id: string;
		readonly label: string;
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

	// export interface SourceControlHistoryChangeEvent {
	// 	readonly added: Iterable<SourceControlHistoryItemGroup>;
	// 	readonly removed: Iterable<SourceControlHistoryItemGroup>;
	// 	readonly modified: Iterable<SourceControlHistoryItemGroup>;
	// }

}
