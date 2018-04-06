/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from github/desktop, obtained from
 * https://github.com/desktop/desktop/blob/master/app/src/lib/git/remote.ts
 * ------------------------------------------------------------------------------------------ */
import { GitProcess } from 'dugite';
import { Remote } from './models/remote';

export async function getRemotes(
	path: string
) {
	const result = await GitProcess.exec(['remote', '-v'], path);
	const output = result.stdout;
	const lines = output.split('\n');
	const remotes = lines
		.filter(x => x.endsWith('(fetch)'))
		.map(x => x.split(/\s+/))
		.map(x => ({ name: x[0], url: x[1] }));

	return remotes;
}

/** Parse the remote information from URL. */
export function parseRemote(remoteName: string, url: string): Remote | null {
	// Examples:
	// https://github.com/octocat/Hello-World.git
	// https://github.com/octocat/Hello-World.git/
	// git@github.com:octocat/Hello-World.git
	// git:github.com/octocat/Hello-World.git
	const regexes = [
		new RegExp('^https?://(?:.+@)?(.+)/(.+)/(.+?)(?:/|.git/?)?$'),
		new RegExp('^git@(.+):(.+)/(.+?)(?:/|.git)?$'),
		new RegExp('^git:(.+)/(.+)/(.+?)(?:/|.git)?$'),
		new RegExp('^ssh://git@(.+)/(.+)/(.+?)(?:/|.git)?$')
	];

	for (const regex of regexes) {
		const result = url.match(regex);
		if (!result) {
			continue;
		}

		const hostname = result[1];
		const owner = result[2];
		const name = result[3];
		if (hostname) {
			return new Remote(remoteName, url, hostname, owner, name);
		}
	}

	return null;
}
