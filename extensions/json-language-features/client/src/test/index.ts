/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { run } from 'node:test';
import { spec, junit } from 'node:test/reporters';
import * as glob from 'glob';

const files = glob.sync('**/*.test.js', { cwd: __dirname }).map(file => path.join(__dirname, file));
if (files.length === 0) {
	throw new Error('No compiled JSON extension tests found.');
}

const stream = run({
	files,
	timeout: 60000,
	argv: process.argv.slice(2),
	...(process.env.MOCHA_GREP ? { testNamePatterns: [process.env.MOCHA_GREP] } : {}),
});

stream.on('test:fail', () => {
	process.exitCode = 1;
});

const ciOutputDir = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
if (ciOutputDir) {
	const suite = 'Integration JSON Extension Tests';
	const xmlPath = path.join(ciOutputDir, `test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`);
	fs.mkdirSync(path.dirname(xmlPath), { recursive: true });

	stream.pipe(new PassThrough({ objectMode: true })).compose(junit).pipe(fs.createWriteStream(xmlPath));
}

stream.compose(spec).pipe(process.stdout);
