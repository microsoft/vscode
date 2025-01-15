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

	// upstream -> origin -> first
	return await _getRemoteSourceControlHistoryItemCommands(repository, 'upstream')
		?? await _getRemoteSourceControlHistoryItemCommands(repository, 'origin')
		?? await _getRemoteSourceControlHistoryItemCommands(repository, repository.remotes[0].name);
}

async function _getRemoteSourceControlHistoryItemCommands(repository: Repository, remoteName: string): Promise<Command[]> {
	const remote = repository.remotes.find(r => r.name === remoteName && r.fetchUrl);
	return remote ? GitBaseApi.getAPI().getRemoteSourceControlHistoryItemCommands(remote.fetchUrl!) : [];
}

export async function provideRemoteSourceDocumentLinks(repository: Repository, content: string): Promise<string | undefined> {
	if (repository.remotes.length === 0) {
		return undefined;
	}

	// upstream -> origin -> first
	return await _provideRemoteSourceDocumentLinks(repository, 'upstream', content)
		?? await _provideRemoteSourceDocumentLinks(repository, 'origin', content)
		?? await _provideRemoteSourceDocumentLinks(repository, repository.remotes[0].name, content);
}

async function _provideRemoteSourceDocumentLinks(repository: Repository, remoteName: string, content: string): Promise<string | undefined> {
	const remote = repository.remotes.find(r => r.name === remoteName && r.fetchUrl);
	return remote ? GitBaseApi.getAPI().provideRemoteSourceDocumentLinks(remote.fetchUrl!, content) : undefined;
}
