/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ISCMActionButtonDescriptor } from 'vs/workbench/contrib/scm/common/scm';

export interface ISCMHistoryProvider {
	actionButton: () => ISCMActionButtonDescriptor | undefined;
	currentHistoryItemGroup: () => ISCMHistoryItemGroup | undefined;
	provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string | undefined): Promise<{ id: string; ahead: number; behind: number } | undefined>;
}

export interface ISCMHistoryOptions {
	readonly cursor?: string;
	readonly limit?: number | { id?: string };
}

export interface ISCMHistoryItemGroup {
	readonly id: string;
	readonly label: string;
	readonly upstream?: ISCMRemoteHistoryItemGroup;
}

export interface ISCMRemoteHistoryItemGroup {
	readonly id: string;
	readonly label: string;
}

export interface ISCMHistoryItem {
	readonly id: string;
	readonly parentIds: string[];
	readonly label: string;
	readonly description?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly timestamp?: number;
}

export interface ISCMHistoryItemChange {
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly modifiedUri?: URI;
	readonly renameUri?: URI;
}
