/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as jsonc from 'jsonc-parser';
import 'mocha';
import * as vscode from 'vscode';
import { openTsConfigLink, TsConfigLinkOutcome, TsConfigLinkOutcomeHandler, TsconfigLinkProvider } from '../../languageFeatures/tsconfig';
import { arrayWildcard, collectLinkCandidates, selectNonGlobPrefix, selectNonUriValue, selectStringNodes, selectWholeValue, TsConfigLinkKind } from '../../languageFeatures/tsconfig/links';
import { createResolvers, libFileUri, looksLikeAbsolutePath, looksLikeRelativePath, TsConfigLinkResolver, TsConfigLinkResolvers, typesPackageName } from '../../languageFeatures/tsconfig/resolvers';
import { ITypeScriptVersionProvider, TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { Lazy } from '../../utils/lazy';

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
		}, {
			noGlob: { offset: 0, length: 3 },
			trailing: { offset: 0, length: 3 },
			deep: { offset: 0, length: 13 },
			leadingGlob: undefined,
			rootedGlob: undefined,
			ownDirectory: undefined,
			ownDirectoryChild: { offset: 0, length: 5 },
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
		return collectLinkCandidates(parse(text))
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
			collectLinkCandidates(parse(text)).map(candidate => candidate.value),
			['src']);
	});

	test('keeps a whole-value candidate value unchanged', () => {
		const text = JSON.stringify({ extends: './base.json' });

		assert.deepStrictEqual(
			collectLinkCandidates(parse(text)).map(candidate => candidate.value),
			['./base.json']);
	});

	test('drops a narrowed link when the value contains an escape', () => {
		assert.deepStrictEqual({
			escapedWhole: collect('{ "extends": "./a\\u0062.json" }'),
			escapedNarrowed: collect('{ "include": ["s\\u0072c/**/*"] }'),
			// The range covers the raw source, but the value the resolver sees is decoded.
			escapedWholeValue: collectLinkCandidates(parse('{ "extends": "./a\\u0062.json" }')).map(candidate => candidate.value),
		}, {
			escapedWhole: [{ kind: 'extends', linked: './a\\u0062.json' }],
			escapedNarrowed: [],
			escapedWholeValue: ['./ab.json'],
		});
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
			localVersions: [new TypeScriptVersion(TypeScriptVersionSource.NodeModules, '/missing/node_modules/typescript/lib/tsserver.js', undefined)],
			get bundledVersion(): TypeScriptVersion {
				reads.bundledVersion++;
				throw new Error('Could not find bundled tsserver.js');
			},
		};
		const workspaceState: vscode.Memento = { keys: () => [], get: <T>(_key: string, defaultValue?: T) => defaultValue, update: async () => { } };
		const resolve = createResolvers(new Lazy(() => provider), workspaceState)[TsConfigLinkKind.Lib];

		const target = await resolve(vscode.Uri.file('/workspace/tsconfig.json'), 'dom');

		assert.deepStrictEqual({ target, reads }, { target: undefined, reads: { defaultVersion: 1, bundledVersion: 1 } });
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

	/** A resolver for every kind, so that only the kind under test can be reached. */
	function resolversFor(overrides: Partial<Record<TsConfigLinkKind, TsConfigLinkResolver>>): TsConfigLinkResolvers {
		const unexpected: TsConfigLinkResolver = async () => { throw new Error('Unexpected resolver call'); };
		return {
			[TsConfigLinkKind.Extends]: unexpected,
			[TsConfigLinkKind.Reference]: unexpected,
			[TsConfigLinkKind.ProjectFile]: unexpected,
			[TsConfigLinkKind.Lib]: unexpected,
			[TsConfigLinkKind.TypePackage]: unexpected,
			[TsConfigLinkKind.Path]: unexpected,
			[TsConfigLinkKind.BuildOutput]: unexpected,
			...overrides,
		};
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
