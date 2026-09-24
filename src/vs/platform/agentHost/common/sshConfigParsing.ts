/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSSHStrictHostKeyChecking, type ISSHResolvedConfig } from './sshRemoteAgentHost.js';

/** Strip inline comments from an SSH config value. A ' #' inside double quotes is part of the value. */
export function stripSSHComment(s: string): string {
	let inQuotes = false;
	for (let i = 0; i + 1 < s.length; i++) {
		const ch = s[i];
		if (ch === '\\') {
			i++; // an escaped char cannot toggle quotes
		} else if (ch === '"') {
			inQuotes = !inQuotes;
		} else if (ch === ' ' && s[i + 1] === '#' && !inQuotes) {
			return s.substring(0, i).trim();
		}
	}
	return s;
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
			for (const { path: h } of tokenizeSSHPathList(hostValue)) {
				if (!h.includes('*') && !h.includes('?') && !h.startsWith('!')) {
					hosts.push(h);
				}
			}
		}
	}
	return hosts;
}

/** Backslash escapes honored inside and outside double quotes, mirroring OpenSSH's argv_split. */
function isSSHEscapable(next: string, inQuotes: boolean): boolean {
	return next === '\'' || next === '"' || next === '\\' || (!inQuotes && next === ' ');
}

/** Splits a whitespace-separated SSH value into tokens, honoring double quotes and backslash escapes like OpenSSH. Retains token boundaries so the node layer can recover unquoted paths using filesystem evidence. */
export function tokenizeSSHPathList(value: string): { path: string; start: number; end: number; quoted: boolean }[] {
	const paths: { path: string; start: number; end: number; quoted: boolean }[] = [];
	const n = value.length;
	let i = 0;
	while (i < n) {
		while (i < n && /\s/.test(value[i])) {
			i++;
		}
		if (i >= n) {
			break;
		}
		const start = i;
		let token = '';
		let quoted = false;
		while (i < n && !/\s/.test(value[i])) {
			const ch = value[i];
			if (ch === '\\' && i + 1 < n && isSSHEscapable(value[i + 1], false)) {
				token += value[i + 1];
				i += 2;
			} else if (ch === '"') {
				quoted = true;
				i++;
				while (i < n && value[i] !== '"') {
					if (value[i] === '\\' && i + 1 < n && isSSHEscapable(value[i + 1], true)) {
						token += value[i + 1];
						i += 2;
					} else {
						token += value[i];
						i++;
					}
				}
				if (i < n) {
					i++; // consume the closing quote
				}
			} else {
				token += ch;
				i++;
			}
		}
		if (token) {
			paths.push({ path: token, start, end: i, quoted });
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
