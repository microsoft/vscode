/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import Vinyl from 'vinyl';
import vfs from 'vinyl-fs';
import merge from 'gulp-merge-json';
import gzip from 'gulp-gzip';
import { ClientAssertionCredential } from '@azure/identity';
import path = require('path');
import { readFileSync } from 'fs';
const azure = require('gulp-azure-storage');

const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new ClientAssertionCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, () => Promise.resolve(process.env['AZURE_ID_TOKEN']!));

interface NlsMetadata {
	keys: { [module: string]: string };
	messages: { [module: string]: string };
	bundles: { [bundle: string]: string[] };
}

function main(): Promise<void> {
	return new Promise((c, e) => {
		const combinedMetadataJson = es.merge(
			// vscode: we are not using `out-build/nls.metadata.json` here because
			// it includes metadata for translators for `keys`. but for our purpose
			// we want only the `keys` and `messages` as `string`.
			es.merge(
				vfs.src('out-build/nls.keys.json', { base: 'out-build' }),
				vfs.src('out-build/nls.messages.json', { base: 'out-build' }))
				.pipe(merge({
					fileName: 'vscode.json',
					jsonSpace: '',
					concatArrays: true,
					edit: (parsedJson, file) => {
						if (file.base === 'out-build') {
							if (file.basename === 'nls.keys.json') {
								return { keys: parsedJson };
							} else {
								return { messages: parsedJson };
							}
						}
					}
				})),

			// extensions
			vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }),
			vfs.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }),
			vfs.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' })
		).pipe(merge({
			fileName: 'combined.nls.metadata.json',
			jsonSpace: '',
			concatArrays: true,
			edit: (parsedJson, file) => {
				if (file.basename === 'vscode.json') {
					return { vscode: parsedJson };
				}

				// Handle extensions and follow the same structure as the Core nls file.
				switch (file.basename) {
					case 'package.nls.json':
						// put package.nls.json content in Core NlsMetadata format
						// language packs use the key "package" to specify that
						// translations are for the package.json file
						parsedJson = {
							messages: {
								package: Object.values(parsedJson)
							},
							keys: {
								package: Object.keys(parsedJson)
							},
							bundles: {
								main: ['package']
							}
						};
						break;

					case 'nls.metadata.header.json':
						parsedJson = { header: parsedJson };
						break;

					case 'nls.metadata.json': {
						// put nls.metadata.json content in Core NlsMetadata format
						const modules = Object.keys(parsedJson);

						const json: NlsMetadata = {
							keys: {},
							messages: {},
							bundles: {
								main: []
							}
						};
						for (const module of modules) {
							json.messages[module] = parsedJson[module].messages;
							json.keys[module] = parsedJson[module].keys;
							json.bundles.main.push(module);
						}
						parsedJson = json;
						break;
					}
				}

				// Get extension id and use that as the key
				const folderPath = path.join(file.base, file.relative.split('/')[0]);
				const manifest = readFileSync(path.join(folderPath, 'package.json'), 'utf-8');
				const manifestJson = JSON.parse(manifest);
				const key = manifestJson.publisher + '.' + manifestJson.name;
				return { [key]: parsedJson };
			},
		}));

		const nlsMessagesJs = vfs.src('out-build/nls.messages.js', { base: 'out-build' });

		es.merge(combinedMetadataJson, nlsMessagesJs)
			.pipe(gzip({ append: false }))
			.pipe(vfs.dest('./nlsMetadata'))
			.pipe(es.through(function (data: Vinyl) {
				console.log(`Uploading ${data.path}`);
				// trigger artifact upload
				console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=${data.basename}]${data.path}`);
				this.emit('data', data);
			}))
			.pipe(azure.upload({
				account: process.env.AZURE_STORAGE_ACCOUNT,
				credential,
				container: '$web',
				prefix: `nlsmetadata/${commit}/`,
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
