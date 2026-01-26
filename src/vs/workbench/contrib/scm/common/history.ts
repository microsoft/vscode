/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ColorIdentifier } from '../../../../platform/theme/common/colorUtils.js';
import { ISCMRepository } from './scm.js';

export const SCMIncomingHistoryItemId = 'scm-graph-incoming-changes';
export const SCMOutgoingHistoryItemId = 'scm-graph-outgoing-changes';

export interface ISCMHistoryProvider {
	readonly historyItemRef: IObservable<ISCMHistoryItemRef | undefined>;
	readonly historyItemRemoteRef: IObservable<ISCMHistoryItemRef | undefined>;
	readonly historyItemBaseRef: IObservable<ISCMHistoryItemRef | undefined>;

	readonly historyItemRefChanges: IObservable<ISCMHistoryItemRefsChangeEvent>;

	provideHistoryItemRefs(historyItemsRefs?: string[], token?: CancellationToken): Promise<ISCMHistoryItemRef[] | undefined>;
	provideHistoryItems(options: ISCMHistoryOptions, token?: CancellationToken): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined, token?: CancellationToken): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItem(historyItemId: string, token?: CancellationToken): Promise<ISCMHistoryItem | undefined>;
	resolveHistoryItemChatContext(historyItemId: string, token?: CancellationToken): Promise<string | undefined>;
	resolveHistoryItemChangeRangeChatContext(historyItemId: string, historyItemParentId: string, path: string, token?: CancellationToken): Promise<string | undefined>;
	resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[], token?: CancellationToken): Promise<string | undefined>;
}

export interface ISCMHistoryOptions {
	readonly skip?: number;
	readonly limit?: number | { id?: string };
	readonly historyItemRefs?: readonly string[];
	readonly filterText?: string;
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
	readonly authorEmail?: string;
	readonly authorIcon?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly timestamp?: number;
	readonly statistics?: ISCMHistoryItemStatistics;
	readonly references?: ISCMHistoryItemRef[];
	readonly tooltip?: IMarkdownString | Array<IMarkdownString> | undefined;
}

export interface ISCMHistoryItemGraphNode {
	readonly id: string;
	readonly color: ColorIdentifier;
}

export interface ISCMHistoryItemViewModel {
	readonly historyItem: ISCMHistoryItem;
	readonly inputSwimlanes: ISCMHistoryItemGraphNode[];
	readonly outputSwimlanes: ISCMHistoryItemGraphNode[];
	readonly kind: 'HEAD' | 'node' | 'incoming-changes' | 'outgoing-changes';
}

export interface SCMHistoryItemViewModelTreeElement {
	readonly repository: ISCMRepository;
	readonly historyItemViewModel: ISCMHistoryItemViewModel;
	readonly type: 'historyItemViewModel';
}

export interface SCMHistoryItemChangeViewModelTreeElement {
	readonly repository: ISCMRepository;
	readonly historyItemViewModel: ISCMHistoryItemViewModel;
	readonly historyItemChange: ISCMHistoryItemChange;
	readonly graphColumns: ISCMHistoryItemGraphNode[];
	readonly type: 'historyItemChangeViewModel';
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
}
