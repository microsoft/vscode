/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'vscode';
import { PickRemoteSourceOptions, PickRemoteSourceResult } from './typings/git-base';
import { GitBaseApi } from './git-base';
import { Repository } from './repository';

export async function pickRemoteSource(options: PickRemoteSourceOptions & { branch?: false | undefined }): Promise<string | undefined>;
export async function pickRemoteSource(options: PickRemoteSourceOptions & { branch: true }): Promise<PickRemoteSourceResult | undefined>;
export async function pickRemoteSource(options: PickRemoteSourceOptions = {}): Promise<string | PickRemoteSourceResult | undefined> {
	return GitBaseApi.getAPI().pickRemoteSource(options);
}

export async function getRemoteSourceActions(url: string) {
	return GitBaseApi.getAPI().getRemoteSourceActions(url);
}

export async function getRemoteSourceControlHistoryItemCommands(repository: Repository): Promise<Command[]> {
	if (repository.remotes.length === 0) {
		return [];
	}

	const getCommands = async (repository: Repository, remoteName: string): Promise<Command[] | undefined> => {
		const remote = repository.remotes.find(r => r.name === remoteName && r.fetchUrl);
		return remote ? GitBaseApi.getAPI().getRemoteSourceControlHistoryItemCommands(remote.fetchUrl!) : undefined;
	};

	// upstream -> origin -> first
	return await getCommands(repository, 'upstream')
		?? await getCommands(repository, 'origin')
		?? await getCommands(repository, repository.remotes[0].name)
		?? [];
}

export async function provideRemoteSourceLinks(repository: Repository, content: string): Promise<string | undefined> {
	if (repository.remotes.length === 0) {
		return undefined;
	}

	const getDocumentLinks = async (repository: Repository, remoteName: string): Promise<string | undefined> => {
		const remote = repository.remotes.find(r => r.name === remoteName && r.fetchUrl);
		return remote ? GitBaseApi.getAPI().provideRemoteSourceLinks(remote.fetchUrl!, content) : undefined;
	};

	// upstream -> origin -> first
	return await getDocumentLinks(repository, 'upstream')
		?? await getDocumentLinks(repository, 'origin')
		?? await getDocumentLinks(repository, repository.remotes[0].name);
}
