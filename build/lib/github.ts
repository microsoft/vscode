/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Stream } from 'stream';
import { remote, remoteFile } from './gulpRemoteSource';
import * as through2 from 'through2';

const ghApiHeaders: Record<string, string> = {
	Accept: 'application/vnd.github.v3+json',
	'User-Agent': 'VSCode Build',
};
if (process.env.GITHUB_TOKEN) {
	ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
	...ghApiHeaders,
	Accept: 'application/octet-stream',
};

export interface IGitHubAssetOptions {
	version: string;
	name: string | ((name: string) => boolean);
	checksumSha256?: string;
}

/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
export function assetFromGithub(repo: string, options: IGitHubAssetOptions): Stream {
	return remote(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${options.version}`, {
		base: 'https://api.github.com',
		verbose: true,
		fetchOptions: { headers: ghApiHeaders }
	}).pipe(through2.obj(async function (file, _enc, callback) {
		const assetFilter = typeof options.name === 'string' ? (name: string) => name === options.name : options.name;
		const asset = JSON.parse(file.contents.toString()).assets.find((a: { name: string }) => assetFilter(a.name));
		if (!asset) {
			return callback(new Error(`Could not find asset in release of ${repo} @ ${options.version}`));
		}
		try {
			callback(null, await remoteFile(asset.url, {
				fetchOptions: { headers: ghDownloadHeaders },
				verbose: true,
				checksumSha256: options.checksumSha256
			}));
		} catch (error) {
			callback(error);
		}
	}));
}
