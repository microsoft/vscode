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
		readonly currentHistoryItemRef: SourceControlHistoryItemRef | undefined;
		readonly currentHistoryItemRemoteRef: SourceControlHistoryItemRef | undefined;
		readonly currentHistoryItemBaseRef: SourceControlHistoryItemRef | undefined;

		/**
		 * Fires when the current history item refs (local, remote, base)
		 * change after a user action (ex: commit, checkout, fetch, pull, push)
		 */
		onDidChangeCurrentHistoryItemRefs: Event<void>;

		/**
		 * Fires when history item refs change
		 */
		onDidChangeHistoryItemRefs: Event<SourceControlHistoryItemRefsChangeEvent>;

		provideHistoryItemRefs(historyItemRefs: string[] | undefined, token: CancellationToken): ProviderResult<SourceControlHistoryItemRef[]>;
		provideHistoryItems(options: SourceControlHistoryOptions, token: CancellationToken): ProviderResult<SourceControlHistoryItem[]>;
		provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined, token: CancellationToken): ProviderResult<SourceControlHistoryItemChange[]>;

		resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[], token: CancellationToken): ProviderResult<string>;
	}

	export interface SourceControlHistoryOptions {
		readonly skip?: number;
		readonly limit?: number | { id?: string };
		readonly historyItemRefs?: readonly string[];
	}

	export interface SourceControlHistoryItemStatistics {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	}

	export interface SourceControlHistoryItem {
		readonly id: string;
		readonly parentIds: string[];
		readonly subject: string;
		readonly message: string;
		readonly displayId?: string;
		readonly author?: string;
		readonly authorEmail?: string;
		readonly authorIcon?: IconPath;
		readonly timestamp?: number;
		readonly statistics?: SourceControlHistoryItemStatistics;
		readonly references?: SourceControlHistoryItemRef[];
	}

	export interface SourceControlHistoryItemRef {
		readonly id: string;
		readonly name: string;
		readonly description?: string;
		readonly revision?: string;
		readonly category?: string;
		readonly icon?: IconPath;
	}

	export interface SourceControlHistoryItemChange {
		readonly uri: Uri;
		readonly originalUri: Uri | undefined;
		readonly modifiedUri: Uri | undefined;
	}

	export interface SourceControlHistoryItemRefsChangeEvent {
		readonly added: readonly SourceControlHistoryItemRef[];
		readonly removed: readonly SourceControlHistoryItemRef[];
		readonly modified: readonly SourceControlHistoryItemRef[];

		/**
		 * Flag to indicate if the operation that caused the event to trigger was due
		 * to a user action or a background operation (ex: Auto Fetch). The flag is used
		 * to determine whether to automatically refresh the user interface or present
		 * the user with a visual cue that the user interface is outdated.
		 */
		readonly silent: boolean;
	}
}
