/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import es from 'event-stream';
import VinylFile from 'vinyl';
import { getMixedInDistroDependencies, toFlatProductionDependencies, toPackagedLayout } from '../dependencies.ts';

suite('dependencies', () => {

	test('takes the distro dependencies from where the mixin copied them, without the distro node_modules', t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-dependencies-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const folder = path.join(root, 'remote');
		const distroFolder = path.join(root, '.build', 'distro', 'npm', 'remote');
		fs.mkdirSync(distroFolder, { recursive: true });
		fs.writeFileSync(path.join(distroFolder, 'package.json'), JSON.stringify({ dependencies: { 'vsda': '1.0.0', '@vscode/vsce-sign': '2.1.0', 'not-mixed-in': '1.0.0' } }));
		for (const name of ['vsda', '@vscode/vsce-sign', 'other']) {
			fs.mkdirSync(path.join(folder, 'node_modules', name), { recursive: true });
		}

		assert.deepStrictEqual({
			mixedIn: getMixedInDistroDependencies(folder, distroFolder).map(dependency => path.relative(root, dependency)),
			noDistro: getMixedInDistroDependencies(folder, path.join(root, '.build', 'distro', 'npm', 'missing')),
		}, {
			mixedIn: [path.join('remote', 'node_modules', 'vsda'), path.join('remote', 'node_modules', '@vscode', 'vsce-sign')],
			noDistro: [],
		});
	});

	test('packages dependencies flat, wherever the workspace or pnpm\'s virtual store installed them', () => {
		const remote = path.join(os.tmpdir(), 'remote');
		const store = path.join(remote, 'node_modules', '.pnpm');
		const dependencies = [
			{ folder: path.join(remote, 'web', 'node_modules', 'jschardet'), source: path.join(remote, 'web', 'node_modules', 'jschardet') },
			{ folder: path.join(remote, 'node_modules', '@xterm', 'xterm'), source: path.join(store, '@xterm+xterm@6.0.0', 'node_modules', '@xterm', 'xterm') },
			{ folder: path.join(remote, 'node_modules', 'katex', 'node_modules', 'commander'), source: path.join(remote, 'node_modules', 'katex', 'node_modules', 'commander') },
		];

		assert.deepStrictEqual({
			flat: toFlatProductionDependencies(dependencies).map(({ folder, base, source }) => [path.relative(remote, base), path.relative(base, folder), path.relative(remote, source)]),
			sameName: assert.throws(() => toFlatProductionDependencies([...dependencies, { folder: path.join(remote, 'web', 'node_modules', 'commander'), source: path.join(remote, 'web', 'node_modules', 'commander') }]), /both named commander/),
		}, {
			flat: [
				['web', path.join('node_modules', 'jschardet'), path.join('web', 'node_modules', 'jschardet')],
				['', path.join('node_modules', '@xterm', 'xterm'), path.join('node_modules', '.pnpm', '@xterm+xterm@6.0.0', 'node_modules', '@xterm', 'xterm')],
				[path.join('node_modules', 'katex'), path.join('node_modules', 'commander'), path.join('node_modules', 'katex', 'node_modules', 'commander')],
			],
			sameName: undefined,
		});
	});

	test('moves files from pnpm\'s virtual store to the hoisted layout, as independent copies', async t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-dependencies-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const store = path.join(root, 'node_modules', '.pnpm');
		const write = (file: string, contents: string) => {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, contents);
		};
		// `a` and `b` depend on `uuid`, nested in each of them in the hoisted layout because another
		// version is at the root.
		const a = { folder: path.join(root, 'node_modules', 'a'), source: path.join(store, 'a@1.0.0', 'node_modules', 'a') };
		const uuid = { folder: path.join(root, 'node_modules', 'a', 'node_modules', 'uuid'), source: path.join(store, 'uuid@8.0.0', 'node_modules', 'uuid') };
		const b = { folder: path.join(root, 'node_modules', 'b'), source: path.join(store, 'b@1.0.0', 'node_modules', 'b') };
		const bUuid = { folder: path.join(root, 'node_modules', 'b', 'node_modules', 'uuid'), source: uuid.source };
		const distro = { folder: path.join(root, 'node_modules', 'vsda'), source: path.join(root, 'node_modules', 'vsda') };
		write(path.join(a.source, 'index.js'), 'a');
		write(path.join(a.source, 'node_modules', '.bin', 'uuid'), 'pnpm command shim');
		write(path.join(uuid.source, 'index.js'), '//# sourceMappingURL=index.js.map');
		write(path.join(distro.source, 'index.js'), 'vsda');
		const files = [path.join(a.source, 'index.js'), path.join(a.source, 'node_modules', '.bin', 'uuid'), path.join(uuid.source, 'index.js'), path.join(distro.source, 'index.js')]
			.map(file => new VinylFile({ base: root, path: file, contents: fs.readFileSync(file) }));

		// Like `rewriteSourceMappingURL`, change each file synchronously, from its packaged path.
		const packaged = await new Promise<VinylFile[]>((resolve, reject) => es.readArray(files)
			.pipe(toPackagedLayout([a, uuid, b, bUuid, distro]))
			.pipe(es.mapSync((file: VinylFile) => {
				file.contents = Buffer.from(file.contents!.toString().replace(/sourceMappingURL=(.*)$/, `sourceMappingURL=https://cdn/${path.dirname(file.relative).split(path.sep).join('/')}/$1`));
				return file;
			}))
			.pipe(es.writeArray((err: Error | undefined, result: VinylFile[]) => err ? reject(err) : resolve(result))));

		assert.deepStrictEqual(packaged.map(file => [file.relative.split(path.sep).join('/'), file.contents!.toString()]), [
			['node_modules/a/index.js', 'a'],
			['node_modules/a/node_modules/uuid/index.js', '//# sourceMappingURL=https://cdn/node_modules/a/node_modules/uuid/index.js.map'],
			['node_modules/b/node_modules/uuid/index.js', '//# sourceMappingURL=https://cdn/node_modules/b/node_modules/uuid/index.js.map'],
			['node_modules/vsda/index.js', 'vsda'],
		]);
	});
});
