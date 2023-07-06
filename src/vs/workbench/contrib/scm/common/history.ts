/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';

export const ISCMHistoryService = createDecorator<ISCMHistoryService>('scmHistory');

export interface ISCMHistoryProvider {
	readonly id: string;

	provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined>;
	provideHistoryItemChanges(historyItemId: string): Promise<ISCMHistoryItemChange[] | undefined>;
	resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string): Promise<ISCMHistoryItem | undefined>;
}

export interface ISCMHistoryOptions {
	readonly cursor?: string;
	readonly limit?: number | { id?: string };
}

export interface ISCMHistoryItemGroup {
	readonly id: string;
	readonly label: string;
	readonly ahead?: number;
	readonly behind?: number;
	readonly remote?: string;
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

export interface ISCMHistoryService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeHistoryProviders: Event<void>;
	addHistoryProvider(historyProvider: ISCMHistoryProvider): IDisposable;
	getHistoryProvider(id: string): ISCMHistoryProvider | undefined;
}
