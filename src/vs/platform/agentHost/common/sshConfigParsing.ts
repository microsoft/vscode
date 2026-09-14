/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSSHStrictHostKeyChecking, type ISSHResolvedConfig } from './sshRemoteAgentHost.js';

/** Strip inline comments from an SSH config value. */
export function stripSSHComment(s: string): string {
	const idx = s.indexOf(' #');
	return idx !== -1 ? s.substring(0, idx).trim() : s;
}

/**
 * Extract Host aliases from SSH config content (without following Includes).
 */
export function parseSSHConfigHostEntries(content: string): string[] {
	const hosts: string[] = [];
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const hostMatch = trimmed.match(/^Host\s+(.+)$/i);
		if (hostMatch) {
			const hostValue = stripSSHComment(hostMatch[1]);
			for (const h of hostValue.split(/\s+/)) {
				if (!h.includes('*') && !h.includes('?') && !h.startsWith('!')) {
					hosts.push(h);
				}
			}
		}
	}
	return hosts;
}

/**
 * Split a space-separated `ssh -G` path list, honoring double quotes so paths
 * containing spaces survive. `ssh -G` emits `userknownhostsfile` and
 * `globalknownhostsfile` as one line holding several paths.
 */
function parseSSHPathList(value: string): string[] {
	const paths: string[] = [];
	const pattern = /"([^"]*)"|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(value)) !== null) {
		const path = match[1] ?? match[2];
		if (path) {
			paths.push(path);
		}
	}
	return paths;
}

/**
 * Parse `ssh -G` output into a resolved config object.
 */
export function parseSSHGOutput(stdout: string): ISSHResolvedConfig {
	const map = new Map<string, string>();
	const identityFiles: string[] = [];
	for (const line of stdout.split('\n')) {
		const spaceIdx = line.indexOf(' ');
		if (spaceIdx === -1) {
			continue;
		}
		const key = line.substring(0, spaceIdx).toLowerCase();
		const value = line.substring(spaceIdx + 1).trim();
		if (key === 'identityfile') {
			identityFiles.push(value);
		} else {
			map.set(key, value);
		}
	}

	const strictHostKeyCheckingValue = map.get('stricthostkeychecking')?.toLowerCase();
	const strictHostKeyChecking = strictHostKeyCheckingValue === 'true'
		? 'yes'
		: strictHostKeyCheckingValue === 'false'
			? 'no'
			: strictHostKeyCheckingValue;

	return {
		hostname: map.get('hostname') ?? '',
		user: map.get('user') || undefined,
		port: parseInt(map.get('port') ?? '22', 10),
		identityFile: identityFiles,
		identityAgent: map.get('identityagent') || undefined,
		forwardAgent: map.get('forwardagent') === 'yes',
		userKnownHostsFiles: parseSSHPathList(map.get('userknownhostsfile') ?? ''),
		globalKnownHostsFiles: parseSSHPathList(map.get('globalknownhostsfile') ?? ''),
		strictHostKeyChecking: strictHostKeyChecking && isSSHStrictHostKeyChecking(strictHostKeyChecking)
			? strictHostKeyChecking
			: undefined,
	};
}
