/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IMenu } from 'vs/platform/actions/common/actions';
import { ISCMRepository } from 'vs/workbench/contrib/scm/common/scm';

export interface ISCMHistoryProviderMenus {
	getHistoryItemGroupMenu(historyItemGroup: SCMHistoryItemGroupTreeElement): IMenu;
	getHistoryItemGroupContextMenu(historyItemGroup: SCMHistoryItemGroupTreeElement): IMenu;

	getHistoryItemMenu(historyItem: SCMHistoryItemTreeElement): IMenu;
}

export interface ISCMHistoryProvider {

	readonly onDidChangeCurrentHistoryItemGroup: Event<void>;

	get currentHistoryItemGroup(): ISCMHistoryItemGroup | undefined;
	set currentHistoryItemGroup(historyItemGroup: ISCMHistoryItemGroup | undefined);

	provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemSummary(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItem | undefined>;
	provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string | undefined): Promise<{ id: string; ahead: number; behind: number } | undefined>;
}

export interface ISCMHistoryProviderCacheEntry {
	readonly incomingHistoryItemGroup: SCMHistoryItemGroupTreeElement | undefined;
	readonly outgoingHistoryItemGroup: SCMHistoryItemGroupTreeElement | undefined;
	readonly historyItems: Map<string, [ISCMHistoryItem | undefined, ISCMHistoryItem[]]>;
	readonly historyItemChanges: Map<string, ISCMHistoryItemChange[]>;
}

export interface ISCMHistoryOptions {
	readonly cursor?: string;
	readonly limit?: number | { id?: string };
}

export interface ISCMHistoryItemGroup {
	readonly id: string;
	readonly name: string;
	readonly base?: Omit<ISCMHistoryItemGroup, 'base'>;
}

export interface SCMHistoryItemGroupTreeElement {
	readonly id: string;
	readonly label: string;
	readonly ariaLabel?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly description?: string;
	readonly direction: 'incoming' | 'outgoing';
	readonly ancestor?: string;
	readonly count?: number;
	readonly repository: ISCMRepository;
	readonly type: 'historyItemGroup';
}

export interface ISCMHistoryItemStatistics {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export interface ISCMHistoryItem {
	readonly id: string;
	readonly parentIds: string[];
	readonly message: string;
	readonly author?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly timestamp?: number;
	readonly statistics?: ISCMHistoryItemStatistics;
}

export interface SCMHistoryItemTreeElement extends ISCMHistoryItem {
	readonly historyItemGroup: SCMHistoryItemGroupTreeElement;
	readonly type: 'allChanges' | 'historyItem';
}

export interface ISCMHistoryItemChange {
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly modifiedUri?: URI;
	readonly renameUri?: URI;
}

export interface SCMHistoryItemChangeTreeElement extends ISCMHistoryItemChange {
	readonly historyItem: SCMHistoryItemTreeElement;
	readonly type: 'historyItemChange';
}

export interface SCMViewSeparatorElement {
	readonly label: string;
	readonly ariaLabel?: string;
	readonly repository: ISCMRepository;
	readonly type: 'separator';
}
