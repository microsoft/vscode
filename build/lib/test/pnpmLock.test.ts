/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import { collectImporterPackages, getLockfileFolder, getSnapshotKey, importerDependencyKinds, listLockfiles, parsePackageKey, parsePnpmLockfile, readLockfileImporter, resolveDependencyVersion } from '../pnpmLock.ts';

const lockfile = parsePnpmLockfile(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'npm', 'pnpm', 'test', 'fixtures', 'workspace', 'pnpm-lock.fixture.yaml'), 'utf8'));

suite('pnpmLock', () => {

	test('package keys, aliases and peer suffixes', () => {
		assert.deepStrictEqual([
			parsePackageKey('@scope/name@1.0.0(peer@2.0.0)(@s/p@1.0.0(x@1.0.0))'),
			parsePackageKey('keytar@file:extensions/microsoft-authentication/packageMocks/keytar'),
			getSnapshotKey('a', '1.3.0(b@2.1.0)'),
			getSnapshotKey('@old/ts', 'ts-real@6.0.3'),
			getSnapshotKey('ws', 'link:../ws'),
			resolveDependencyVersion('ts', '@scope/ts6@6.0.2'),
			resolveDependencyVersion('a', '1.3.0(b@2.1.0)'),
			resolveDependencyVersion('vsda', 'https://codeload.github.com/microsoft/vsda/tar.gz/0123'),
		], [
			{ name: '@scope/name', version: '1.0.0', peers: '(peer@2.0.0)(@s/p@1.0.0(x@1.0.0))' },
			{ name: 'keytar', version: 'file:extensions/microsoft-authentication/packageMocks/keytar', peers: '' },
			'a@1.3.0(b@2.1.0)',
			'ts-real@6.0.3',
			undefined,
			{ name: '@scope/ts6', version: '6.0.2' },
			{ name: 'a', version: '1.3.0' },
			{ name: 'vsda', version: 'https://codeload.github.com/microsoft/vsda/tar.gz/0123' },
		]);
	});

	test('importers read without a YAML parser', () => {
		const content = [
			'lockfileVersion: \'9.0\'',
			'',
			'importers:',
			'',
			'  .:',
			'    dependencies:',
			'      \'@scope/a\':',
			'        specifier: ^1.0.0',
			'        version: 1.3.0(b@2.1.0)',
			'      ws:',
			'        specifier: link:../ws',
			'        version: link:../ws',
			'    devDependencies:',
			'      ts:',
			'        specifier: \'*\'',
			'        version: \'@scope/ts6@6.0.2\'',
			'    dependenciesMeta:',
			'      ws:',
			'        injected: true',
			'',
			'  extensions/empty: {}',
			'',
			'packages:',
			'',
			'  \'@scope/a@1.3.0\':',
			'    resolution: {integrity: sha512-x}',
		].join('\r\n');
		assert.deepStrictEqual([
			readLockfileImporter(content, '.'),
			readLockfileImporter(content, 'extensions/empty'),
			readLockfileImporter(content, 'extensions/missing'),
		], [
			{
				dependencies: { '@scope/a': { specifier: '^1.0.0', version: '1.3.0(b@2.1.0)' }, ws: { specifier: 'link:../ws', version: 'link:../ws' } },
				devDependencies: { ts: { specifier: '*', version: '@scope/ts6@6.0.2' } },
			},
			{},
			undefined,
		]);
		assert.throws(() => readLockfileImporter(content.replace('\'9.0\'', '\'6.0\''), '.'), /Unsupported pnpm lockfile version: 6.0/);
		assert.throws(() => readLockfileImporter(content.replace('      ws:\r\n        specifier', '      ws: {specifier: x, version: y}\r\n        specifier'), '.'), /Unsupported line/);
	});

	test('importers read without a YAML parser match the parsed lockfiles', () => {
		const lockfiles = [
			fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'npm', 'pnpm', 'test', 'fixtures', 'workspace', 'pnpm-lock.fixture.yaml'), 'utf8'),
			...listLockfiles().map(file => fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', file), 'utf8')),
		];
		for (const content of lockfiles) {
			const { importers } = parsePnpmLockfile(content);
			for (const [id, importer] of Object.entries(importers)) {
				const expected = Object.fromEntries(importerDependencyKinds.filter(kind => importer[kind]).map(kind => [kind, importer[kind]]));
				assert.deepStrictEqual(readLockfileImporter(content, id), expected, id);
				assert.deepStrictEqual(readLockfileImporter(content.replace(/\n/g, '\r\n'), id), expected, id);
			}
		}
	});

	test('packages reachable from an importer', () => {
		assert.deepStrictEqual([...collectImporterPackages(lockfile, '.')].sort(), [
			'@scope/ts6@6.0.2',
			'a@1.3.0(b@2.1.0)',
			'b@1.0.0',
			'mock@file:mocks/mock',
			'tagged@0.0.2-54',
			'tool@0.1.1',
			'ts-real@6.0.3',
		]);
		assert.deepStrictEqual([...collectImporterPackages(lockfile, '.', { includeDevDependencies: false })].sort(), ['a@1.3.0(b@2.1.0)', 'b@1.0.0', 'mock@file:mocks/mock', 'tagged@0.0.2-54']);
	});

	test('lockfile folders of projects', () => {
		assert.deepStrictEqual(['', 'extensions/git', './extensions/git/', 'remote', 'build/npm/gyp', 'build/agent-sdk/agents/claude', 'src'].map(getLockfileFolder), ['', '', '', 'remote', 'build/npm/gyp', undefined, undefined]);
	});
});
