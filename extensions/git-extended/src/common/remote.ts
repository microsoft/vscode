import { GitProcess } from 'dugite';
import { IGitRemoteURL } from './models/remote';

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
export function parseRemote(url: string): IGitRemoteURL | null {
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
			return { hostname, owner, name };
		}
	}

	return null;
}
