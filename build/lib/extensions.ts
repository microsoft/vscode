/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { through } from 'event-stream';
import { Stream } from 'stream';
import assign = require('object-assign');
import remote = require('gulp-remote-src');
const flatmap = require('gulp-flatmap');
const vzip = require('gulp-vinyl-zip');
const filter = require('gulp-filter');
const rename = require('gulp-rename');
const util = require('gulp-util');
const buffer = require('gulp-buffer');
const json = require('gulp-json-editor');

function error(err: any): Stream {
	const result = through();
	setTimeout(() => result.emit('error', err));
	return result;
}

const baseHeaders = {
	'X-Market-Client-Id': 'VSCode Build',
	'User-Agent': 'VSCode Build',
};

export function src(extensionName: string, version: string): Stream {
	const filterType = 7;
	const value = extensionName;
	const criterium = { filterType, value };
	const criteria = [criterium];
	const pageNumber = 1;
	const pageSize = 1;
	const sortBy = 0;
	const sortOrder = 0;
	const flags = 0x1 | 0x2 | 0x80;
	const assetTypes = ['Microsoft.VisualStudio.Services.VSIXPackage'];
	const filters = [{ criteria, pageNumber, pageSize, sortBy, sortOrder }];
	const body = JSON.stringify({ filters, assetTypes, flags });
	const headers: any = assign({}, baseHeaders, {
		'Content-Type': 'application/json',
		'Accept': 'application/json;api-version=3.0-preview.1',
		'Content-Length': body.length
	});

	const options = {
		base: 'https://marketplace.visualstudio.com/_apis/public/gallery',
		requestOptions: {
			method: 'POST',
			gzip: true,
			headers,
			body: body
		}
	};

	return remote('/extensionquery', options)
		.pipe(flatmap((stream, f) => {
			const rawResult = f.contents.toString('utf8');
			const result = JSON.parse(rawResult);
			const extension = result.results[0].extensions[0];
			if (!extension) {
				return error(`No such extension: ${extension}`);
			}

			const metadata = {
				id: extension.extensionId,
				publisherId: extension.publisher,
				publisherDisplayName: extension.publisher.displayName
			};

			const extensionVersion = extension.versions.filter(v => v.version === version)[0];
			if (!extensionVersion) {
				return error(`No such extension version: ${extensionName} @ ${version}`);
			}

			const asset = extensionVersion.files.filter(f => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')[0];
			if (!asset) {
				return error(`No VSIX found for extension version: ${extensionName} @ ${version}`);
			}

			util.log('Downloading extension:', util.colors.yellow(`${extensionName}@${version}`), '...');

			const options = {
				base: asset.source,
				requestOptions: {
					gzip: true,
					headers: baseHeaders
				}
			};

			return remote('', options)
				.pipe(flatmap(stream => {
					const packageJsonFilter = filter('package.json', { restore: true });

					return stream
						.pipe(vzip.src())
						.pipe(filter('extension/**'))
						.pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
						.pipe(packageJsonFilter)
						.pipe(buffer())
						.pipe(json({ __metadata: metadata }))
						.pipe(packageJsonFilter.restore);
				}));
		}));
}
