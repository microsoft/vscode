/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as util from '../lib/util';
import { isAMD } from '../lib/amd';
// @ts-ignore
import * as deps from '../lib/dependencies';
import { ClientSecretCredential } from '@azure/identity';
const azure = require('gulp-azure-storage');

const root = path.dirname(path.dirname(__dirname));
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new ClientSecretCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, process.env['AZURE_CLIENT_SECRET']!);

// optionally allow to pass in explicit base/maps to upload
const [, , base, maps] = process.argv;

function src(base: string, maps = `${base}/**/*.map`) {
	return vfs.src(maps, { base })
		.pipe(es.mapSync((f: Vinyl) => {
			f.path = `${f.base}/core/${f.relative}`;
			return f;
		}));
}

function main(): Promise<void> {
	if (isAMD()) {
		return Promise.resolve(); // in AMD we run into some issues, but we want to unblock the build for recovery
	}
	const sources: any[] = [];

	// vscode client maps (default)
	if (!base) {
		const vs = src('out-vscode-min'); // client source-maps only
		sources.push(vs);

		const productionDependencies = deps.getProductionDependencies(root);
		const productionDependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => `./${d}/**/*.map`);
		const nodeModules = vfs.src(productionDependenciesSrc, { base: '.' })
			.pipe(util.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
			.pipe(util.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`)));
		sources.push(nodeModules);

		const extensionsOut = vfs.src(['.build/extensions/**/*.js.map', '!**/node_modules/**'], { base: '.build' });
		sources.push(extensionsOut);
	}

	// specific client base/maps
	else {
		sources.push(src(base, maps));
	}

	return new Promise((c, e) => {
		es.merge(...sources)
			.pipe(es.through(function (data: Vinyl) {
				console.log('Uploading Sourcemap', data.relative); // debug
				this.emit('data', data);
			}))
			.pipe(azure.upload({
				account: process.env.AZURE_STORAGE_ACCOUNT,
				credential,
				container: 'sourcemaps',
				prefix: commit + '/'
			}))
			.on('end', () => c())
			.on('error', (err: any) => e(err));
	});
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

