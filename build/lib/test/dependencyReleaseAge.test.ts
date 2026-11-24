/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { addedPackages, cargoSource, checkChanges, registryConfigurationProblems, stricterPolicy, checkRevisions, createPublicRegistry, isExcluded, packageManagerPackage, parseCargoLockfile, parsePackageLockfile, parsePnpmLockfile, parseReleaseAgePolicy, type ILockedPackage, type IRegistry, type Release } from '../dependencyReleaseAge.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const now = new Date('2026-11-23T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const policy = { minimumReleaseAge: 10080, exclude: ['@vscode/*', 'electron'], file: 'pnpm-workspace.yaml' };
const npm = (name: string, version: string, source: ILockedPackage['source'] = { kind: 'registry' }): ILockedPackage => ({ ecosystem: 'npm', name, version, source });

function fakeRegistry(releases: Record<string, Release>): IRegistry & { readonly lookups: string[] } {
	const lookups: string[] = [];
	return {
		lookups,
		async release(ecosystem, name, version) {
			lookups.push(`${ecosystem}:${name}@${version}`);
			return releases[`${name}@${version}`] ?? { kind: 'notFound' };
		},
	};
}

const pnpmLockfile = `---
lockfileVersion: '9.0'

importers:

  .:
    packageManagerDependencies:
      pnpm:
        specifier: 12.16.0
        version: 12.16.0

packages:

  pnpm@12.16.0:
    resolution: {integrity: sha512-abc==}
    hasBin: true

---
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      left-pad:
        specifier: ^1.3.0
        version: 1.3.0

packages:

  '@scope/name@2.0.0-beta.1':
    resolution: {integrity: sha512-def==}
    engines: {node: '>=18'}

  left-pad@1.3.0:
    resolution: {integrity: sha512-ghi==, tarball: https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz}

  from-git@https://codeload.github.com/owner/repo/tar.gz/0123abc:
    resolution: {tarball: https://codeload.github.com/owner/repo/tar.gz/0123abc}
    version: 1.0.0

  git-dep@git+https://github.com/owner/repo.git#0123abc:
    resolution: {commit: 0123abc, repo: https://github.com/owner/repo.git, type: git}
    version: 1.0.0

  keytar@file:mocks/keytar:
    resolution: {directory: mocks/keytar, type: directory}

snapshots:

  left-pad@1.3.0: {}
`;

suite('dependencyReleaseAge', () => {
	test('lists the packages of every document of a pnpm lockfile, and where they come from', () => {
		assert.deepStrictEqual(parsePnpmLockfile(pnpmLockfile), [
			npm('pnpm', '12.16.0'),
			npm('@scope/name', '2.0.0-beta.1'),
			npm('left-pad', '1.3.0'),
			npm('from-git', 'https://codeload.github.com/owner/repo/tar.gz/0123abc', { kind: 'other', description: 'tarball https://codeload.github.com/owner/repo/tar.gz/0123abc' }),
			npm('git-dep', 'git+https://github.com/owner/repo.git#0123abc', { kind: 'other', description: 'git repository https://github.com/owner/repo.git#0123abc' }),
			npm('keytar', 'file:mocks/keytar', { kind: 'local' }),
		]);
	});

	test('lists the installed packages of an npm lockfile', () => {
		const lockfile = JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root', version: '1.0.0' },
				'packages/local': { version: '1.0.0' },
				'node_modules/local': { resolved: 'packages/local', link: true },
				'node_modules/hono': { version: '4.13.18', resolved: 'https://registry.npmjs.org/hono/-/hono-4.13.18.tgz' },
				'node_modules/a/node_modules/@scope/b': { version: '1.0.0', resolved: 'https://registry.npmjs.org/@scope/b/-/b-1.0.0.tgz' },
				'node_modules/alias': { name: 'real', version: '2.0.0', resolved: 'https://registry.npmjs.org/real/-/real-2.0.0.tgz' },
				'node_modules/fork': { version: '1.0.0', resolved: 'git+ssh://git@github.com/owner/fork.git#0123abc' },
				'node_modules/mirror': { version: '1.0.0', resolved: 'https://mirror.example.com/mirror/-/mirror-1.0.0.tgz' },
				// Another tarball of the registry under a locked name and version.
				'node_modules/swap': { version: '1.0.0', resolved: 'https://registry.npmjs.org/evil/-/evil-9.9.9.tgz' },
				'node_modules/bundled': { version: '1.0.0', inBundle: true },
				'node_modules/packageMocks/keytar': { extraneous: true },
			},
		});
		// Version 1 lockfiles may give a git specifier as the version, with no resolved URL.
		const version1 = JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'left-pad': { version: '1.3.0' },
				electron: { version: 'github:owner/electron#0123abc', dependencies: { nested: { version: '2.0.0' } } },
			},
		});
		assert.deepStrictEqual(parsePackageLockfile(version1), [
			npm('left-pad', '1.3.0'),
			npm('electron', 'github:owner/electron#0123abc', { kind: 'other', description: 'the version specifier github:owner/electron#0123abc' }),
			npm('nested', '2.0.0'),
		]);
		for (const text of ['{}', '{"lockfileVersion": 3, "packages": []}', '{"lockfileVersion": 4, "packages": {}}', '{"lockfileVersion": 1, "dependencies": []}']) {
			assert.throws(() => parsePackageLockfile(text), Error, text);
		}
		assert.deepStrictEqual(parsePackageLockfile(lockfile), [
			npm('hono', '4.13.18'),
			npm('@scope/b', '1.0.0'),
			npm('real', '2.0.0'),
			npm('fork', '1.0.0', { kind: 'other', description: 'git repository git+ssh://git@github.com/owner/fork.git#0123abc' }),
			npm('mirror', '1.0.0', { kind: 'other', description: 'tarball https://mirror.example.com/mirror/-/mirror-1.0.0.tgz' }),
			npm('swap', '1.0.0', { kind: 'other', description: 'tarball https://registry.npmjs.org/evil/-/evil-9.9.9.tgz, which is not the registry tarball of swap@1.0.0' }),
		]);
	});

	test('lists the packages of a Cargo lockfile', () => {
		const lockfile = [
			'version = 4',
			'',
			'[[package]]',
			'name = "code-cli"',
			'version = "0.1.0"',
			'dependencies = [',
			' "serde",',
			']',
			'',
			'[[package]]',
			'name = "serde"',
			'version = "1.0.228"',
			'source = "registry+https://github.com/rust-lang/crates.io-index"',
			'checksum = "abc"',
			'',
			'[[package]]',
			'name = "tunnels"',
			'version = "0.1.0"',
			'source = "git+https://github.com/microsoft/dev-tunnels?rev=0123abc#0123abc"',
			'',
			'[metadata]',
			'name = "ignored"',
			'version = "1.0.0"',
		].join('\n');
		assert.deepStrictEqual(parseCargoLockfile(lockfile), [
			{ ecosystem: 'crates', name: 'code-cli', version: '0.1.0', source: { kind: 'local' } },
			{ ecosystem: 'crates', name: 'serde', version: '1.0.228', source: { kind: 'registry' } },
			{ ecosystem: 'crates', name: 'tunnels', version: '0.1.0', source: { kind: 'allowed', description: 'git repository https://github.com/microsoft/dev-tunnels?rev=0123abc#0123abc' } },
		]);
	});

	test('rejects lockfiles with merge conflict markers', () => {
		assert.throws(() => parsePnpmLockfile('packages:\n<<<<<<< HEAD\n  a@1.0.0:\n=======\n  a@2.0.0:\n>>>>>>> main\n'), /merge conflict markers/);
		assert.throws(() => parsePackageLockfile('{\n<<<<<<< HEAD\n}'), /merge conflict markers/);
	});

	test('reads every YAML form of a pnpm resolution, and fails on lockfiles and resolutions that it cannot read', () => {
		const lockfile = (...lines: string[]) => [`lockfileVersion: '9.0'`, '', 'packages:', '', '  a@1.0.0:', ...lines, ''].join('\n');
		const tarball = npm('a', '1.0.0', { kind: 'other', description: 'tarball https://example.com/a.tgz' });
		assert.deepStrictEqual([
			parsePnpmLockfile(lockfile('    resolution: {integrity: sha512-x==}')),
			// A block-style resolution, and an inline one with a comment.
			parsePnpmLockfile(lockfile('    resolution:', '      tarball: https://example.com/a.tgz')),
			parsePnpmLockfile(lockfile('    resolution: {tarball: https://example.com/a.tgz} # comment')),
			parsePnpmLockfile(`lockfileVersion: '9.0'\npackages: {}\n`),
			parsePnpmLockfile(lockfile('    resolution: {integrity: sha512-x==, tarball: https://registry.npmjs.org/a/-/a-1.0.0.tgz}')),
			parsePnpmLockfile(lockfile('    resolution: {integrity: sha512-x==, tarball: https://registry.npmjs.org/evil/-/evil-9.9.9.tgz}')),
		], [[npm('a', '1.0.0')], [tarball], [tarball], [], [npm('a', '1.0.0')], [npm('a', '1.0.0', { kind: 'other', description: 'tarball https://registry.npmjs.org/evil/-/evil-9.9.9.tgz, which is not the registry tarball of a@1.0.0' })]]);
		for (const text of [
			// A field that pnpm doesn't write, a nested value, and no resolution at all.
			lockfile('    resolution: {integrity: sha512-x==, url: https://example.com/a.tgz}'),
			lockfile('    resolution: {tarball: {url: https://example.com/a.tgz}}'),
			lockfile('    engines: {node: \'>=18\'}'),
			// Malformed YAML, packages that are not a mapping, and no lockfileVersion.
			`lockfileVersion: '9.0'\npackages: [\n`,
			`lockfileVersion: '9.0'\npackages: [a@1.0.0]\n`,
			'packages:\n\n  a@1.0.0:\n    resolution: {integrity: sha512-x==}\n',
		]) {
			assert.throws(() => parsePnpmLockfile(text), Error, text);
		}
	});
	test('reads only the layout that Cargo writes, and fails on any other Cargo lockfile syntax', () => {
		const cargoPackage = (...fields: string[]) => ['version = 4', '', '[[package]]', ...fields, ''].join('\n');
		assert.deepStrictEqual(parseCargoLockfile(cargoPackage('name = "a"', 'version = "1.0.0"', 'source = "git+https://github.com/owner/a#0123abc"', 'dependencies = [ "b",]')), [
			{ ecosystem: 'crates', name: 'a', version: '1.0.0', source: { kind: 'other', description: 'git repository https://github.com/owner/a#0123abc' } },
		]);
		for (const text of [
			// Quoted and escaped keys, which TOML reads as source.
			cargoPackage('name = "serde"', 'version = "1.0.228"', '"source" = "git+https://github.com/owner/serde"'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', '"\\u0073ource" = "git+https://github.com/owner/serde"'),
			// Literal strings, escapes, comments and multi-line strings.
			cargoPackage(`name = 'serde'`, 'version = "1.0.228"'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'source = "git+https://github.com/owner/serde\\u0023"'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'source = "registry+https://github.com/rust-lang/crates.io-index" # comment'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'source = """git+https://github.com/owner/serde"""'),
			// An unterminated string or array, a missing version, a duplicate key, and packages written another way.
			cargoPackage('name = "serde"', 'version = "1.0.228'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'dependencies = [', ' "b",'),
			cargoPackage('name = "serde"'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'source = "a"', 'source = "b"'),
			'version = 4\n\npackage = [{ name = "serde", version = "1.0.228" }]\n',
			'version = 4\n\n[package]\nname = "serde"\nversion = "1.0.228"\n',
			// Other tables must be readable too.
			cargoPackage('name = "serde"', 'version = "1.0.228"', '', '[metadata]', 'broken = "'),
			// Unbalanced table headers, and a key twice in a table.
			cargoPackage('name = "serde"', 'version = "1.0.228"', '', '[metadata]]'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', '', '[[patch.unused]'),
			cargoPackage('name = "serde"', 'version = "1.0.228"', 'dependencies = []', 'dependencies = [', ' "a",', ']'),
		]) {
			assert.throws(() => parseCargoLockfile(text), Error, text);
		}
	});

	test('allows any revision of the allowed Cargo git repositories, and no look-alike or other git repository', async () => {
		const sources = [
			'git+https://github.com/microsoft/vscode-russh?branch=main#fd4f608a83753f9f3e137f95600faffede71cf65',
			'git+https://github.com/microsoft/dev-tunnels?rev=0123abc#0123abc',
			'git+https://github.com/microsoft/vscode-russh-evil?branch=main#0123abc',
			'git+https://github.com/microsoft/vscode-russh/evil?branch=main#0123abc',
			'git+https://github.com.example.com/microsoft/vscode-russh?branch=main#0123abc',
			'git+https://user@github.com/microsoft/vscode-russh?branch=main#0123abc',
			'git+https://github.com/someone/vscode-russh?branch=main#0123abc',
			'git+http://github.com/microsoft/vscode-russh?branch=main#0123abc',
		];
		assert.deepStrictEqual(sources.map(source => cargoSource(source).kind), ['allowed', 'allowed', 'other', 'other', 'other', 'other', 'other', 'other']);

		// A bump of an allowed repository needs neither a crates.io release nor a lookup.
		const registry = fakeRegistry({});
		const violations = await checkChanges([{
			lockfile: 'cli/Cargo.lock',
			policy: { ...policy, exclude: [] },
			added: sources.slice(0, 3).map((source, index) => ({ ecosystem: 'crates', name: `crate${index}`, version: '0.1.0', source: cargoSource(source) })),
		}], new Set(), registry, now);
		assert.deepStrictEqual(violations.map(violation => violation.name), ['crate2']);
		assert.deepStrictEqual(registry.lookups, []);
	});
	test('reads the release-age policy of the pnpm-workspace.yaml files of the repository', () => {
		assert.deepStrictEqual(parseReleaseAgePolicy('packages:\n  - a\nminimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - \'@vscode/*\'\n  # comment\n  - electron # comment\nnodeLinker: isolated\n', 'pnpm-workspace.yaml'), policy);
		assert.deepStrictEqual(parseReleaseAgePolicy('minimumReleaseAge: 1440\nminimumReleaseAgeExclude: []\nminimumReleaseAgeStrict: true\n', 'a.yaml'), { minimumReleaseAge: 1440, exclude: [], file: 'a.yaml' });
		// YAML reads a quoted key and a flow list the same.
		assert.deepStrictEqual(parseReleaseAgePolicy('"minimumReleaseAge": 10080\nminimumReleaseAgeExclude: [electron, \'@vscode/*\']\n', 'pnpm-workspace.yaml'), { ...policy, exclude: ['electron', '@vscode/*'] });
		// A policy that the check cannot read fails it, instead of reading as no policy.
		for (const text of [
			'minimumReleaseAge: 7d\n',
			'minimumReleaseAge: [10080]\n',
			'minimumReleaseAge: 10000000000000000\n',
			'minimumReleaseAge: 10080\nminimumReleaseAgeExclude: [true, 123]\n',
			'minimumReleaseAge: 10080\nminimumReleaseAgeExclude: electron\n',
			'minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - {electron: true}\n',
			'minimumReleaseAge: 10080\nminimumReleaseAgeExclude: [\n',
		]) {
			assert.throws(() => parseReleaseAgePolicy(text, 'pnpm-workspace.yaml'), Error, text);
		}
		// The policy that the check enforces must keep parsing as the files change.
		for (const file of ['pnpm-workspace.yaml', 'build/pnpm-workspace.yaml', 'remote/pnpm-workspace.yaml']) {
			const parsed = parseReleaseAgePolicy(fs.readFileSync(path.join(repositoryRoot, file), 'utf8'), file);
			assert.strictEqual(parsed.minimumReleaseAge, 10080, file);
			assert.ok(parsed.exclude.includes('@vscode/*'), file);
		}
	});

	test('fails on registry settings that route packages away from registry.npmjs.org', () => {
		assert.deepStrictEqual({
			npmrc: registryConfigurationProblems('a/.npmrc', 'registry=https://registry.npmjs.org/\n@vscode:registry = "https://registry.npmjs.org"\n//registry.npmjs.org/:_authToken=x\n@corp:registry=https://mirror.example.com/\n'),
			workspace: registryConfigurationProblems('pnpm-workspace.yaml', 'minimumReleaseAge: 10080\nregistries:\n  default: https://mirror.example.com/\n'),
			plain: registryConfigurationProblems('pnpm-workspace.yaml', 'minimumReleaseAge: 10080\n'),
			// INI drops inline comments from unquoted values, and a backslash escapes them.
			comments: registryConfigurationProblems('.npmrc', 'registry=https://registry.npmjs.org/ # official\n@a:registry=https://registry.npmjs.org/;x\n@b:registry=https://mirror.example.com/\\#x\n'),
			// INI decodes quoted keys, so these set the registry too, and a section or an unreadable line fails.
			quoted: registryConfigurationProblems('.npmrc', '"registry"=https://mirror.example.com/\n"\\u0072egistry" = https://mirror.example.com/\n[section]\n'),
			// Cargo source replacement and patches, but not the target settings of the repository.
			cargo: [
				registryConfigurationProblems('cli/.cargo/config.toml', fs.readFileSync(path.join(repositoryRoot, 'cli/.cargo/config.toml'), 'utf8')),
				registryConfigurationProblems('.cargo/config.toml', '[source.crates-io]\nreplace-with = "mirror"\n'),
				registryConfigurationProblems('.cargo/config', '[patch.crates-io]\nserde = { git = "https://github.com/owner/serde" }\n'),
				registryConfigurationProblems('.cargo/config.toml', '["\\u0073ource".crates-io]\n'),
			].map(problems => problems.length),
		}, {
			npmrc: ['a/.npmrc sets @corp:registry to https://mirror.example.com/. Dependencies must come from registry.npmjs.org.'],
			workspace: ['pnpm-workspace.yaml sets registries, which routes packages to registries that this check doesn\'t read. Dependencies must come from registry.npmjs.org.'],
			plain: [],
			comments: ['.npmrc sets @b:registry to https://mirror.example.com/\\#x. Dependencies must come from registry.npmjs.org.'],
			quoted: [
				'.npmrc sets registry to https://mirror.example.com/. Dependencies must come from registry.npmjs.org.',
				'.npmrc sets registry to https://mirror.example.com/. Dependencies must come from registry.npmjs.org.',
				'.npmrc has a line that this check can\'t read: [section]',
			],
			cargo: [0, 1, 1, 1],
		});
	});

	test('matches minimumReleaseAgeExclude as pnpm does', () => {
		const exclude = ['@vscode/*', 'playwright*', 'electron', 'nx@21.6.5', 'webpack@4.47.0 || 5.102.1'];
		assert.deepStrictEqual([
			isExcluded('@vscode/vsce', '1.0.0', exclude),
			isExcluded('@vscodex/vsce', '1.0.0', exclude),
			isExcluded('playwright-core', '1.0.0', exclude),
			isExcluded('electron', '39.0.0', exclude),
			isExcluded('electron-to-chromium', '1.0.0', exclude),
			isExcluded('nx', '21.6.5', exclude),
			isExcluded('nx', '21.6.6', exclude),
			isExcluded('webpack', '5.102.1', exclude),
			isExcluded('webpack', '5.102.2', exclude),
		], [true, false, true, true, false, true, false, true, false]);
	});

	test('a version that the exclusions of both the base and the head exempt stays exempt', async () => {
		const narrowed = stricterPolicy({ ...policy, exclude: ['@vscode/*'] }, { ...policy, exclude: ['@vscode/vsce@1.0.0', '*'] });
		const registry = fakeRegistry({
			'@vscode/vsce@1.0.0': { kind: 'published', publishedAt: daysAgo(1) },
			'@vscode/other@1.0.0': { kind: 'published', publishedAt: daysAgo(1) },
			'left-pad@1.0.0': { kind: 'published', publishedAt: daysAgo(1) },
		});
		const violations = await checkChanges([{ lockfile: 'pnpm-lock.yaml', policy: narrowed, added: [npm('@vscode/vsce', '1.0.0'), npm('@vscode/other', '1.0.0'), npm('left-pad', '1.0.0')] }], new Set(), registry, now);
		// The head's '*' exempts left-pad, but the base's exclusions don't.
		assert.deepStrictEqual(violations.map(violation => violation.name), ['left-pad']);
	});

	test('only the packages that a lockfile did not have from the same source count as added', () => {
		assert.deepStrictEqual(addedPackages(
			[npm('a', '1.0.0'), npm('b', '1.0.0')],
			[npm('a', '1.0.0'), npm('b', '1.0.0', { kind: 'other', description: 'tarball https://example.com/b.tgz' }), npm('c', '1.0.0'), npm('c', '1.0.0')],
		), [npm('b', '1.0.0', { kind: 'other', description: 'tarball https://example.com/b.tgz' }), npm('c', '1.0.0')]);
	});

	test('reports added versions that are too new, missing or from other sources, with the date they become allowed', async () => {
		const registry = fakeRegistry({
			'fresh@1.0.0': { kind: 'published', publishedAt: new Date('2026-11-20T08:30:00Z') },
			'mature@1.0.0': { kind: 'published', publishedAt: daysAgo(8) },
			'@vscode/fresh@1.0.0': { kind: 'published', publishedAt: daysAgo(1) },
			'serde@1.0.229': { kind: 'published', publishedAt: daysAgo(2) },
		});
		const violations = await checkChanges([
			{
				lockfile: 'pnpm-lock.yaml',
				policy,
				added: [
					npm('fresh', '1.0.0'),
					npm('mature', '1.0.0'),
					npm('@vscode/fresh', '1.0.0'),
					npm('missing', '1.0.0'),
					npm('locked-on-main', '1.0.0'),
					npm('fork', '1.0.0', { kind: 'other', description: 'git repository https://github.com/owner/fork.git' }),
					npm('mock', 'file:mock', { kind: 'local' }),
				],
			},
			{ lockfile: 'cli/Cargo.lock', policy: { ...policy, exclude: [] }, added: [{ ecosystem: 'crates', name: 'serde', version: '1.0.229', source: { kind: 'registry' } }] },
		], new Set(['npm:locked-on-main@1.0.0']), registry, now);

		assert.deepStrictEqual(violations, [
			{ lockfile: 'cli/Cargo.lock', name: 'serde', version: '1.0.229', message: `serde@1.0.229 was published on ${daysAgo(2).toISOString()}. The minimumReleaseAge of pnpm-workspace.yaml (7 days) allows it from ${new Date(daysAgo(2).getTime() + 7 * 86_400_000).toISOString()}.` },
			{ lockfile: 'pnpm-lock.yaml', name: 'fork', version: '1.0.0', message: 'fork@1.0.0 comes from git repository https://github.com/owner/fork.git. Dependencies must come from registry.npmjs.org.' },
			{ lockfile: 'pnpm-lock.yaml', name: 'fresh', version: '1.0.0', message: 'fresh@1.0.0 was published on 2026-11-20T08:30:00.000Z. The minimumReleaseAge of pnpm-workspace.yaml (7 days) allows it from 2026-11-27T08:30:00.000Z.' },
			{ lockfile: 'pnpm-lock.yaml', name: 'missing', version: '1.0.0', message: 'missing@1.0.0 is not published on registry.npmjs.org.' },
		]);
		// A publish date that gives no valid date of eligibility fails too.
		assert.deepStrictEqual((await checkChanges([{ lockfile: 'pnpm-lock.yaml', policy, added: [npm('undated', '1.0.0')] }], new Set(), fakeRegistry({ 'undated@1.0.0': { kind: 'published', publishedAt: new Date(Number.NaN) } }), now)).map(violation => violation.message), [
			'undated@1.0.0 has no valid date from which the minimumReleaseAge of pnpm-workspace.yaml allows it.',
		]);
		// Excluded versions, versions that main already locks and local packages need no lookup.
		assert.deepStrictEqual(registry.lookups.sort(), ['crates:serde@1.0.229', 'npm:fresh@1.0.0', 'npm:mature@1.0.0', 'npm:missing@1.0.0']);
	});

	test('reads publish dates from the public registries, and retries failed requests', async () => {
		const requests: string[] = [];
		const responses: Record<string, { status: number; body?: unknown }[]> = {
			'https://registry.npmjs.org/@scope%2Fname': [
				{ status: 503 },
				{ status: 200, body: { versions: { '1.0.0': {} }, time: { created: '2020-01-01T00:00:00Z', '1.0.0': '2026-11-01T00:00:00Z', '0.9.0': '2026-10-01T00:00:00Z' } } },
			],
			'https://registry.npmjs.org/missing': [{ status: 404 }],
			'https://crates.io/api/v1/crates/serde/1.0.228': [{ status: 200, body: { version: { created_at: '2026-09-01T00:00:00Z' } } }],
			'https://registry.npmjs.org/down': [{ status: 500 }, { status: 500 }],
		};
		const registry = createPublicRegistry(async url => {
			requests.push(url);
			const response = responses[url]?.shift();
			if (!response) {
				throw new Error(`unexpected request ${url}`);
			}
			return { status: response.status, body: response.body };
		}, [0]);

		assert.deepStrictEqual(await Promise.all([
			registry.release('npm', '@scope/name', '1.0.0'),
			// The packument of a package is downloaded once.
			registry.release('npm', '@scope/name', '0.9.0'),
			registry.release('npm', 'missing', '1.0.0'),
			registry.release('crates', 'serde', '1.0.228'),
		]), [
			{ kind: 'published', publishedAt: new Date('2026-11-01T00:00:00Z') },
			// Unpublished: the packument dates it, but lists no such version.
			{ kind: 'notFound' },
			{ kind: 'notFound' },
			{ kind: 'published', publishedAt: new Date('2026-09-01T00:00:00Z') },
		]);
		await assert.rejects(registry.release('npm', 'down', '1.0.0'), /GET https:\/\/registry\.npmjs\.org\/down failed: HTTP 500/);
		assert.strictEqual(requests.filter(url => url.endsWith('@scope%2Fname')).length, 2);
	});

	test('keeps to one crates.io request per second, retries included', async () => {
		const starts: number[] = [];
		let first = true;
		const registry = createPublicRegistry(async () => {
			starts.push(Date.now());
			if (first) {
				first = false;
				return { status: 500, body: undefined };
			}
			return { status: 200, body: { version: { created_at: '2026-09-01T00:00:00Z' } } };
		}, [0]);
		await Promise.all([registry.release('crates', 'a', '1.0.0'), registry.release('crates', 'b', '1.0.0')]);
		assert.strictEqual(starts.length, 3);
		assert.ok(starts.slice(1).every((start, index) => start - starts[index] >= 990), JSON.stringify(starts));
	});

	test('reads the pnpm version of the packageManager field', () => {
		assert.deepStrictEqual(packageManagerPackage('{"packageManager": "pnpm@12.16.0+sha512.abc"}'), npm('pnpm', '12.16.0'));
		assert.strictEqual(packageManagerPackage('{"name": "a"}'), undefined);
	});

	test('checks the lockfiles that differ between two commits', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-release-age-test-'));
		try {
			const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();
			const write = (file: string, content: string) => {
				fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
				fs.writeFileSync(path.join(dir, file), content);
			};
			const lockfile = (...keys: string[]) => `lockfileVersion: '9.0'\n\npackages:\n\n${keys.map(key => `  ${key}:\n    resolution: {integrity: sha512-x==}\n`).join('\n')}`;
			git('init', '--quiet');
			write('package.json', '{"packageManager": "pnpm@12.16.0"}');
			write('pnpm-workspace.yaml', 'minimumReleaseAge: 10080\n');
			write('pnpm-lock.yaml', lockfile('a@1.0.0', 'shared@1.0.0'));
			write('build/pnpm-workspace.yaml', 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - excluded\n');
			write('build/pnpm-lock.yaml', lockfile('b@1.0.0'));
			const crate = (source: string) => `version = 4\n\n[[package]]\nname = "foo"\nversion = "1.0.0"\nsource = "${source}"\n`;
			write('cli/Cargo.lock', crate('git+https://github.com/owner/foo#0123abc'));
			git('add', '.');
			git('commit', '--quiet', '-m', 'base');
			const base = git('rev-parse', 'HEAD');

			write('package.json', '{"packageManager": "pnpm@12.17.0"}');
			write('pnpm-lock.yaml', lockfile('a@1.0.0', 'a@2.0.0', 'shared@1.0.0'));
			write('build/pnpm-lock.yaml', lockfile('b@1.0.0', 'b@2.0.0', 'excluded@1.0.0', 'shared@1.0.0'));
			// A lockfile in a folder whose name git quotes, unless it lists paths NUL-separated.
			write('café/pnpm-lock.yaml', lockfile('c@1.0.0'));
			// The same crate version from crates.io is a different package than the git one that the base locks.
			write('cli/Cargo.lock', crate('registry+https://github.com/rust-lang/crates.io-index'));
			// A change can't relax the policy that checks it.
			write('pnpm-workspace.yaml', 'minimumReleaseAge: 0\nminimumReleaseAgeExclude:\n  - \'*\'\n');
			git('add', '.');
			git('commit', '--quiet', '-m', 'head');

			const registry = fakeRegistry({
				'a@2.0.0': { kind: 'published', publishedAt: daysAgo(2) },
				'b@2.0.0': { kind: 'published', publishedAt: daysAgo(2) },
				'c@1.0.0': { kind: 'published', publishedAt: daysAgo(2) },
				'foo@1.0.0': { kind: 'published', publishedAt: daysAgo(2) },
				'pnpm@12.17.0': { kind: 'published', publishedAt: daysAgo(10) },
			});
			const result = await checkRevisions(base, 'HEAD', registry, now, dir);
			assert.deepStrictEqual({
				lockfiles: result.lockfiles,
				checked: result.checked,
				violations: result.violations.map(violation => `${violation.lockfile}: ${violation.name}@${violation.version}`),
				errors: result.errors,
				notices: result.notices,
				lookups: registry.lookups.sort(),
			}, {
				lockfiles: ['build/pnpm-lock.yaml', 'café/pnpm-lock.yaml', 'cli/Cargo.lock', 'pnpm-lock.yaml', 'package.json'],
				checked: 7,
				// build/ allows b@2.0.0 after a day, and the root lockfile already locks shared@1.0.0.
				violations: ['café/pnpm-lock.yaml: c@1.0.0', 'cli/Cargo.lock: foo@1.0.0', 'pnpm-lock.yaml: a@2.0.0'],
				errors: [],
				notices: ['pnpm-workspace.yaml changes the release-age policy. This check applies the stricter of the policies of the base and of this change.'],
				lookups: ['crates:foo@1.0.0', 'npm:a@2.0.0', 'npm:b@2.0.0', 'npm:c@1.0.0', 'npm:pnpm@12.17.0'],
			});

			// A change to only the policy fails when the check can't read it.
			git('checkout', '--quiet', '-b', 'policy', base);
			write('pnpm-workspace.yaml', 'minimumReleaseAge: 7d\n');
			git('commit', '--quiet', '-am', 'policy');
			assert.deepStrictEqual((await checkRevisions(base, 'HEAD', fakeRegistry({}), now, dir)).errors.map(error => error.split(':')[0]), ['pnpm-workspace.yaml']);

			// So does a registry setting, even when no lockfile changes, as it applies to the locked packages.
			git('checkout', '--quiet', '-b', 'routing', base);
			write('.npmrc', 'registry=https://mirror.example.com/\n');
			git('add', '.');
			git('commit', '--quiet', '-m', 'routing');
			assert.deepStrictEqual((await checkRevisions(base, 'HEAD', fakeRegistry({}), now, dir)).problems, ['.npmrc sets registry to https://mirror.example.com/. Dependencies must come from registry.npmjs.org.']);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
