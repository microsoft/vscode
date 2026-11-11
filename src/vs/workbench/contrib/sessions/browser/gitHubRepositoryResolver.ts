/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { dirname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { getGitHubRepositoryFromRemoteUrl, IGitHubRemoteInfo } from '../../git/common/utils.js';

const MAX_PARENT_LOOKUPS = 50;

export interface IResolvedGitRepository {
	readonly gitHub: IGitHubRemoteInfo | undefined;
}

export async function resolveGitRepositoryFromGitConfig(fileService: IFileService, workspaceUri: URI, supportedHosts?: readonly string[]): Promise<IResolvedGitRepository | undefined> {
	const configUri = await findGitConfig(fileService, workspaceUri);
	if (!configUri) {
		return undefined;
	}
	const content = await readFileIfExists(fileService, configUri);
	return {
		gitHub: content === undefined ? undefined : parseGitHubRepositoryFromGitConfig(content, supportedHosts),
	};
}

export async function resolveGitHubRepositoryFromGitConfig(fileService: IFileService, workspaceUri: URI, supportedHosts?: readonly string[]): Promise<IGitHubRemoteInfo | undefined> {
	return (await resolveGitRepositoryFromGitConfig(fileService, workspaceUri, supportedHosts))?.gitHub;
}

/**
 * The GitHub repository of a remote of a git `config`: of `origin` first and then of any other remote. With a
 * `remoteName`, only of that remote, read as git does: its section header can end with a comment, and its value is read
 * without its quotes, escapes and inline comment.
 */
export function parseGitHubRepositoryFromGitConfig(content: string, supportedHosts?: readonly string[], remoteName?: string): IGitHubRemoteInfo | undefined {
	const remotes: { readonly name: string; readonly url: string }[] = [];
	let sectionRemote: string | undefined;
	for (const line of content.split(/\r?\n/)) {
		// Read as git does with a remoteName: a header can end with a comment
		const section = (remoteName === undefined ? /^\s*\[\s*remote\s+"([^"]+)"\s*\]\s*$/i : /^\s*\[\s*remote\s+"([^"]+)"\s*\]\s*(?:[#;].*)?$/i).exec(line);
		if (section) {
			sectionRemote = section[1];
			continue;
		}
		if (/^\s*\[/.test(line)) {
			sectionRemote = undefined;
			continue;
		}
		const url = sectionRemote ? /^\s*url\s*=\s*(.+?)\s*$/i.exec(line)?.[1] : undefined;
		if (url && sectionRemote && (remoteName === undefined || sectionRemote === remoteName)) {
			remotes.push({ name: sectionRemote, url: remoteName === undefined ? stripQuotes(url) : parseGitConfigValue(url) });
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

/** The value of a git `config` entry: without its quotes and its inline comment (`#` or `;` outside quotes). */
function parseGitConfigValue(raw: string): string {
	let value = '';
	let quoted = false;
	for (let index = 0; index < raw.length; index++) {
		const char = raw[index];
		if (char === '"') {
			quoted = !quoted;
		} else if (!quoted && (char === '#' || char === ';')) {
			break;
		} else if (char === '\\' && index + 1 < raw.length) {
			value += raw[++index];
		} else {
			value += char;
		}
	}
	return value.trim();
}
