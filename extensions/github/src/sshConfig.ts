/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Parses the textual content of an `ssh_config` file and returns a map of
 * `Host` alias (literal, non-pattern) to the resolved `HostName`.
 *
 * Only literal aliases (no `*` or `?` wildcards, no negations) are recorded
 * because we use this map to recognize that a remote like
 * `git@my-alias:owner/repo.git` actually points at GitHub.
 *
 * Tokens are matched case-insensitively per the OpenSSH `ssh_config(5)` spec.
 */
export function parseSshConfig(content: string): Map<string, string> {
	const result = new Map<string, string>();
	let currentHosts: string[] = [];

	for (const rawLine of content.split(/\r?\n/)) {
		// Strip comments and whitespace
		const line = rawLine.replace(/#.*$/, '').trim();
		if (line.length === 0) {
			continue;
		}

		// Keyword and value(s) are separated by whitespace and/or `=`
		const match = /^(\S+?)\s*(?:=\s*)?(.+)$/.exec(line);
		if (!match) {
			continue;
		}

		const keyword = match[1].toLowerCase();
		const value = match[2].trim();

		if (keyword === 'host') {
			// Collect literal alias names (skip patterns / negations)
			currentHosts = value
				.split(/\s+/)
				.filter(host => host.length > 0 && !/[*?!]/.test(host));
		} else if (keyword === 'hostname' && currentHosts.length > 0) {
			for (const host of currentHosts) {
				if (!result.has(host)) {
					result.set(host, value);
				}
			}
		}
	}

	return result;
}

/**
 * Lazily resolves `Host` aliases declared in the user's `~/.ssh/config` to
 * their configured `HostName`. Used by the GitHub remote URL parser so that
 * a remote such as `git@my-alias:owner/repo.git` is recognized as a GitHub
 * remote when `my-alias` resolves to `github.com`.
 */
export class SshConfigHostResolver {

	private _aliasMap: Map<string, string> | undefined;

	constructor(private readonly _configPaths: readonly string[] = defaultSshConfigPaths()) { }

	/**
	 * Synchronously returns the resolved `HostName` for the given alias if the
	 * SSH configuration has already been loaded. Returns `undefined` if the
	 * alias is unknown, or if the configuration has not been loaded yet.
	 */
	resolveSync(alias: string): string | undefined {
		return this._aliasMap?.get(alias);
	}

	/**
	 * Reads and parses the configured `ssh_config` files. Subsequent calls
	 * are no-ops; call `reload()` to force a re-read.
	 */
	async load(): Promise<void> {
		if (this._aliasMap) {
			return;
		}

		const merged = new Map<string, string>();
		for (const configPath of this._configPaths) {
			try {
				const content = await fs.promises.readFile(configPath, 'utf8');
				for (const [alias, hostName] of parseSshConfig(content)) {
					if (!merged.has(alias)) {
						merged.set(alias, hostName);
					}
				}
			} catch {
				// File missing or unreadable - silently ignore. The resolver
				// will simply not recognize aliases declared in this file.
			}
		}

		this._aliasMap = merged;
	}

	/**
	 * Forces a re-read of the configured `ssh_config` files on the next call
	 * to `load()`.
	 */
	reload(): void {
		this._aliasMap = undefined;
	}
}

function defaultSshConfigPaths(): string[] {
	const paths = [path.join(os.homedir(), '.ssh', 'config')];
	if (process.platform !== 'win32') {
		paths.push('/etc/ssh/ssh_config');
	}
	return paths;
}

/**
 * Module-level shared resolver. Activation code calls `load()` once during
 * extension startup so that the synchronous `resolveSync()` lookup in the
 * remote URL parser has data available.
 */
export const sharedSshConfigHostResolver = new SshConfigHostResolver();
