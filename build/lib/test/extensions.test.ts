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
import { createVscodeignoreFilter, getSharedExtensionDependencyStream, isPackagedTypeScriptFile } from '../extensions.ts';
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

suite('createVscodeignoreFilter', () => {
	function createFilter(t: { after(fn: () => void): void }, vscodeignore: string): (filePath: string) => boolean {
		const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-extensions-'));
		t.after(() => fs.rmSync(extensionPath, { recursive: true, force: true }));
		fs.writeFileSync(path.join(extensionPath, '.vscodeignore'), vscodeignore);
		return createVscodeignoreFilter(extensionPath);
	}

	test('selects only the negated files of a dependency when everything else is ignored', t => {
		const isPackaged = createFilter(t, [
			'**',
			'node_modules/@github/copilot/index.js',
			'node_modules/@github/copilot/prebuilds/**',
			'# Comments are skipped',
			'!node_modules/@github/copilot/package.json',
			'!node_modules/@github/copilot/sdk/*.js',
			'!node_modules/@github/copilot/sdk/prebuilds/*/*.node',
			'!node_modules/@github/copilot/sdk/prebuilds/*/spawn-helper',
			'!node_modules/@github/copilot/sdk/tgrep/bin/*/**',
		].join('\n'));
		const files = [
			'node_modules/@github/copilot/package.json',
			'node_modules/@github/copilot/README.md',
			'node_modules/@github/copilot/index.js',
			'node_modules/@github/copilot/prebuilds/darwin-arm64/pty.node',
			'node_modules/@github/copilot/sharp/index.js',
			'node_modules/@github/copilot/sdk/index.js',
			'node_modules/@github/copilot/sdk/index.d.ts',
			'node_modules/@github/copilot/sdk/worker/worker.js',
			'node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/runtime.node',
			'node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/spawn-helper',
			'node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/runtime.pdb',
			'node_modules/@github/copilot/sdk/tgrep/bin/linux-x64/tgrep',
		];

		assert.deepStrictEqual(files.filter(isPackaged), [
			'node_modules/@github/copilot/package.json',
			'node_modules/@github/copilot/sdk/index.js',
			'node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/runtime.node',
			'node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/spawn-helper',
			'node_modules/@github/copilot/sdk/tgrep/bin/linux-x64/tgrep',
		]);
	});

	test('matches like vsce: folder names relative to the extension, negated patterns over ignored ones, CRLF line endings', t => {
		const isPackaged = createFilter(t, 'src\r\nbuild/\r\n*.map\r\n!assets/\r\nassets/large.png\r\n');
		const files = [
			'src/extension.ts',
			'build/Release/native.node',
			'extension.js.map',
			'dist/extension.js',
			'assets/large.png',
			'assets/icon.png',
			'node_modules/dependency/src/index.js',
			'node_modules/dependency/build/Release/native.node',
		];

		assert.deepStrictEqual(files.filter(isPackaged), [
			'dist/extension.js',
			'assets/large.png',
			'assets/icon.png',
			'node_modules/dependency/src/index.js',
			'node_modules/dependency/build/Release/native.node',
		]);
	});
});
