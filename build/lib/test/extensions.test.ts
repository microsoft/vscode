/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import es from 'event-stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import type VinylFile from 'vinyl';
import { getSharedExtensionDependencyStream, isPackagedTypeScriptFile } from '../extensions.ts';
import { cleanNodeModules } from '../util.ts';

suite('isPackagedTypeScriptFile', () => {
	test('keeps package.json and lib, without the compiler, typescriptServices and most declarations', () => {
		const files = [
			'',
			'package.json',
			'README.md',
			'bin/tsc',
			'lib',
			'lib/typescript.js',
			'lib/tsserver.js',
			'lib/_tsserver.js',
			'lib/typesMap.json',
			'lib/tsc.js',
			'lib/_tsc.js',
			'lib/tsc6.js',
			'lib/typescriptServices.js',
			'lib/lib.d.ts',
			'lib/lib.es2015.d.ts',
			'lib/typescript.d.ts',
			'lib/protocol.d.ts',
			'lib/tsserverlibrary.d.ts',
			'lib/cs',
			'lib/cs/diagnosticMessages.generated.json',
		];

		assert.deepStrictEqual(files.filter(isPackagedTypeScriptFile), [
			'',
			'package.json',
			'lib',
			'lib/typescript.js',
			'lib/tsserver.js',
			'lib/_tsserver.js',
			'lib/typesMap.json',
			'lib/lib.d.ts',
			'lib/lib.es2015.d.ts',
			'lib/typescript.d.ts',
			'lib/protocol.d.ts',
			'lib/cs',
			'lib/cs/diagnosticMessages.generated.json',
		]);
	});
});

suite('getSharedExtensionDependencyStream', () => {
	test('places the files of a package in pnpm\'s virtual store at their destination, for the module filters', async t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-extensions-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const folder = path.join(root, 'node_modules', '.pnpm', 'x@1.0.0', 'node_modules', 'x');
		for (const file of ['index.js', 'README.md', 'test/index.js']) {
			fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
			fs.writeFileSync(path.join(folder, file), file);
		}
		const moduleIgnore = path.join(root, '.moduleignore');
		fs.writeFileSync(moduleIgnore, 'x/README.md\n');

		const packaged = await new Promise<VinylFile[]>((resolve, reject) => getSharedExtensionDependencyStream(folder, 'extensions/node_modules/x')
			.pipe(cleanNodeModules(moduleIgnore))
			.pipe(es.writeArray((err: Error | undefined, result: VinylFile[]) => err ? reject(err) : resolve(result))));

		assert.deepStrictEqual(packaged.filter(file => !file.isDirectory()).map(file => file.relative.split(path.sep).join('/')), ['extensions/node_modules/x/index.js']);
	});
});
