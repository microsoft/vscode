/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { dirname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { getGitHubRepositoryFromRemoteUrl, IGitHubRemoteInfo } from '../../../../workbench/contrib/git/common/utils.js';

const MAX_PARENT_LOOKUPS = 50;

export async function resolveGitHubRepositoryFromGitConfig(fileService: IFileService, workspaceUri: URI, supportedHosts?: readonly string[]): Promise<IGitHubRemoteInfo | undefined> {
	const configUri = await findGitConfig(fileService, workspaceUri);
	if (!configUri) {
		return undefined;
	}
	const content = await readFileIfExists(fileService, configUri);
	return content ? parseGitHubRepositoryFromGitConfig(content, supportedHosts) : undefined;
}

export function parseGitHubRepositoryFromGitConfig(content: string, supportedHosts?: readonly string[]): IGitHubRemoteInfo | undefined {
	const remotes: { readonly name: string; readonly url: string }[] = [];
	let remoteName: string | undefined;
	for (const line of content.split(/\r?\n/)) {
		const section = /^\s*\[\s*remote\s+"([^"]+)"\s*\]\s*$/i.exec(line);
		if (section) {
			remoteName = section[1];
			continue;
		}
		if (/^\s*\[/.test(line)) {
			remoteName = undefined;
			continue;
		}
		const url = remoteName ? /^\s*url\s*=\s*(.+?)\s*$/i.exec(line)?.[1] : undefined;
		if (url && remoteName) {
			remotes.push({ name: remoteName, url: stripQuotes(url) });
		}
	}

	remotes.sort((a, b) => Number(b.name === 'origin') - Number(a.name === 'origin'));
	for (const remote of remotes) {
		const repository = getGitHubRepositoryFromRemoteUrl(remote.url, supportedHosts);
		if (repository) {
			return repository;
		}
	}
	return undefined;
}

async function findGitConfig(fileService: IFileService, workspaceUri: URI): Promise<URI | undefined> {
	let current = workspaceUri;
	for (let i = 0; i < MAX_PARENT_LOOKUPS; i++) {
		const dotGit = joinPath(current, '.git');
		const stat = await statIfExists(fileService, dotGit);
		if (stat) {
			if (stat.isDirectory) {
				return joinPath(dotGit, 'config');
			}
			const dotGitContent = await readFileIfExists(fileService, dotGit);
			const gitDirPath = dotGitContent ? /^\s*gitdir:\s*(.+?)\s*$/im.exec(dotGitContent)?.[1] : undefined;
			if (gitDirPath) {
				const gitDir = resolveGitPath(current, gitDirPath);
				const commonDirPath = await readFileIfExists(fileService, joinPath(gitDir, 'commondir'));
				const configRoot = commonDirPath ? resolveGitPath(gitDir, commonDirPath.trim()) : gitDir;
				return joinPath(configRoot, 'config');
			}
		}

		const parent = dirname(current);
		if (isEqual(parent, current)) {
			break;
		}
		current = parent;
	}
	return undefined;
}

function resolveGitPath(base: URI, value: string): URI {
	const path = value.trim();
	if (/^[a-zA-Z]:[\\/]/.test(path)) {
		return URI.file(path);
	}
	const normalizedPath = path.replace(/\\/g, '/');
	if (normalizedPath.startsWith('/')) {
		return base.scheme === Schemas.file ? URI.file(path) : base.with({ path: normalizedPath });
	}
	return joinPath(base, normalizedPath);
}

async function statIfExists(fileService: IFileService, resource: URI) {
	try {
		return await fileService.stat(resource);
	} catch (error) {
		if (toFileOperationResult(error as Error) === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw error;
	}
}

async function readFileIfExists(fileService: IFileService, resource: URI): Promise<string | undefined> {
	try {
		return (await fileService.readFile(resource)).value.toString();
	} catch (error) {
		if (toFileOperationResult(error as Error) === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw error;
	}
}

function stripQuotes(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1)
		: value;
}
