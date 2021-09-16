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
import * as merge from 'gulp-merge-json';
const azure = require('gulp-azure-storage');

const root = path.dirname(path.dirname(__dirname));
const commit = util.getVersion(root);

function main() {
	return es.merge(
		vfs.src('out-vscode-min/nls.metadata.json', { base: 'out-vscode-min' }),
		vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }))
		.pipe(merge({
			fileName: 'combined.nls.metadata.json',
			edit: (parsedJson: any, file: any) => {
				let key: string;
				console.log(file.path);
				if (file.base === 'out-vscode-min') {
					key = 'vscode';
				} else {
					key = file.relative.split('/')[0];
				}
				return { [key]: parsedJson };
			},
		}))
		.pipe(vfs.dest('./nlsMetadata'))
		.pipe(es.through(function (data: Vinyl) {
			console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=nls.metadata.json]${data.path}`);
			this.emit('data', data);
		}))
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'nlsmetadata',
			prefix: commit + '/'
		}));
}

main();
