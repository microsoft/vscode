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

/** Parses Include arguments with OpenSSH quoting, escapes and comments; undefined indicates invalid quotes or an empty path. */
export function parseSSHConfigIncludePaths(value: string): string[] | undefined {
	const paths: string[] = [];
	let index = 0;
	while (index < value.length) {
		while (value[index] === ' ' || value[index] === '\t') {
			index++;
		}
		if (index === value.length || value[index] === '#') {
			break;
		}

		let path = '';
		let quote: '"' | '\'' | undefined;
		while (index < value.length) {
			const char = value[index++];
			if (char === '\\') {
				const next = value[index];
				if (next === '"' || next === '\'' || next === '\\' || (!quote && next === ' ')) {
					path += next;
					index++;
				} else {
					path += char;
				}
			} else if (!quote && (char === ' ' || char === '\t')) {
				break;
			} else if (!quote && (char === '"' || char === '\'')) {
				quote = char;
			} else if (char === quote) {
				quote = undefined;
			} else {
				path += char;
			}
		}
		if (quote || !path) {
			return undefined;
		}
		paths.push(path);
	}
	return paths;
}

/** Retains token boundaries so the node layer can recover unquoted paths using filesystem evidence. */
export function tokenizeSSHPathList(value: string): { path: string; start: number; end: number; quoted: boolean }[] {
	const paths: { path: string; start: number; end: number; quoted: boolean }[] = [];
	const pattern = /"(?<quoted>[^"]*)"|(?<unquoted>\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(value)) !== null) {
		const path = match.groups?.quoted ?? match.groups?.unquoted;
		if (path) {
			paths.push({ path, start: match.index, end: pattern.lastIndex, quoted: match.groups?.quoted !== undefined });
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
		...(map.get('hostkeyalias') ? { hostKeyAlias: map.get('hostkeyalias') } : {}),
		user: map.get('user') || undefined,
		port: parseInt(map.get('port') ?? '22', 10),
		identityFile: identityFiles,
		identityAgent: map.get('identityagent') || undefined,
		...(map.get('proxycommand') && map.get('proxycommand')?.toLowerCase() !== 'none' ? { proxyCommand: map.get('proxycommand') } : {}),
		forwardAgent: map.get('forwardagent') === 'yes',
		userKnownHostsFiles: tokenizeSSHPathList(map.get('userknownhostsfile') ?? '').map(token => token.path),
		globalKnownHostsFiles: tokenizeSSHPathList(map.get('globalknownhostsfile') ?? '').map(token => token.path),
		strictHostKeyChecking: strictHostKeyChecking && isSSHStrictHostKeyChecking(strictHostKeyChecking)
			? strictHostKeyChecking
			: undefined,
	};
}
