/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export const ISCMHistoryService = createDecorator<ISCMHistoryService>('scmHistory');

export interface ISCMHistoryProvider {
	readonly rootUri: URI | undefined;
	// readonly onDidChange: Event<ISCMHistoryChangeEvent>;
	// provideHistory(token: CancellationToken): Promise<ISCMHistoryItem[]>;
	// resolveHistoryItem(token: CancellationToken): Promise<ISCMHistoryItemChange[] | undefined>;
}

export interface ISCMHistoryService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeHistoryProviders: Event<void>;
	addHistoryProvider(historyProvider: ISCMHistoryProvider): IDisposable;
}
