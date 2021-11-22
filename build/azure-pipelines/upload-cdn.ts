/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as util from '../lib/util';
import * as filter from 'gulp-filter';
import * as gzip from 'gulp-gzip';
import { ClientSecretCredential } from '@azure/identity';
const azure = require('gulp-azure-storage');

const root = path.dirname(path.dirname(__dirname));
const commit = util.getVersion(root);
const credential = new ClientSecretCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, process.env['AZURE_CLIENT_SECRET']!);

function main(): Promise<void> {
	return new Promise((c, e) => {
		vfs.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
			.pipe(filter(f => !f.isDirectory()))
			.pipe(gzip({ append: false }))
			.pipe(es.through(function (data: Vinyl) {
				console.log('Uploading CDN file:', data.relative); // debug
				this.emit('data', data);
			}))
			.pipe(azure.upload({
				account: process.env.AZURE_STORAGE_ACCOUNT,
				credential,
				container: process.env.VSCODE_QUALITY,
				prefix: commit + '/',
				contentSettings: {
					contentEncoding: 'gzip',
					cacheControl: 'max-age=31536000, public'
				}
			}))
			.on('end', () => c())
			.on('error', (err: any) => e(err));
	});
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
