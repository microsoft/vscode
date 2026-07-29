/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { run } from 'node:test';
import { spec, junit } from 'node:test/reporters';
import path from 'node:path';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import glob from 'glob';

const testRoot = import.meta.dirname;
const files = glob.sync(path.posix.join(testRoot, '../out/test/**/*.test.js'));

const stream = run({
	files,
	timeout: 60000,
	...(process.env.MOCHA_GREP ? { testNamePatterns: [process.env.MOCHA_GREP] } : {}),
});

let failed = 0;
stream.on('test:fail', () => failed++);

const ciOutputDir = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
if (ciOutputDir) {
	const suite = 'Integration HTML Extension Tests';
	const xmlPath = path.join(ciOutputDir, `test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`);
	fs.mkdirSync(path.dirname(xmlPath), { recursive: true });

	const specBranch = new PassThrough({ objectMode: true });
	const junitBranch = new PassThrough({ objectMode: true });
	stream.on('data', chunk => { specBranch.write(chunk); junitBranch.write(chunk); });
	stream.on('end', () => { specBranch.end(); junitBranch.end(); });

	specBranch.compose(spec).pipe(process.stdout);
	const fileStream = junitBranch.compose(junit).pipe(fs.createWriteStream(xmlPath));
	stream.on('close', () => fileStream.on('finish', () => process.exit(failed ? 1 : 0)));
} else {
	stream.compose(spec).pipe(process.stdout);
	stream.on('close', () => process.exit(failed ? 1 : 0));
}
