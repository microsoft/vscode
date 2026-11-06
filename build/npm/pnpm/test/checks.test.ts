/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { parsePnpmLockfile } from '../../../lib/pnpmLock.ts';
import { checkDirectDependencies, checkOverrides, checkPatches, checkPeerProvidedDependencies, checkProductionClosure, checkSshUrls, checkSubtrees, checkUniverse, createUniverse, getGitIdentity, type Finding, type RootUnderTest } from '../checks.ts';
import { parseNpmLockfile, type NpmLockfile } from '../npmLockfile.ts';

const fixture = path.join(import.meta.dirname, 'fixtures', 'workspace');
const npmLockfile = parseNpmLockfile(fs.readFileSync(path.join(fixture, 'package-lock.fixture.json'), 'utf8'));
const lockfileText = fs.readFileSync(path.join(fixture, 'pnpm-lock.fixture.yaml'), 'utf8');
const root: RootUnderTest = {
	folder: '',
	dir: fixture,
	lockfile: parsePnpmLockfile(lockfileText),
	lockfileText,
	projects: [{ folder: '', packageJson: JSON.parse(fs.readFileSync(path.join(fixture, 'package.fixture.json'), 'utf8')), lockfile: npmLockfile }],
};
const otherLockfile: NpmLockfile = { lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.3.0' } } };
const caret = (version: string, range: string) => {
	const compare = (x: string, y: string) => x.split('.').map(Number).reduce((r, n, i) => r || n - Number(y.split('.')[i]), 0);
	if (range.startsWith('>')) {
		return compare(version, range.substring(1)) > 0;
	}
	if (range.startsWith('<')) {
		return compare(version, range.substring(1)) < 0;
	}
	return range.startsWith('^') && version.split('.')[0] === range.substring(1).split('.')[0] && compare(version, range.substring(1)) >= 0;
};
const describe = (findings: Finding[]) => findings.map(f => `${f.severity} ${f.check}: ${f.message}`);

const closureRoot = (importerLines: readonly string[], packageLines: readonly string[], snapshotLines: readonly string[], npm: NpmLockfile): RootUnderTest => {
	const text = ['lockfileVersion: \'9.0\'', '', 'importers:', '', '  .:', ...importerLines, '', 'packages:', '', ...packageLines, '', 'snapshots:', '', ...snapshotLines, ''].join('\n');
	return { folder: '', dir: fixture, lockfile: parsePnpmLockfile(text), lockfileText: text, projects: [{ folder: '', packageJson: {}, lockfile: npm }] };
};

suite('pnpm conversion: verification checks', () => {

	test('(a) direct dependencies: a higher version in range is allowed only if npm has it somewhere', () => {
		assert.deepStrictEqual([
			describe(checkDirectDependencies(root, createUniverse([npmLockfile]), caret)),
			describe(checkDirectDependencies(root, createUniverse([npmLockfile, otherLockfile]), caret)),
		], [
			['error direct: a (^1.0.0): pnpm a@1.3.0, npm a@1.2.0'],
			['allowed direct: a (^1.0.0): pnpm a@1.3.0, npm a@1.2.0 (V-1.3: higher version in range, present in the npm lockfiles)'],
		]);
	});

	test('(a) direct dependencies: a local tarball must be the same file', () => {
		const tarballLockfileText = [
			'lockfileVersion: \'9.0\'', '', 'importers:', '', '  .:', '    devDependencies:', '      tool:',
			'        specifier: file:/tarballs/tool-1.0.0.tgz', '        version: file:../../tarballs/tool-1.0.0.tgz', '',
		].join('\n');
		const tarballRoot = (resolved: string): RootUnderTest => ({
			folder: 'build',
			dir: '/repo/build',
			lockfile: parsePnpmLockfile(tarballLockfileText),
			lockfileText: tarballLockfileText,
			projects: [{
				folder: 'build',
				packageJson: { devDependencies: { tool: 'file:/tarballs/tool-1.0.0.tgz' } },
				lockfile: { lockfileVersion: 3, packages: { '': { devDependencies: { tool: 'file:/tarballs/tool-1.0.0.tgz' } }, 'node_modules/tool': { version: '1.0.0', resolved } } },
			}],
		});
		assert.deepStrictEqual([
			describe(checkDirectDependencies(tarballRoot('file:../../tarballs/tool-1.0.0.tgz'), createUniverse([]), caret)),
			describe(checkDirectDependencies(tarballRoot('file:../../other/tool-1.0.0.tgz'), createUniverse([]), caret)),
		], [
			[],
			[`error direct: tool (file:/tarballs/tool-1.0.0.tgz): pnpm ${path.resolve('/tarballs/tool-1.0.0.tgz')}, npm ${path.resolve('/other/tool-1.0.0.tgz')}`],
		]);
	});

	test('(i) production closure: additions and removals are listed for review with a dependency path', () => {
		// npm satisfies a transitive keytar with the project's file: mock; the real keytar exists in another npm lockfile
		const keytar = closureRoot([
			'    dependencies:',
			'      \'@azure/msal-node-extensions\':', '        specifier: ^5.3.2', '        version: 5.3.2',
			'      keytar:', '        specifier: file:./mock', '        version: file:mock',
		], [
			'  \'@azure/msal-node-extensions@5.3.2\':', '    resolution: {integrity: sha512-m}', '',
			'  keytar@7.9.0:', '    resolution: {integrity: sha512-k}', '',
			'  keytar@file:mock:', '    resolution: {directory: mock, type: directory}',
		], [
			'  \'@azure/msal-node-extensions@5.3.2\':', '    dependencies:', '      keytar: 7.9.0', '',
			'  keytar@7.9.0: {}', '',
			'  keytar@file:mock: {}',
		], {
			lockfileVersion: 3, packages: {
				'': { dependencies: { '@azure/msal-node-extensions': '^5.3.2', keytar: 'file:./mock' } },
				'mock': { name: 'keytar', version: '7.9.0' },
				'node_modules/@azure/msal-node-extensions': { version: '5.3.2', dependencies: { keytar: '^7.8.0' } },
				'node_modules/keytar': { resolved: 'mock', link: true },
			}
		});
		// npm deduped a dist-tag dependency onto the project's own version; pnpm resolved the tag again
		const distTag = closureRoot([
			'    dependencies:', '      \'@vscode/web-editors\':', '        specifier: 0.0.2-76', '        version: 0.0.2-76',
		], [
			'  \'@vscode/hubrpc@0.0.2-54\':', '    resolution: {integrity: sha512-h}', '',
			'  \'@vscode/web-editors@0.0.2-76\':', '    resolution: {integrity: sha512-w}',
		], [
			'  \'@vscode/hubrpc@0.0.2-54\': {}', '',
			'  \'@vscode/web-editors@0.0.2-76\':', '    dependencies:', '      \'@vscode/hubrpc\': 0.0.2-54',
		], {
			lockfileVersion: 3, packages: {
				'': { dependencies: { '@vscode/web-editors': '0.0.2-76' }, devDependencies: { '@vscode/hubrpc': '0.0.2-20' } },
				'node_modules/@vscode/hubrpc': { version: '0.0.2-20' },
				'node_modules/@vscode/web-editors': { version: '0.0.2-76', dependencies: { '@vscode/hubrpc': 'next' } },
			}
		});
		// pnpm records a resolved peer as a dependency; npm (legacy-peer-deps) doesn't install it for production
		const peer = closureRoot([
			'    dependencies:', '      a:', '        specifier: ^1.0.0', '        version: 1.0.0(react@17.0.2)',
		], [
			'  a@1.0.0:', '    resolution: {integrity: sha512-a}', '    peerDependencies:', '      react: \'*\'', '',
			'  react@17.0.2:', '    resolution: {integrity: sha512-r}',
		], [
			'  a@1.0.0(react@17.0.2):', '    dependencies:', '      react: 17.0.2', '',
			'  react@17.0.2: {}',
		], {
			lockfileVersion: 3, packages: {
				'': { dependencies: { a: '^1.0.0' }, devDependencies: { react: '^17.0.2' } },
				'node_modules/a': { version: '1.0.0', peerDependencies: { react: '*' } },
				'node_modules/react': { version: '17.0.2', dev: true },
			}
		});
		const withKeytar: NpmLockfile = { lockfileVersion: 3, packages: { 'node_modules/keytar': { version: '7.9.0' } } };
		assert.deepStrictEqual({
			keytarUniverse: describe(checkUniverse(keytar, createUniverse([keytar.projects[0].lockfile, withKeytar]))),
			keytar: describe(checkProductionClosure(keytar)),
			distTag: describe(checkProductionClosure(distTag)),
			peer: describe(checkProductionClosure(peer)),
		}, {
			keytarUniverse: [],
			keytar: ['review closure: + keytar@7.9.0 (not in its npm lockfile) via @azure/msal-node-extensions@5.3.2 > keytar@7.9.0'],
			distTag: [
				'review closure: + @vscode/hubrpc@0.0.2-54 (not in its npm lockfile) via @vscode/web-editors@0.0.2-76 > @vscode/hubrpc@0.0.2-54',
				'review closure: - @vscode/hubrpc@0.0.2-20 (npm) via @vscode/web-editors@0.0.2-76 > @vscode/hubrpc@0.0.2-20',
			],
			peer: ['review closure: + react@17.0.2 (in its npm lockfile, outside the production closure) via a@1.0.0 > react@17.0.2 (peer)'],
		});
	});

	test('(j) a dependency that is also a peer must be provided, or the hoisted linker drops it', () => {
		const peerRoot = (importerDependencies: readonly string[]): RootUnderTest => {
			const text = [
				'lockfileVersion: \'9.0\'', '', 'settings:', '  autoInstallPeers: false', '', 'importers:', '', '  .:', '    devDependencies:',
				'      vitest:', '        specifier: ^4.1.0', '        version: 4.1.11(vite@8.0.16)',
				...importerDependencies, '',
				'packages:', '',
				'  vite@8.0.16:', '    resolution: {integrity: sha512-v}', '',
				'  vitest@4.1.11:', '    resolution: {integrity: sha512-t}', '    peerDependencies:', '      vite: ^8.0.0', '',
				'snapshots:', '',
				'  vite@8.0.16: {}', '',
				'  vitest@4.1.11(vite@8.0.16):', '    dependencies:', '      vite: 8.0.16', '',
			].join('\n');
			return { folder: 'extensions/copilot', dir: fixture, lockfile: parsePnpmLockfile(text), lockfileText: text, projects: [] };
		};
		assert.deepStrictEqual([
			describe(checkPeerProvidedDependencies(peerRoot([]))),
			describe(checkPeerProvidedDependencies(peerRoot(['      vite:', '        specifier: ^8.0.16', '        version: 8.0.16']))),
		], [
			['error peer: vitest@4.1.11 depends on vite, which is also its peer and is not provided by any parent: pnpm\'s hoisted linker won\'t install it (npm did). Declare vite where the package is used.'],
			[],
		]);
	});

	test('(b) every package must exist in an npm lockfile; git tarballs match on the commit', () => {
		assert.deepStrictEqual(describe(checkUniverse(root, createUniverse([npmLockfile]))), [
			'error universe: a@1.3.0 is not in any npm lockfile (reached from .)',
			'error universe: b@1.0.0 is not in any npm lockfile (reached from .)',
			'error universe: tagged@0.0.2-54 is not in any npm lockfile (reached from .)',
			'error universe: vsda@https://codeload.github.com/microsoft/vsda/tar.gz/0123456789abcdef0123456789abcdef01234567 is not in any npm lockfile (not reachable from any importer)',
		]);
		const withVsda: NpmLockfile = { lockfileVersion: 3, packages: { 'node_modules/vsda': { version: '1.0.0', resolved: 'git+ssh://git@github.com/microsoft/vsda.git#0123456789abcdef0123456789abcdef01234567' } } };
		assert.ok(!describe(checkUniverse(root, createUniverse([npmLockfile, withVsda]))).some(f => f.includes('vsda')));
	});

	test('(c) npm overrides must hold for the packages a project reaches', () => {
		assert.deepStrictEqual(describe(checkOverrides(root, caret)), [
			'error override: override b: ^2.0.0 is not applied: b@1.0.0',
		]);
	});

	test('(a, b, i) git dependencies are identified by repository and commit, not by version', () => {
		const npmCommit = 'a34d15e895472003bf4a9cbc1bae77d56d1b9a4c';
		const otherCommit = 'b34d15e895472003bf4a9cbc1bae77d56d1b9a4c';
		const npm: NpmLockfile = {
			lockfileVersion: 3, packages: {
				'': { dependencies: { vsda: `https://github.com/microsoft/vsda.git#${npmCommit}` } },
				'node_modules/vsda': { version: '1.4.4', resolved: `git+ssh://git@github.com/microsoft/vsda.git#${npmCommit}` },
			}
		};
		const getCommit = (url: string) => url.substring(url.indexOf('#') + 1);
		const gitRoot = (url: string) => closureRoot(
			['    dependencies:', '      vsda:', `        specifier: ${url}`, `        version: ${url}`],
			[`  vsda@${url}:`, `    resolution: {commit: ${getCommit(url)}, repo: ${url.substring(0, url.indexOf('#'))}, type: git}`, '    version: 1.4.4'],
			[`  vsda@${url}: {}`],
			npm);
		const run = (url: string) => {
			const root = gitRoot(url);
			return [...checkDirectDependencies(root, createUniverse([npm]), caret), ...checkUniverse(root, createUniverse([npm])), ...checkProductionClosure(root)].map(f => `${f.severity} ${f.check}`);
		};
		assert.deepStrictEqual([
			run(`git+https://github.com/microsoft/vsda.git#${npmCommit}`),
			run(`git+https://github.com/microsoft/vsda.git#${otherCommit}`),
			run(`git+https://github.com/someone/vsda.git#${npmCommit}`),
			[`git+ssh://git@github.com/microsoft/vsda.git#${npmCommit}`, `git@github.com:microsoft/vsda.git#${npmCommit}`, `github:microsoft/vsda#${npmCommit}`, `https://codeload.github.com/microsoft/vsda/tar.gz/${npmCommit}`, `git+https://github.com/Microsoft/vsda#${npmCommit}`].map(getGitIdentity),
		], [
			[],
			['error direct', 'error universe', 'review closure', 'review closure'],
			['error direct', 'error universe', 'review closure', 'review closure'],
			Array(5).fill(`github.com/microsoft/vsda#${npmCommit}`),
		]);
	});

	test('(f) every patch file exists and the lockfile records its hash, with LF line endings', t => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm-checks-'));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(dir, 'patches'));
		fs.writeFileSync(path.join(dir, 'patches', 'p.patch'), 'diff --git a/x b/x\r\n');
		const hash = crypto.createHash('sha256').update('diff --git a/x b/x\n').digest('hex');
		const patchRoot = (recorded: Record<string, string>): RootUnderTest => ({ ...root, dir, lockfile: { ...root.lockfile, patchedDependencies: recorded } });
		assert.deepStrictEqual([
			describe(checkPatches(patchRoot({ p: hash }), { p: 'patches/p.patch' }, '')),
			describe(checkPatches(patchRoot({ p: 'old', q: hash }), { p: 'patches/p.patch' }, '')),
			describe(checkPatches(patchRoot({}), { p: 'patches/missing.patch' }, '')),
		], [
			[],
			[
				`error setting: pnpm-lock.yaml records patch hash old for p, but patches/p.patch has hash ${hash}; run convert.ts`,
				'error setting: pnpm-lock.yaml records a patch for q, which has none in pnpm-workspace.yaml; run convert.ts',
			],
			['error setting: the patch of p doesn\'t exist: patches/missing.patch'],
		]);
	});

	test('(g) SSH git URLs are rejected', () => {
		assert.deepStrictEqual(describe(checkSshUrls('', 'a:\n  resolution: {tarball: https://codeload.github.com/x}\nb:\n  version: git+ssh://git@github.com/microsoft/vsda.git#abc\nc: git@github.com:microsoft/vsda.git\n')), [
			'error ssh: line 4 records an SSH git URL: version: git+ssh://git@github.com/microsoft/vsda.git#abc',
			'error ssh: line 5 records an SSH git URL: c: git@github.com:microsoft/vsda.git',
		]);
	});

	test('subtree deviations are informational', () => {
		assert.deepStrictEqual(describe(checkSubtrees(root)), [
			'info subtree: 3 packages not in its own npm lockfile: a@1.3.0 b@1.0.0 tagged@0.0.2-54',
		]);
	});
});
