/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Stream } from 'stream';
import got from 'got';
import { remote } from './gulpRemoteSource';
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

/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
export function assetFromGithub(repo: string, version: string, assetFilter: (name: string) => boolean): Stream {
	return remote(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${version}`, {
		base: 'https://api.github.com',
		fetchOptions: { headers: ghApiHeaders }
	}).pipe(through2.obj(function (file, _enc, callback) {
		const asset = JSON.parse(file.contents.toString()).assets.find((a: { name: string }) => assetFilter(a.name));
		if (!asset) {
			return callback(new Error(`Could not find asset in release of ${repo} @ ${version}`));
		}

		const res = got.stream(asset.url, { headers: ghDownloadHeaders, followRedirect: true });
		file.contents = res.pipe(through2());
		callback(null, file);
	}));
}
