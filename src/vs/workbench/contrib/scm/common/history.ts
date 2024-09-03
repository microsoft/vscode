/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IMenu } from '../../../../platform/actions/common/actions.js';
import { ColorIdentifier } from '../../../../platform/theme/common/colorUtils.js';
import { ISCMRepository } from './scm.js';

export interface ISCMHistoryProviderMenus {
	getHistoryItemMenu2(historyItem: SCMHistoryItemViewModelTreeElement): IMenu;
}

export interface ISCMHistoryProvider {
	readonly currentHistoryItemGroupId: IObservable<string | undefined>;
	readonly currentHistoryItemGroupName: IObservable<string | undefined>;
	readonly currentHistoryItemGroupRevision: IObservable<string | undefined>;
	readonly currentHistoryItemGroup: IObservable<ISCMHistoryItemGroup | undefined>;
	readonly currentHistoryItemGroupRemoteId: IObservable<string | undefined>;
	readonly currentHistoryItemGroupRemoteRevision: IObservable<string | undefined>;

	provideHistoryItems(options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemGroupCommonAncestor(historyItemGroupIds: string[]): Promise<string | undefined>;
}

export interface ISCMHistoryOptions {
	readonly cursor?: string;
	readonly skip?: number;
	readonly limit?: number | { id?: string };
	readonly historyItemGroupIds?: readonly string[];
}

export interface ISCMHistoryItemGroup {
	readonly id: string;
	readonly name: string;
	readonly revision?: string;
	readonly base?: Omit<Omit<ISCMHistoryItemGroup, 'base'>, 'remote'>;
	readonly remote?: Omit<Omit<ISCMHistoryItemGroup, 'base'>, 'remote'>;
}

export interface ISCMHistoryItemStatistics {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export interface ISCMHistoryItemLabel {
	readonly title: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly color?: ColorIdentifier;
}

export interface ISCMHistoryItem {
	readonly id: string;
	readonly parentIds: string[];
	readonly message: string;
	readonly displayId?: string;
	readonly author?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly timestamp?: number;
	readonly statistics?: ISCMHistoryItemStatistics;
	readonly labels?: ISCMHistoryItemLabel[];
}

export interface ISCMHistoryItemGraphNode {
	readonly id: string;
	readonly color: ColorIdentifier;
}

export interface ISCMHistoryItemViewModel {
	readonly historyItem: ISCMHistoryItem;
	readonly inputSwimlanes: ISCMHistoryItemGraphNode[];
	readonly outputSwimlanes: ISCMHistoryItemGraphNode[];
}

export interface SCMHistoryItemViewModelTreeElement {
	readonly repository: ISCMRepository;
	readonly historyItemViewModel: ISCMHistoryItemViewModel;
	readonly type: 'historyItem2';
}

export interface SCMHistoryItemLoadMoreTreeElement {
	readonly repository: ISCMRepository;
	readonly graphColumns: ISCMHistoryItemGraphNode[];
	readonly type: 'historyItemLoadMore';
}

export interface ISCMHistoryItemChange {
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly modifiedUri?: URI;
	readonly renameUri?: URI;
}
