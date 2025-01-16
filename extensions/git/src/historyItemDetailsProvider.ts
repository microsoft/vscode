/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Disposable } from 'vscode';
import { SourceControlHistoryItemDetailsProvider } from './api/git';
import { Repository } from './repository';
import { ApiRepository } from './api/api1';

export interface ISourceControlHistoryItemDetailsProviderRegistry {
	registerSourceControlHistoryItemDetailsProvider(provider: SourceControlHistoryItemDetailsProvider): Disposable;
	getSourceControlHistoryItemDetailsProviders(): SourceControlHistoryItemDetailsProvider[];
}

export async function provideSourceControlHistoryItemAvatar(
	registry: ISourceControlHistoryItemDetailsProviderRegistry,
	repository: Repository,
	commit: string,
	authorName?: string,
	authorEmail?: string
): Promise<string | undefined> {
	for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
		const result = await provider.provideAvatar(new ApiRepository(repository), commit, authorName, authorEmail);

		if (result) {
			return result;
		}
	}

	return undefined;
}

export async function provideSourceControlHistoryItemHoverCommands(
	registry: ISourceControlHistoryItemDetailsProviderRegistry,
	repository: Repository
): Promise<Command[] | undefined> {
	for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
		const result = await provider.provideHoverCommands(new ApiRepository(repository));

		if (result) {
			return result;
		}
	}

	return undefined;
}

export async function provideSourceControlHistoryItemMessageLinks(
	registry: ISourceControlHistoryItemDetailsProviderRegistry,
	repository: Repository,
	message: string
): Promise<string | undefined> {
	for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
		const result = await provider.provideMessageLinks(
			new ApiRepository(repository), message);

		if (result) {
			return result;
		}
	}

	return undefined;
}
