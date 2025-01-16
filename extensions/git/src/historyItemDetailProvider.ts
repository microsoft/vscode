/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Disposable, SourceControlHistoryItem } from 'vscode';
import { SourceControlHistoryItemDetailProvider } from './api/git';
import { Repository } from './repository';
import { ApiRepository } from './api/api1';

export interface ISourceControlHistoryItemDetailProviderRegistry {
	registerSourceControlHistoryItemDetailProvider(provider: SourceControlHistoryItemDetailProvider): Disposable;
	getSourceControlHistoryItemDetailProviders(): SourceControlHistoryItemDetailProvider[];
}

export async function provideSourceControlHistoryItemHoverCommands(
	providers: SourceControlHistoryItemDetailProvider[],
	repository: Repository
): Promise<Command[] | undefined> {
	for (const provider of providers) {
		const result = await provider.provideHoverCommands(new ApiRepository(repository));

		if (result) {
			return result;
		}
	}

	return undefined;
}

export async function provideSourceControlHistoryItemMessageLinks(
	providers: SourceControlHistoryItemDetailProvider[],
	repository: Repository,
	historyItem: SourceControlHistoryItem
): Promise<string | undefined> {
	for (const provider of providers) {
		const result = await provider.provideMessageLinks(
			new ApiRepository(repository), historyItem);

		if (result) {
			return result;
		}
	}

	return undefined;
}
