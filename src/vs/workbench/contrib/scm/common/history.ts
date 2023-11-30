/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IMenu } from 'vs/platform/actions/common/actions';
import { ISCMActionButtonDescriptor, ISCMRepository } from 'vs/workbench/contrib/scm/common/scm';

export interface ISCMHistoryProviderMenus {
	getHistoryItemMenu(historyItem: ISCMHistoryItem): IMenu;
}

export interface ISCMHistoryProvider {

	readonly onDidChangeActionButton: Event<void>;
	readonly onDidChangeCurrentHistoryItemGroup: Event<void>;

	get actionButton(): ISCMActionButtonDescriptor | undefined;
	set actionButton(button: ISCMActionButtonDescriptor | undefined);

	get currentHistoryItemGroup(): ISCMHistoryItemGroup | undefined;
	set currentHistoryItemGroup(historyItemGroup: ISCMHistoryItemGroup | undefined);

	provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemGroupBase(historyItemGroupId: string): Promise<ISCMHistoryItemGroup | undefined>;
	resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string): Promise<{ id: string; ahead: number; behind: number } | undefined>;
	resolveHistoryItemGroupDetails(historyItemGroup: ISCMHistoryItemGroup): Promise<ISCMHistoryItemGroupDetails | undefined>;
}

export interface ISCMHistoryProviderCacheEntry {
	readonly historyItemGroupDetails?: ISCMHistoryItemGroupDetails;
	readonly historyItems: Map<string, ISCMHistoryItem[]>;
	readonly historyItemChanges: Map<string, ISCMHistoryItemChange[]>;
}

export interface ISCMHistoryOptions {
	readonly cursor?: string;
	readonly limit?: number | { id?: string };
}

export interface ISCMRemoteHistoryItemGroup {
	readonly id: string;
	readonly label: string;
}

export interface ISCMHistoryItemGroup {
	readonly id: string;
	readonly label: string;
	readonly upstream?: ISCMRemoteHistoryItemGroup;
}

export interface ISCMHistoryItemGroupDetails {
	readonly incoming?: ISCMHistoryItemGroupEntry;
	readonly outgoing: ISCMHistoryItemGroupEntry;
}

export interface ISCMHistoryItemGroupEntry {
	readonly id: string;
	readonly label: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly description?: string;
	readonly ancestor?: string;
	readonly count?: number;
}

export interface SCMHistoryItemGroupTreeElement extends ISCMHistoryItemGroupEntry {
	readonly ariaLabel?: string;
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
	readonly label: string;
	readonly description?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly timestamp?: number;
	readonly statistics?: ISCMHistoryItemStatistics;
}

export interface SCMHistoryItemTreeElement extends ISCMHistoryItem {
	readonly historyItemGroup: SCMHistoryItemGroupTreeElement;
	readonly type: 'historyItem';
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
