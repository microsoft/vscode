/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as jsonc from 'jsonc-parser';
import 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { openTsConfigLink, TsConfigLinkOutcome, TsConfigLinkOutcomeHandler, TsconfigLinkProvider } from '../../languageFeatures/tsconfig';
import { arrayWildcard, collectLinkCandidates, selectNonGlobPrefix, selectNonUriValue, selectStringNodes, selectWholeValue, TsConfigLinkKind } from '../../languageFeatures/tsconfig/links';
import { readLibMapFromInstall } from '../../languageFeatures/tsconfig/libMap.electron';
import { createLinkDescriptors, libFileUri, TsConfigLinkDescriptors, TsConfigLinkResolver, typesPackageName } from '../../languageFeatures/tsconfig/resolvers';
import { API } from '../../tsServer/api';
import { ITypeScriptVersionProvider, TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { looksLikeAbsolutePath, looksLikeRelativePath } from '../../utils/fs';

/** The TypeScript this extension ships with, which is the only install a test can rely on. */
function bundledTsServerPath(): string {
	const extension = vscode.extensions.getExtension('vscode.typescript-language-features');
	assert.ok(extension, 'Expected the extension to be present');
	return path.join(extension.extensionPath, '..', 'node_modules', 'typescript', 'lib', 'tsserver.js');
}

/** A version an install can be read from, which is what the lib resolver looks things up in. */
function validVersion(source: TypeScriptVersionSource, versionPath: string): TypeScriptVersion {
	return new TypeScriptVersion(source, versionPath, API.fromSimpleString('5.0.0'));
}

const emptyMemento: vscode.Memento = { keys: () => [], get: <T>(_key: string, defaultValue?: T) => defaultValue, update: async () => { } };

function parse(text: string): jsonc.Node {
	const root = jsonc.parseTree(text);
	assert.ok(root, 'Expected the fixture to parse');
	return root;
}

function values(text: string, path: readonly (string | typeof arrayWildcard)[]): string[] {
	return selectStringNodes(parse(text), path).map(node => node.value);
}

suite('tsconfig links: selectStringNodes', () => {
	test('resolves object, array wildcard and nested object paths', () => {
		const text = JSON.stringify({
			extends: './base.json',
			files: ['a.ts', 'b.ts'],
			references: [{ path: '../one' }, { path: '../two' }, {}],
			compilerOptions: { lib: ['DOM', 'ES2020'] },
		});

		assert.deepStrictEqual({
			extendsSingle: values(text, ['extends']),
			extendsArray: values(text, ['extends', arrayWildcard]),
			files: values(text, ['files', arrayWildcard]),
			references: values(text, ['references', arrayWildcard, 'path']),
			lib: values(text, ['compilerOptions', 'lib', arrayWildcard]),
			missing: values(text, ['compilerOptions', 'outDir']),
		}, {
			extendsSingle: ['./base.json'],
			extendsArray: [],
			files: ['a.ts', 'b.ts'],
			references: ['../one', '../two'],
			lib: ['DOM', 'ES2020'],
			missing: [],
		});
	});

	test('keeps only non-empty string nodes', () => {
		const text = JSON.stringify({
			extends: ['./a.json', 42, '', null, './b.json'],
			files: 'not-an-array',
		});

		assert.deepStrictEqual({
			extendsArray: values(text, ['extends', arrayWildcard]),
			extendsSingle: values(text, ['extends']),
			files: values(text, ['files', arrayWildcard]),
		}, {
			extendsArray: ['./a.json', './b.json'],
			extendsSingle: [],
			files: [],
		});
	});
});

suite('tsconfig links: selection', () => {
	test('selectWholeValue rejects globs', () => {
		assert.deepStrictEqual({
			plain: selectWholeValue('out'),
			nested: selectWholeValue('./src/main.ts'),
			star: selectWholeValue('src/*.ts'),
			question: selectWholeValue('src/a?.ts'),
		}, {
			plain: { offset: 0, length: 3 },
			nested: { offset: 0, length: 13 },
			star: undefined,
			question: undefined,
		});
	});

	test('selectNonGlobPrefix keeps the literal leading segments', () => {
		assert.deepStrictEqual({
			noGlob: selectNonGlobPrefix('out'),
			trailing: selectNonGlobPrefix('src/**/*'),
			deep: selectNonGlobPrefix('packages/core/**/*.ts'),
			leadingGlob: selectNonGlobPrefix('**/*.ts'),
			rootedGlob: selectNonGlobPrefix('/*.ts'),
			ownDirectory: selectNonGlobPrefix('./*.ts'),
			ownDirectoryChild: selectNonGlobPrefix('./src/*.ts'),
			// TypeScript normalizes separators before matching, so both are separators here.
			backslash: selectNonGlobPrefix('src\\**\\*'),
			backslashOwnDirectory: selectNonGlobPrefix('.\\*.ts'),
			mixed: selectNonGlobPrefix('src/lib\\**'),
		}, {
			noGlob: { offset: 0, length: 3 },
			trailing: { offset: 0, length: 3 },
			deep: { offset: 0, length: 13 },
			leadingGlob: undefined,
			rootedGlob: undefined,
			ownDirectory: undefined,
			ownDirectoryChild: { offset: 0, length: 5 },
			backslash: { offset: 0, length: 3 },
			backslashOwnDirectory: undefined,
			mixed: { offset: 0, length: 7 },
		});
	});

	test('selectNonUriValue rejects schemes but keeps Windows drives', () => {
		assert.deepStrictEqual({
			relative: selectNonUriValue('./maps'),
			windows: selectNonUriValue('C:\\maps'),
			http: selectNonUriValue('https://example.com/maps'),
			custom: selectNonUriValue('vscode-file://host/maps'),
		}, {
			relative: { offset: 0, length: 6 },
			windows: { offset: 0, length: 7 },
			http: undefined,
			custom: undefined,
		});
	});
});

suite('tsconfig links: collectLinkCandidates', () => {
	function collect(text: string): { kind: string; linked: string }[] {
		return collectLinkCandidates(parse(text), text)
			.map(candidate => ({ kind: candidate.kind, linked: text.slice(candidate.startOffset, candidate.endOffset) }));
	}

	test('links every supported field', () => {
		const text = JSON.stringify({
			extends: './base.json',
			files: ['a.ts'],
			include: ['src/**/*'],
			exclude: ['**/*.spec.ts'],
			references: [{ path: '../other' }],
			compilerOptions: {
				lib: ['DOM'],
				types: ['node'],
				typeRoots: ['./typings'],
				rootDir: './src',
				rootDirs: ['./generated'],
				baseUrl: '.',
				outDir: './out',
				declarationDir: './types',
				outFile: './bundle.js',
				tsBuildInfoFile: './.tsbuildinfo',
				mapRoot: './maps',
				sourceRoot: 'https://example.com/src',
			},
		});

		assert.deepStrictEqual(collect(text), [
			{ kind: 'extends', linked: './base.json' },
			{ kind: 'reference', linked: '../other' },
			{ kind: 'projectFile', linked: 'a.ts' },
			{ kind: 'path', linked: 'src' },
			{ kind: 'lib', linked: 'DOM' },
			{ kind: 'typePackage', linked: 'node' },
			{ kind: 'path', linked: './typings' },
			{ kind: 'path', linked: './src' },
			{ kind: 'path', linked: './generated' },
			{ kind: 'path', linked: '.' },
			{ kind: 'buildOutput', linked: './out' },
			{ kind: 'buildOutput', linked: './types' },
			{ kind: 'buildOutput', linked: './bundle.js' },
			{ kind: 'buildOutput', linked: './.tsbuildinfo' },
			{ kind: 'buildOutput', linked: './maps' },
		]);
	});

	test('links both forms of extends', () => {
		assert.deepStrictEqual(
			collect(JSON.stringify({ extends: ['./a.json', './b.json'] })),
			[
				{ kind: 'extends', linked: './a.json' },
				{ kind: 'extends', linked: './b.json' },
			]);
	});

	test('narrows the candidate value to match a glob-prefix selection', () => {
		const text = JSON.stringify({ include: ['src/**/*'] });

		assert.deepStrictEqual(
			collectLinkCandidates(parse(text), text).map(candidate => candidate.value),
			['src']);
	});

	test('keeps a whole-value candidate value unchanged', () => {
		const text = JSON.stringify({ extends: './base.json' });

		assert.deepStrictEqual(
			collectLinkCandidates(parse(text), text).map(candidate => candidate.value),
			['./base.json']);
	});

	test('ranges a link over the source text an escaped value was decoded from', () => {
		const escapedWhole = '{ "extends": "./a\\u0062.json" }';

		assert.deepStrictEqual({
			whole: collect(escapedWhole),
			// A Windows-authored pattern: every separator is an escape in the source.
			narrowed: collect('{ "include": ["src\\\\**\\\\*"] }'),
			narrowedAfterEscape: collect('{ "include": ["s\\u0072c/**/*"] }'),
			// The range covers the raw source, but the value the resolver sees is decoded.
			wholeValue: collectLinkCandidates(parse(escapedWhole), escapedWhole).map(candidate => candidate.value),
		}, {
			whole: [{ kind: 'extends', linked: './a\\u0062.json' }],
			narrowed: [{ kind: 'path', linked: 'src' }],
			narrowedAfterEscape: [{ kind: 'path', linked: 's\\u0072c' }],
			wholeValue: ['./ab.json'],
		});
	});

	test('ranges a link over a string the closing quote of which has not been typed yet', () => {
		assert.deepStrictEqual(
			collect('{ "extends": "./base.json'),
			[{ kind: 'extends', linked: './base.json' }]);
	});
});

suite('tsconfig links: resolver helpers', () => {
	test('libFileUri places the lib beside the server entry point', () => {
		assert.deepStrictEqual({
			browser: libFileUri('https://example.com/ts/lib/tsserver.js', 'lib.dom.d.ts').toString(),
			desktop: libFileUri('/usr/local/ts/lib/tsserver.js', 'lib.dom.d.ts').toString(),
			// A drive letter also reads as a URI scheme, so only the scheme is stable across
			// platforms here. Parsing rather than carving it out would yield a scheme of `c`.
			windowsDriveScheme: libFileUri('C:\\ts\\lib\\tsserver.js', 'lib.dom.d.ts').scheme,
		}, {
			browser: 'https://example.com/ts/lib/lib.dom.d.ts',
			desktop: 'file:///usr/local/ts/lib/lib.dom.d.ts',
			windowsDriveScheme: 'file',
		});
	});

	test('typesPackageName mangles a scoped package', () => {
		assert.deepStrictEqual({
			plain: typesPackageName('node'),
			scoped: typesPackageName('@foo/bar'),
			scopedSubPath: typesPackageName('@foo/bar/baz'),
		}, {
			plain: '@types/node',
			scoped: '@types/foo__bar',
			scopedSubPath: '@types/foo__bar/baz',
		});
	});

	test('tells paths apart from package names the way the compiler does, on every platform', () => {
		const values = ['./typings', '../typings', '.', '..', '.\\typings', '/typings', '\\\\server\\typings', 'C:\\typings', 'c:/typings', '.hidden', 'node', '@foo/bar'];

		assert.deepStrictEqual(
			Object.fromEntries(values.map(value => [value, looksLikeRelativePath(value) ? 'relative' : looksLikeAbsolutePath(value) ? 'absolute' : 'package'])),
			{
				'./typings': 'relative',
				'../typings': 'relative',
				'.': 'relative',
				'..': 'relative',
				'.\\typings': 'relative',
				'/typings': 'absolute',
				'\\\\server\\typings': 'absolute',
				'C:\\typings': 'absolute',
				'c:/typings': 'absolute',
				'.hidden': 'package',
				'node': 'package',
				'@foo/bar': 'package',
			});
	});

	test('reads the bundled version once per lib lookup, since reading it shows a toast when it is missing', async () => {
		const reads = { defaultVersion: 0, bundledVersion: 0 };
		const provider: ITypeScriptVersionProvider = {
			updateConfiguration() { },
			get defaultVersion(): TypeScriptVersion {
				reads.defaultVersion++;
				return this.bundledVersion;
			},
			globalVersion: undefined,
			localVersion: undefined,
			localVersions: [validVersion(TypeScriptVersionSource.NodeModules, '/missing/node_modules/typescript/lib/tsserver.js')],
			get bundledVersion(): TypeScriptVersion {
				reads.bundledVersion++;
				throw new Error('Could not find bundled tsserver.js');
			},
		};
		const { resolve } = createLinkDescriptors(provider, emptyMemento, async () => new Map([['dom', 'lib.dom.d.ts']]))[TsConfigLinkKind.Lib];

		const target = await resolve(vscode.Uri.file('/workspace/tsconfig.json'), 'dom');

		assert.deepStrictEqual({ target, reads }, { target: undefined, reads: { defaultVersion: 1, bundledVersion: 1 } });
	});

	test('resolves a lib entry through the install, reading its lib map only for a name no file carries', async () => {
		const version = validVersion(TypeScriptVersionSource.Bundled, bundledTsServerPath());
		const provider: ITypeScriptVersionProvider = {
			updateConfiguration() { },
			defaultVersion: version,
			globalVersion: undefined,
			localVersion: undefined,
			localVersions: [],
			bundledVersion: version,
		};
		let mapReads = 0;
		const readLibMap = async () => {
			mapReads++;
			return new Map([['es7', 'lib.es2016.d.ts']]);
		};
		const { resolve } = createLinkDescriptors(provider, emptyMemento, readLibMap)[TsConfigLinkKind.Lib];
		const tsconfig = vscode.Uri.file('/workspace/tsconfig.json');

		assert.deepStrictEqual({
			// `lib.dom.d.ts` sits beside the server, so the name needs no map.
			named: (await resolve(tsconfig, 'DOM'))?.toString(),
			readsAfterNamed: mapReads,
			alias: (await resolve(tsconfig, 'ES7'))?.toString(),
			// Neither a file beside the server nor an entry of the map.
			unknown: await resolve(tsconfig, 'NOPE'),
			// `lib.<value>.d.ts` would land on `typescript.d.ts`, a file the install ships
			// and no lib entry names.
			traversal: await resolve(tsconfig, './../typescript'),
		}, {
			named: libFileUri(version.path, 'lib.dom.d.ts').toString(),
			readsAfterNamed: 0,
			alias: libFileUri(version.path, 'lib.es2016.d.ts').toString(),
			unknown: undefined,
			traversal: undefined,
		});
	});

	test('skips an install the service itself would fall back away from', async () => {
		const unreadable = new TypeScriptVersion(TypeScriptVersionSource.WorkspaceSetting, '/workspace/node_modules/typescript/lib/tsserver.js', undefined);
		const bundled = validVersion(TypeScriptVersionSource.Bundled, bundledTsServerPath());
		const provider: ITypeScriptVersionProvider = {
			updateConfiguration() { },
			defaultVersion: unreadable,
			globalVersion: undefined,
			localVersion: unreadable,
			localVersions: [unreadable],
			bundledVersion: bundled,
		};
		const { resolve } = createLinkDescriptors(provider, emptyMemento, async () => undefined)[TsConfigLinkKind.Lib];

		const target = await resolve(vscode.Uri.file('/workspace/tsconfig.json'), 'DOM');

		assert.deepStrictEqual(target?.toString(), libFileUri(bundled.path, 'lib.dom.d.ts').toString());
	});

	test('reads a path written with Windows separators the way the compiler does', async () => {
		const descriptors = createLinkDescriptors(
			new Proxy({} as ITypeScriptVersionProvider, { get: () => { throw new Error('Unexpected version provider access'); } }),
			emptyMemento,
			async () => undefined);
		const tsconfig = vscode.Uri.file('/workspace/tsconfig.json');

		assert.deepStrictEqual({
			relative: (await descriptors[TsConfigLinkKind.Extends].resolve(tsconfig, '.\\base.json'))?.toString(),
			parent: (await descriptors[TsConfigLinkKind.Path].resolve(tsconfig, '..\\shared'))?.toString(),
			unc: (await descriptors[TsConfigLinkKind.BuildOutput].resolve(tsconfig, '\\\\build01\\drops\\app.js'))?.toString(),
		}, {
			relative: 'file:///workspace/base.json',
			parent: 'file:///shared',
			unc: 'file://build01/drops/app.js',
		});
	});

	test('reads the lib map from the typescript.js beside the install', async () => {
		const libMap = await readLibMapFromInstall(new TypeScriptVersion(TypeScriptVersionSource.Bundled, bundledTsServerPath(), undefined));

		assert.deepStrictEqual({
			dom: libMap?.get('dom'),
			es7: libMap?.get('es7'),
			bigint: libMap?.get('esnext.bigint'),
			unknown: libMap?.get('nope'),
		}, {
			dom: 'lib.dom.d.ts',
			es7: 'lib.es2016.d.ts',
			bigint: 'lib.es2020.bigint.d.ts',
			unknown: undefined,
		});
	});
});

suite('TsconfigLinkProvider', () => {
	test('produces one link per candidate with a follow-link tooltip', async () => {
		const content = JSON.stringify({
			extends: './base.json',
			include: ['src/**/*'],
			compilerOptions: { lib: ['DOM'], outDir: './out' },
		});
		const document = await vscode.workspace.openTextDocument({ language: 'jsonc', content });
		const token = new vscode.CancellationTokenSource().token;

		const links = new TsconfigLinkProvider().provideDocumentLinks(document, token);

		assert.deepStrictEqual(links.map(link => ({
			text: document.getText(link.range),
			tooltip: link.tooltip,
			command: link.target?.path,
		})), [
			{ text: './base.json', tooltip: 'Follow link', command: '_typescript.openTsConfigLink' },
			{ text: 'src', tooltip: 'Follow link', command: '_typescript.openTsConfigLink' },
			{ text: 'DOM', tooltip: 'Follow link', command: '_typescript.openTsConfigLink' },
			{ text: './out', tooltip: 'Follow link', command: '_typescript.openTsConfigLink' },
		]);
	});

	test('encodes arguments so they survive the opener decoding the query once', async () => {
		// A percent escape and a `#` are the two shapes that a `Uri.parse` round trip loses.
		const content = JSON.stringify({ extends: './a%20b.json', files: ['c#d.ts'] });
		const document = await vscode.workspace.openTextDocument({ language: 'jsonc', content });
		const token = new vscode.CancellationTokenSource().token;

		const links = new TsconfigLinkProvider().provideDocumentLinks(document, token);

		// How `CommandOpener` in the workbench reads the arguments back out of a command link.
		function decodeArgs(link: vscode.DocumentLink): { pathValue: string; linkKind: string } {
			assert.ok(link.target, 'Expected the link to carry a command target');
			assert.strictEqual(link.target.fragment, '', 'The arguments must not leak into the fragment');
			return JSON.parse(decodeURIComponent(link.target.query));
		}

		assert.deepStrictEqual(links.map(decodeArgs).map(({ pathValue, linkKind }) => ({ pathValue, linkKind })), [
			{ pathValue: './a%20b.json', linkKind: 'extends' },
			{ pathValue: 'c#d.ts', linkKind: 'projectFile' },
		]);
	});
});

suite('openTsConfigLink', () => {
	const resourceUri = vscode.Uri.file('/workspace/tsconfig.json');

	/** The real descriptors, with every resolver replaced so that only the kind under test can be reached. */
	function resolversFor(overrides: Partial<Record<TsConfigLinkKind, TsConfigLinkResolver>>): TsConfigLinkDescriptors {
		const unexpected: TsConfigLinkResolver = async () => { throw new Error('Unexpected resolver call'); };
		const unusedProvider = new Proxy({} as ITypeScriptVersionProvider, { get: () => { throw new Error('Unexpected version provider access'); } });
		const descriptors = createLinkDescriptors(unusedProvider, emptyMemento, async () => undefined);

		return Object.fromEntries(Object.values(TsConfigLinkKind).map(kind =>
			[kind, { ...descriptors[kind], resolve: overrides[kind] ?? unexpected }])) as TsConfigLinkDescriptors;
	}

	function recordOutcomes(): { handler: TsConfigLinkOutcomeHandler; outcomes: TsConfigLinkOutcome[] } {
		const outcomes: TsConfigLinkOutcome[] = [];
		return { outcomes, handler: async outcome => { outcomes.push(outcome); } };
	}

	function describeOutcome(outcome: TsConfigLinkOutcome): { kind: string; target?: string; text?: string } {
		return outcome.kind === 'message'
			? { kind: outcome.kind, text: outcome.text }
			: { kind: outcome.kind, target: outcome.target.toString() };
	}

	test('shows a kind-specific message when the target does not resolve', async () => {
		const resolvers = resolversFor({ [TsConfigLinkKind.Lib]: async () => undefined });
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: 'dom', linkKind: TsConfigLinkKind.Lib },
			resolvers,
			async () => { throw new Error('stat should not be called when the target does not resolve'); },
			handler);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'message', text: 'Failed to resolve TypeScript lib dom' },
		]);
	});

	test('reveals a target that stats as a directory instead of opening it', async () => {
		const target = vscode.Uri.file('/workspace/src');
		const resolvers = resolversFor({ [TsConfigLinkKind.ProjectFile]: async () => target });
		const directoryStat: vscode.FileStat = { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: 'src', linkKind: TsConfigLinkKind.ProjectFile },
			resolvers,
			async () => directoryStat,
			handler,
			() => true);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'reveal', target: target.toString() },
		]);
	});

	test('reveals a directory outside the workspace differently, since the explorer cannot show it', async () => {
		const target = vscode.Uri.file('/elsewhere/dist');
		const resolvers = resolversFor({ [TsConfigLinkKind.BuildOutput]: async () => target });
		const directoryStat: vscode.FileStat = { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: '../../elsewhere/dist', linkKind: TsConfigLinkKind.BuildOutput },
			resolvers,
			async () => directoryStat,
			handler,
			() => false);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'revealOutsideWorkspace', target: target.toString() },
		]);
	});

	test('reports a BuildOutput target that has not been built yet', async () => {
		const target = vscode.Uri.file('/workspace/out');
		const resolvers = resolversFor({ [TsConfigLinkKind.BuildOutput]: async () => target });
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: './out', linkKind: TsConfigLinkKind.BuildOutput },
			resolvers,
			async () => undefined,
			handler);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'message', text: './out does not exist yet. Build the project to create it.' },
		]);
	});

	test('still offers to create a missing extends target', async () => {
		const target = vscode.Uri.file('/workspace/base.json');
		const resolvers = resolversFor({ [TsConfigLinkKind.Extends]: async () => target });
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: './base.json', linkKind: TsConfigLinkKind.Extends },
			resolvers,
			async () => undefined,
			handler);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'open', target: target.toString() },
		]);
	});

	test('still offers to create a missing files entry', async () => {
		const target = vscode.Uri.file('/workspace/a.ts');
		const resolvers = resolversFor({ [TsConfigLinkKind.ProjectFile]: async () => target });
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: 'a.ts', linkKind: TsConfigLinkKind.ProjectFile },
			resolvers,
			async () => undefined,
			handler);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'open', target: target.toString() },
		]);
	});

	test('reports rather than offers to create a missing directory target', async () => {
		const resolvers = resolversFor({ [TsConfigLinkKind.Path]: async () => vscode.Uri.file('/workspace/src') });
		const { handler, outcomes } = recordOutcomes();

		await openTsConfigLink(
			{ resourceUri, pathValue: './src', linkKind: TsConfigLinkKind.Path },
			resolvers,
			async () => undefined,
			handler);

		assert.deepStrictEqual(outcomes.map(describeOutcome), [
			{ kind: 'message', text: './src does not exist.' },
		]);
	});
});
