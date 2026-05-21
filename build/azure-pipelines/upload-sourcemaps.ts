/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import es from 'event-stream';
import Vinyl from 'vinyl';
import vfs from 'vinyl-fs';
import * as util from '../lib/util.ts';
import { getProductionDependencies } from '../lib/dependencies.ts';
import { ClientAssertionCredential } from '@azure/identity';
import Stream from 'stream';
import { azureStorage } from '../lib/gulp/facade.ts';
import { paths } from '../folders.ts';

const root = path.dirname(path.dirname(import.meta.dirname));
const commit = process.env['BUILD_SOURCEVERSION'];
const credential = new ClientAssertionCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, () => Promise.resolve(process.env['AZURE_ID_TOKEN']!));

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
	const sources: Stream[] = [];

	// vscode client maps (default)
	if (!base) {
		const vs = src(paths.outVscodeMin.rootRelPath); // client source-maps only
		sources.push(vs);

		const productionDependencies = getProductionDependencies(root);
		const productionDependenciesSrc = productionDependencies.map((d: string) => path.relative(root, d)).map((d: string) => `./${d}/**/*.map`);
		const nodeModules = vfs.src(productionDependenciesSrc, { base: '.' })
			.pipe(util.cleanNodeModules(paths.build.moduleignore.absPath))
			.pipe(util.cleanNodeModules(`${paths.build.moduleignore.absPath}.${process.platform}`));
		sources.push(nodeModules);

		const extensionsOut = vfs.src([`${paths.dotBuild.extensions.rootRelPath}/**/*.js.map`, '!**/node_modules/**'], { base: paths.dotBuild.rootRelPath });
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
			.pipe(azureStorage.upload({
				account: process.env.AZURE_STORAGE_ACCOUNT,
				credential,
				container: '$web',
				prefix: `sourcemaps/${commit}/`
			}))
			.on('end', () => c())
			.on('error', (err) => e(err));
	});
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

