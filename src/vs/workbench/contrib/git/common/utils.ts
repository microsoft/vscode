/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { GitRemote, GitRepositoryState } from './gitService.js';

export function hasGitHubRemotes(repositoryState: GitRepositoryState): boolean {
	const hosts = ['github.com', 'ghe.com'];
	const remotes = getOrderedRemotes(repositoryState!)
		.filter(remote => !!remote.fetchUrl)
		.map(remote => parseRemoteUrl(remote.fetchUrl!));

	for (const remote of remotes) {
		if (!remote?.host) {
			continue;
		}

		if (
			hosts.some(host => equalsIgnoreCase(remote.host, host)) ||
			hosts.some(host => remote.host.endsWith(host))
		) {
			return true;
		}
	}

	return false;
}

function getOrderedRemotes(repositoryState: GitRepositoryState): readonly GitRemote[] {
	if (repositoryState.remotes.length < 2) {
		return repositoryState.remotes;
	}

	const remotes = new Map<string, GitRemote>();

	// If there's an upstream remote, use that
	const remoteIndex = repositoryState.remotes.findIndex(r => r.name === repositoryState.HEAD?.upstream?.remote);
	if (remoteIndex !== -1) {
		const fetchUrl = repositoryState.remotes[remoteIndex].fetchUrl;
		if (fetchUrl) {
			remotes.set(repositoryState.remotes[remoteIndex].name, repositoryState.remotes[remoteIndex]);
		}
	}

	// If there's a remote named "origin", use that
	const originIndex = repositoryState.remotes.findIndex(r => r.name === 'origin');
	if (originIndex !== -1) {
		const fetchUrl = repositoryState.remotes[originIndex].fetchUrl;
		if (fetchUrl) {
			remotes.set(repositoryState.remotes[originIndex].name, repositoryState.remotes[originIndex]);
		}
	}

	// Add everything else
	for (const remote of repositoryState.remotes) {
		if (!remotes.has(remote.name)) {
			remotes.set(remote.name, remote);
		}
	}

	return Array.from(remotes.values());
}

function parseRemoteUrl(fetchUrl: string): { host: string; rawHost: string; path: string } | undefined {
	fetchUrl = fetchUrl.trim();
	try {
		// Normalize git shorthand syntax (git@github.com:user/repo.git) into an explicit ssh:// url
		// See https://git-scm.com/docs/git-clone/2.35.0#_git_urls
		if (/^[\w\d\-]+@/i.test(fetchUrl)) {
			const parts = fetchUrl.split(':');
			if (parts.length !== 2) {
				return undefined;
			}
			fetchUrl = 'ssh://' + parts[0] + '/' + parts[1];
		}

		const repoUrl = URI.parse(fetchUrl);
		const authority = repoUrl.authority;
		const path = repoUrl.path;
		if (!(equalsIgnoreCase(repoUrl.scheme, 'ssh') || equalsIgnoreCase(repoUrl.scheme, 'https') || equalsIgnoreCase(repoUrl.scheme, 'http'))) {
			return;
		}

		const splitAuthority = authority.split('@');
		if (splitAuthority.length > 2) { // Invalid, too many @ symbols
			return undefined;
		}

		const extractedHost = splitAuthority.at(-1);
		if (!extractedHost) {
			return;
		}

		const rawHost = extractedHost
			.toLowerCase()
			.replace(/:\d+$/, ''); // Remove optional port

		const normalizedHost = rawHost
			.replace(/^[\w\-]+-/, '') // Remove common ssh syntax: abc-github.com
			.replace(/-[\w\-]+$/, '');// Remove common ssh syntax: github.com-abc

		return { host: normalizedHost, rawHost, path: path };
	} catch (err) {
		return undefined;
	}
}
