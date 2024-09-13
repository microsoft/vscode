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
	getHistoryItemMenu(historyItem: SCMHistoryItemViewModelTreeElement): IMenu;
}

export interface ISCMHistoryProvider {
	readonly historyItemRef: IObservable<ISCMHistoryItemRef | undefined>;
	readonly historyItemRemoteRef: IObservable<ISCMHistoryItemRef | undefined>;
	readonly historyItemBaseRef: IObservable<ISCMHistoryItemRef | undefined>;

	readonly historyItemRefChanges: IObservable<ISCMHistoryItemRefsChangeEvent>;

	provideHistoryItemRefs(): Promise<ISCMHistoryItemRef[] | undefined>;
	provideHistoryItems(options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[]): Promise<string | undefined>;
}

export interface ISCMHistoryOptions {
	readonly skip?: number;
	readonly limit?: number | { id?: string };
	readonly historyItemRefs?: readonly string[];
}

export interface ISCMHistoryItemStatistics {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export interface ISCMHistoryItemRef {
	readonly id: string;
	readonly name: string;
	readonly revision?: string;
	readonly category?: string;
	readonly description?: string;
	readonly color?: ColorIdentifier;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
}

export interface ISCMHistoryItemRefsChangeEvent {
	readonly added: readonly ISCMHistoryItemRef[];
	readonly removed: readonly ISCMHistoryItemRef[];
	readonly modified: readonly ISCMHistoryItemRef[];
	readonly silent: boolean;
}

export interface ISCMHistoryItem {
	readonly id: string;
	readonly parentIds: string[];
	readonly subject: string;
	readonly message: string;
	readonly displayId?: string;
	readonly author?: string;
	readonly timestamp?: number;
	readonly statistics?: ISCMHistoryItemStatistics;
	readonly references?: ISCMHistoryItemRef[];
}

export interface ISCMHistoryItemGraphNode {
	readonly id: string;
	readonly color: ColorIdentifier;
}

export interface ISCMHistoryItemViewModel {
	readonly historyItem: ISCMHistoryItem;
	readonly isCurrent: boolean;
	readonly inputSwimlanes: ISCMHistoryItemGraphNode[];
	readonly outputSwimlanes: ISCMHistoryItemGraphNode[];
}

export interface SCMHistoryItemViewModelTreeElement {
	readonly repository: ISCMRepository;
	readonly historyItemViewModel: ISCMHistoryItemViewModel;
	readonly type: 'historyItemViewModel';
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
