/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Disposable } from 'vscode';
import { SourceControlHistoryItemDetailProvider } from './api/git';
import { Repository } from './repository';
import { ApiRepository } from './api/api1';

export interface ISourceControlHistoryItemDetailProviderRegistry {
	registerSourceControlHistoryItemDetailProvider(provider: SourceControlHistoryItemDetailProvider): Disposable;
	getSourceControlHistoryItemDetailProviders(): SourceControlHistoryItemDetailProvider[];
}

export async function provideSourceControlHistoryItemHoverCommands(
	registry: ISourceControlHistoryItemDetailProviderRegistry,
	repository: Repository
): Promise<Command[] | undefined> {
	for (const provider of registry.getSourceControlHistoryItemDetailProviders()) {
		const result = await provider.provideHoverCommands(new ApiRepository(repository));

		if (result) {
			return result;
		}
	}

	return undefined;
}

export async function provideSourceControlHistoryItemMessageLinks(
	registry: ISourceControlHistoryItemDetailProviderRegistry,
	repository: Repository,
	message: string
): Promise<string | undefined> {
	for (const provider of registry.getSourceControlHistoryItemDetailProviders()) {
		const result = await provider.provideMessageLinks(
			new ApiRepository(repository), message);

		if (result) {
			return result;
		}
	}

	return undefined;
}
