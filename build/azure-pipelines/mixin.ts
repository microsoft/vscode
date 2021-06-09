/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as json from 'gulp-json-editor';
const buffer = require('gulp-buffer');
import * as filter from 'gulp-filter';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as fs from 'fs';
import * as path from 'path';

interface IBuiltInExtension {
	readonly name: string;
	readonly version: string;
	readonly repo: string;
	readonly metadata: any;
}

interface OSSProduct {
	readonly builtInExtensions: IBuiltInExtension[];
	readonly webBuiltInExtensions?: IBuiltInExtension[];
}

interface Product {
	readonly builtInExtensions?: IBuiltInExtension[] | { 'include'?: IBuiltInExtension[], 'exclude'?: string[] };
	readonly webBuiltInExtensions?: IBuiltInExtension[];
}

function main() {
	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		console.log('Missing VSCODE_QUALITY, skipping mixin');
		return;
	}

	const productJsonFilter = filter(f => f.relative === 'product.json', { restore: true });

	fancyLog(ansiColors.blue('[mixin]'), `Mixing in sources:`);
	return vfs
		.src(`quality/${quality}/**`, { base: `quality/${quality}` })
		.pipe(filter(f => !f.isDirectory()))
		.pipe(productJsonFilter)
		.pipe(buffer())
		.pipe(json((o: Product) => {
			const ossProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8')) as OSSProduct;
			let builtInExtensions = ossProduct.builtInExtensions;

			if (Array.isArray(o.builtInExtensions)) {
				fancyLog(ansiColors.blue('[mixin]'), 'Overwriting built-in extensions:', o.builtInExtensions.map(e => e.name));

				builtInExtensions = o.builtInExtensions;
			} else if (o.builtInExtensions) {
				const include = o.builtInExtensions['include'] || [];
				const exclude = o.builtInExtensions['exclude'] || [];

				fancyLog(ansiColors.blue('[mixin]'), 'OSS built-in extensions:', builtInExtensions.map(e => e.name));
				fancyLog(ansiColors.blue('[mixin]'), 'Including built-in extensions:', include.map(e => e.name));
				fancyLog(ansiColors.blue('[mixin]'), 'Excluding built-in extensions:', exclude);

				builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
				builtInExtensions = [...builtInExtensions, ...include];

				fancyLog(ansiColors.blue('[mixin]'), 'Final built-in extensions:', builtInExtensions.map(e => e.name));
			} else {
				fancyLog(ansiColors.blue('[mixin]'), 'Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
			}

			return { webBuiltInExtensions: ossProduct.webBuiltInExtensions, ...o, builtInExtensions };
		}))
		.pipe(productJsonFilter.restore)
		.pipe(es.mapSync(function (f: Vinyl) {
			fancyLog(ansiColors.blue('[mixin]'), f.relative, ansiColors.green('✔︎'));
			return f;
		}))
		.pipe(vfs.dest('.'));
}

main();
