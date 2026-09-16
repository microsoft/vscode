/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fsp } from 'fs';
import { homedir } from 'os';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { localize } from '../../../nls.js';
import { tokenizeSSHPathList } from '../common/sshConfigParsing.js';

/** A failure to resolve configured trust files must not fall back to default known-hosts settings. */
export class SSHKnownHostsResolutionError extends Error { }

async function isKnownHostsFile(path: string): Promise<boolean> {
	try {
		return (await fsp.stat(path.replace(/^~/, homedir()))).isFile();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return false;
		}
		throw error;
	}
}

/** Recovers paths whose quotes were lost by `ssh -G`, rejecting overlapping filesystem matches. */
export async function resolveSSHKnownHostsFiles(stdout: string, isFile: (path: string) => Promise<boolean> = isKnownHostsFile): Promise<{ userKnownHostsFiles: string[]; globalKnownHostsFiles: string[] }> {
	const lists = new Map<string, string>();
	for (const match of stdout.matchAll(/^(?<key>userknownhostsfile|globalknownhostsfile) (?<value>.*)$/gmi)) {
		lists.set(match.groups!.key.toLowerCase(), match.groups!.value.trim());
	}

	const resolvePaths = async (value: string): Promise<string[]> => {
		const tokens = tokenizeSSHPathList(value);
		const matches: { path: string; start: number; end: number }[] = [];
		for (let start = 0; start < tokens.length; start++) {
			for (let end = start; end < tokens.length; end++) {
				if (end > start && (tokens[start].quoted || tokens[end].quoted || /^(?:[~/\\]|[a-zA-Z]:[\\/])/.test(tokens[end].path))) {
					break;
				}
				const path = end === start ? tokens[start].path : value.slice(tokens[start].start, tokens[end].end);
				if (await isFile(path)) {
					const previous = matches.at(-1);
					if (previous && previous.end >= start) {
						throw new Error(localize('sshAmbiguousKnownHostsFiles', "Cannot determine SSH known-hosts file paths from ambiguous ssh -G output: {0}", value));
					}
					matches.push({ path, start, end });
				}
			}
		}

		const paths: string[] = [];
		let matchIndex = 0;
		for (let index = 0; index < tokens.length; index++) {
			const match = matches[matchIndex];
			if (match?.start === index) {
				paths.push(match.path);
				index = match.end;
				matchIndex++;
			} else {
				paths.push(tokens[index].path);
			}
		}
		return paths;
	};

	try {
		const [userKnownHostsFiles, globalKnownHostsFiles] = await Promise.all([
			resolvePaths(lists.get('userknownhostsfile') ?? ''),
			resolvePaths(lists.get('globalknownhostsfile') ?? ''),
		]);
		return { userKnownHostsFiles, globalKnownHostsFiles };
	} catch (error) {
		throw new SSHKnownHostsResolutionError(localize('sshKnownHostsResolutionFailed', "Failed to resolve SSH known-hosts files: {0}", toErrorMessage(error)), { cause: error });
	}
}
