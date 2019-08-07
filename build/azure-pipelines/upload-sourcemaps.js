/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const es = require('event-stream');
const azure = require('gulp-azure-storage');
const vfs = require('vinyl-fs');
const util = require('../lib/util');
const root = path.dirname(path.dirname(__dirname));
const commit = util.getVersion(root);

function main() {
	const vs = vfs.src('out-vscode-min/**/*.map', { base: 'out-vscode-min' }) // client source-maps only
		.pipe(es.mapSync(f => {
			f.path = `${f.base}/core/${f.relative}`;
			return f;
		}));

	const extensionsOut = vfs.src(['.build/extensions/**/*.js.map', '!**/node_modules/**'], { base: '.build' });

	return es.merge(vs, extensionsOut)
		.pipe(es.through(function (data) {
			// debug
			console.log('Uploading Sourcemap', data.relative);
			this.emit('data', data);
		}))
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'sourcemaps',
			prefix: commit + '/'
		}));
}

main();