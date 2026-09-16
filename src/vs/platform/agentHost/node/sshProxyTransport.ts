/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix, win32 } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';

export type SSHProxyTransport =
	| { readonly type: 'command'; readonly command: string }
	| { readonly type: 'jump'; readonly proxyJump: string };

export interface ISSHProxyConnectionParameters {
	readonly host: string;
	readonly originalHost: string;
	readonly port: number;
	readonly username: string;
}

export interface ISSHProxySpawnSpec {
	readonly command: string;
	readonly args: readonly string[];
	readonly shell: boolean;
}

const safeProxyTokenValue = /^[A-Za-z0-9._:@,+-]+$/;

export function getSSHExecutableCandidates(platform: NodeJS.Platform, pathValue: string | undefined, windowsDirectory = 'C:\\Windows'): string[] {
	const path = platform === 'win32' ? win32 : posix;
	const executableName = platform === 'win32' ? 'ssh.exe' : 'ssh';
	const candidates = platform === 'win32'
		? [path.join(windowsDirectory, 'System32', 'OpenSSH', executableName)]
		: [];
	for (const pathEntry of (pathValue ?? '').split(path.delimiter)) {
		if (path.isAbsolute(pathEntry)) {
			candidates.push(path.join(pathEntry, executableName));
		}
	}
	return [...new Set(candidates)];
}

export function validateSSHConfigHost(host: string): void {
	if (!isSafeProxyTokenValue(host)) {
		throw new Error(localize('ssh.invalidConfigHost', "The SSH config host contains characters that cannot be used safely."));
	}
}

export function parseSSHProxyTransport(stdout: string): SSHProxyTransport | undefined {
	let proxyCommand: string | undefined;
	let proxyJump: string | undefined;

	for (const line of stdout.split('\n')) {
		const separator = line.indexOf(' ');
		if (separator === -1) {
			continue;
		}

		const key = line.substring(0, separator).toLowerCase();
		const value = line.substring(separator + 1).trim();
		if (!value || value.toLowerCase() === 'none') {
			continue;
		}

		if (key === 'proxycommand') {
			if (proxyCommand !== undefined && proxyCommand !== value) {
				throw new Error(localize('ssh.ambiguousProxyCommand', "The resolved SSH configuration contains multiple ProxyCommand values."));
			}
			proxyCommand = value;
		} else if (key === 'proxyjump') {
			if (proxyJump !== undefined && proxyJump !== value) {
				throw new Error(localize('ssh.ambiguousProxyJump', "The resolved SSH configuration contains multiple ProxyJump values."));
			}
			proxyJump = value;
		}
	}

	if (proxyCommand !== undefined && proxyJump !== undefined) {
		throw new Error(localize('ssh.ambiguousProxy', "The resolved SSH configuration contains both ProxyCommand and ProxyJump."));
	}
	if (proxyCommand !== undefined) {
		return { type: 'command', command: proxyCommand };
	}
	if (proxyJump !== undefined) {
		return { type: 'jump', proxyJump };
	}
	return undefined;
}

export function createSSHProxySpawnSpec(transport: SSHProxyTransport, parameters: ISSHProxyConnectionParameters): ISSHProxySpawnSpec {
	if (transport.type === 'command') {
		return {
			command: expandSSHProxyCommand(transport.command, parameters),
			args: [],
			shell: true,
		};
	}

	const jumps = parseProxyJumps(transport.proxyJump);
	const lastJump = jumps[jumps.length - 1];
	const args: string[] = [];
	if (jumps.length > 1) {
		args.push('-J', jumps.slice(0, -1).join(','));
	}
	args.push('-W', formatHostAndPort(parameters.host, parameters.port), '--', lastJump);
	return { command: 'ssh', args, shell: false };
}

function expandSSHProxyCommand(command: string, parameters: ISSHProxyConnectionParameters): string {
	const replacements = new Map<string, string>([
		['h', parameters.host],
		['n', parameters.originalHost],
		['p', validatePort(parameters.port)],
		['r', parameters.username],
	]);
	let result = '';

	for (let index = 0; index < command.length; index++) {
		const character = command[index];
		if (character !== '%') {
			result += character;
			continue;
		}

		const token = command[++index];
		if (token === undefined) {
			throw new Error(localize('ssh.incompleteProxyToken', "The SSH ProxyCommand ends with an incomplete token."));
		}
		if (token === '%') {
			result += '%';
			continue;
		}

		const replacement = replacements.get(token);
		if (replacement === undefined) {
			throw new Error(localize('ssh.unsupportedProxyToken', "The SSH ProxyCommand contains an unsupported token: %{0}.", token));
		}
		if (!isSafeProxyTokenValue(replacement)) {
			throw new Error(localize('ssh.unsafeProxyTokenValue', "An SSH ProxyCommand token expands to characters that cannot be used safely."));
		}
		result += replacement;
	}

	return result;
}

function parseProxyJumps(proxyJump: string): string[] {
	const jumps = proxyJump.split(',');
	if (jumps.length === 0) {
		throw new Error(localize('ssh.emptyProxyJump', "The SSH ProxyJump configuration is empty."));
	}
	for (const jump of jumps) {
		validateProxyJump(jump);
	}
	return jumps;
}

function validateProxyJump(jump: string): void {
	if (!jump || jump.startsWith('-') || /[\u0000-\u0020\u007f]/.test(jump)) {
		throw new Error(localize('ssh.invalidProxyJump', "The SSH ProxyJump configuration contains an invalid host."));
	}

	const match = /^(?:(?<user>[^@,:\s]+)@)?(?<host>\[[^\],\s]+\]|[^,:\s]+)(?::(?<port>\d+))?$/.exec(jump);
	if (!match?.groups?.host || match.groups.host.startsWith('-')) {
		throw new Error(localize('ssh.invalidProxyJump', "The SSH ProxyJump configuration contains an invalid host."));
	}
	if (match.groups.port !== undefined) {
		validatePort(Number(match.groups.port));
	}
}

function formatHostAndPort(host: string, port: number): string {
	validatePort(port);
	if (/[\u0000-\u0020\u007f]/.test(host)) {
		throw new Error(localize('ssh.invalidProxyTarget', "The resolved SSH proxy target contains invalid characters."));
	}
	const formattedHost = host.includes(':') && !(host.startsWith('[') && host.endsWith(']')) ? `[${host}]` : host;
	return `${formattedHost}:${port}`;
}

function validatePort(port: number): string {
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(localize('ssh.invalidProxyPort', "The resolved SSH proxy port is invalid."));
	}
	return String(port);
}

function isSafeProxyTokenValue(value: string): boolean {
	return !!value && !value.startsWith('-') && safeProxyTokenValue.test(value);
}
