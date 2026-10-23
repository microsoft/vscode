/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import Sinon from 'sinon';
import type { CancellationToken } from 'vscode';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import { SyncDescriptor } from '../../../../../../../../util/vs/platform/instantiation/common/descriptors';
import { accessTimes } from '../../../documentTracker';
import { ExpTreatmentVariables } from '../../../experiments/expConfig';
import { TelemetryWithExp } from '../../../telemetry';
import { createLibTestingContext } from '../../../test/context';
import { TestTextDocumentManager } from '../../../test/textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';
import { getFsPath } from '../../../util/uri';
import { CompositeRelatedFilesProvider, ProviderCallback } from '../compositeRelatedFilesProvider';
import { NeighborSource, NeighboringFileType } from '../neighborFiles';
import {
	ICompletionsRelatedFilesProviderService,
	PromiseExpirationCacheMap,
	RelatedFilesDocumentInfo, RelatedFilesResponse,
	RelatedFilesType,
	getRelatedFilesAndTraits
} from '../relatedFiles';

suite('PromiseExpirationCacheMap', function () {
	const r: RelatedFilesType = new Map<NeighboringFileType, Map<string, string>>();
	const x = Promise.resolve(r);
	test('should add and retrieve entries using set and get methods', function () {
		const cache = new PromiseExpirationCacheMap<RelatedFilesType>(2);
		cache.set('a', x);
		cache.set('b', x);
		cache.set('c', x);
		assert.equal(cache.get('b'), x);
		assert.equal(cache.get('c'), x);
		assert.equal(cache.get('a'), undefined, 'a should have been removed from the cache');
		assert.equal(cache.size, 2);
	});

	test('get() should evict expired cache entries', async function () {
		const cache = new PromiseExpirationCacheMap<RelatedFilesType>(3, 10);
		cache.set('a', x);
		cache.set('b', x);
		await new Promise(resolve => setTimeout(resolve, 20));
		cache.set('c', x);
		// size does count existing expired entries.
		assert.equal(cache.size, 3);
		assert.equal(cache.get('a'), undefined);
		assert.equal(cache.get('b'), undefined);
		assert.equal(cache.get('c'), x);
		assert.equal(cache.size, 1);
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.equal(cache.get('c'), undefined);
		assert.equal(cache.size, 0);
	});

	test('has() should evict expired cache entries', async function () {
		const cache = new PromiseExpirationCacheMap<RelatedFilesType>(7, 10);
		cache.set('a', x);
		cache.set('b', x);
		await new Promise(resolve => setTimeout(resolve, 20));
		cache.set('c', x);
		assert.equal(cache.has('c'), true);
		assert.equal(cache.get('c'), x);
		assert.equal(cache.has('a'), false);
		assert.equal(cache.has('b'), false);
		assert.equal(cache.get('a'), undefined);
		assert.equal(cache.get('b'), undefined);
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.equal(cache.has('c'), false);
		assert.equal(cache.get('c'), undefined);
	});

	test('clear works', function () {
		const cache = new PromiseExpirationCacheMap<RelatedFilesType>(2);
		cache.set('a', x);
		cache.set('b', x);
		cache.clear();
		assert.equal(cache.get('a'), undefined);
		assert.equal(cache.get('b'), undefined);
		assert.equal(cache.size, 0);
	});
});
function createOpenFiles(root: string, timestamp: number) {
	const FILE_D = `${root}/d.py`;
	const FILE_D_TEXT = '# file d';

	const FILE_E = `${root}/e.cs`;
	const FILE_E_TEXT = '// file e';

	const FILE_R = `${root}/relative/r.jsx`;
	const FILE_R_TEXT = '// file r';

	const FILE_J = `${root}/relative/j.js`;
	const FILE_J_TEXT = '// file j';

	const FILE_K = `${root}/relative/k.md`;
	const FILE_K_TEXT = '# file k';

	return [
		{ uri: FILE_D, timestamp: timestamp - 6, text: FILE_D_TEXT, language: 'python' },
		{ uri: FILE_E, timestamp: timestamp - 4, text: FILE_E_TEXT, language: 'csharp' },
		{ uri: FILE_R, timestamp: timestamp - 3, text: FILE_R_TEXT, language: 'javascriptreact' },
		{ uri: FILE_J, timestamp: timestamp - 3, text: FILE_J_TEXT, language: 'javascript' },
		{ uri: FILE_K, timestamp: timestamp - 2, text: FILE_K_TEXT, language: 'markdown' },
	];
}

suite('relatedFiles tests', function () {
	const TIMEOUT = 1000;
	const DEFAULT_FILE_LANGUAGE = 'cpp';
	const CURRENT_TIME_STAMP = Date.now();
	const WKS_ROOTFOLDER = 'file:///test';
	this.timeout(TIMEOUT);
	const OPEN_FILES_FOR_TEST = createOpenFiles(WKS_ROOTFOLDER, CURRENT_TIME_STAMP);

	test('Test scenario where 4 files provided by the C++ related files provider are identical to 2 provided by the OpenTabs`s neighborSource', async function () {
		function getHeaderFileContent(uri: string) {
			return `// file ${getFsPath(uri)}`;
		}
		const CPP_NONOPENTAB_HEADERS: string[] = [];
		const CPP_OPENTAB_HEADERS: string[] = [];
		for (let i = 0; i < 2; i++) { CPP_OPENTAB_HEADERS.push(`${WKS_ROOTFOLDER}/relative/cppheader${i + 1}.h`); }
		for (let i = 2; i < 4; i++) { CPP_NONOPENTAB_HEADERS.push(`${WKS_ROOTFOLDER}/relative/cppheader${i + 1}.h`); }
		const CPP_ALL_HEADERS: string[] = CPP_NONOPENTAB_HEADERS.concat(CPP_OPENTAB_HEADERS);
		const CURRENT_TIME_STAMP = Date.now();

		const FILE_CPP = `${WKS_ROOTFOLDER}/relative/main.cpp`;
		const FILE_CPP_TEXT = '// file main.cpp';
		OPEN_FILES_FOR_TEST.push({
			uri: FILE_CPP,
			timestamp: CURRENT_TIME_STAMP,
			text: FILE_CPP_TEXT,
			language: 'cpp',
		});

		// Add the files provided by OpenTabs that are also provided by the C++ relatedFiles provider.
		for (const openTabHeader of CPP_OPENTAB_HEADERS) {
			OPEN_FILES_FOR_TEST.push({
				uri: openTabHeader,
				timestamp: CURRENT_TIME_STAMP,
				text: getHeaderFileContent(openTabHeader),
				language: 'cpp',
			});
		}

		const DEFAULT_FILE_LANGUAGE = 'cpp';

		class MockedCppRelatedFilesProvider extends CompositeRelatedFilesProvider {
			override getRelatedFilesResponse(
				docInfo: RelatedFilesDocumentInfo,
				telemetryData: TelemetryWithExp
			): Promise<RelatedFilesResponse | undefined> {
				const uris = CPP_ALL_HEADERS;
				return Promise.resolve({ entries: [{ type: NeighboringFileType.RelatedCpp, uris }] });
			}

			override getFileContent(uri: string): Promise<string | undefined> {
				return Promise.resolve(getHeaderFileContent(uri));
			}
		}

		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsRelatedFilesProviderService, new SyncDescriptor(MockedCppRelatedFilesProvider));
		serviceCollection.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(TestTextDocumentManager));
		const accessor = serviceCollection.createTestingAccessor();

		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		NeighborSource.reset();

		// Mock up the workspace folders.
		tdm.init([{ uri: WKS_ROOTFOLDER }]);

		accessTimes.clear();
		for (const file of OPEN_FILES_FOR_TEST) {
			accessTimes.set(file.uri, file.timestamp);
			tdm.setTextDocument(file.uri, file.language, file.text);
		}

		const telemetry = TelemetryWithExp.createEmptyConfigForTesting();

		const result = await NeighborSource.getNeighborFilesAndTraits(accessor, FILE_CPP, DEFAULT_FILE_LANGUAGE, telemetry);

		// 4 header files, two provided by the OpenTabs neightborSource, and two provided by the C++ relatedFiles provider.
		assert.strictEqual(result.docs.size, 4);
		for (const file of CPP_ALL_HEADERS) {
			assert.strictEqual(result.docs.has(file), true);
		}
		assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), true);
		assert.strictEqual(result.neighborSource.has(NeighboringFileType.OpenTabs), true);
		for (const file of CPP_OPENTAB_HEADERS) {
			assert.strictEqual(result.neighborSource.get(NeighboringFileType.OpenTabs)?.includes(file), true);
			assert.strictEqual(result.neighborSource.get(NeighboringFileType.RelatedCpp)?.includes(file), false);
		}
		for (const file of CPP_NONOPENTAB_HEADERS) {
			assert.strictEqual(result.neighborSource.get(NeighboringFileType.RelatedCpp)?.includes(file), true);
			assert.strictEqual(result.neighborSource.get(NeighboringFileType.OpenTabs)?.includes(file), false);
		}
	});

	test('Test scenarios where the C++ related files provider fails', async function () {
		const DUMMY_OPEN_CPPFILE = 'file:///test/relative/main2.cpp';
		const DUMMY_RELATED_FILE = 'file:///test/relative/related-file.cpp';
		const RETRY_COUNT = 3;

		enum FailureType {
			WithException,
			WithUndefined,
			NoFailure,
		}

		class MockedCppRelatedFilesProvider extends CompositeRelatedFilesProvider {
			override getRelatedFilesResponse(
				_docInfo: RelatedFilesDocumentInfo,
				_telemetryData: TelemetryWithExp,
				_cancellationToken: CancellationToken | undefined
			): Promise<RelatedFilesResponse | undefined> {
				switch (this._failureType) {
					case FailureType.WithException:
						return Promise.reject(new Error('The provider failed to provide the related files'));
					case FailureType.WithUndefined:
						return Promise.resolve(undefined);
					case FailureType.NoFailure:
						return Promise.resolve({
							entries: [{ type: NeighboringFileType.RelatedCpp, uris: [DUMMY_RELATED_FILE] }],
						});
				}
			}

			override getFileContent(uri: string): Promise<string | undefined> {
				return Promise.resolve('// C++ dummy content');
			}

			setFailWith(type: FailureType): void {
				this._failureType = type;
			}

			private _failureType: FailureType = FailureType.NoFailure;
		}

		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsRelatedFilesProviderService, new SyncDescriptor(MockedCppRelatedFilesProvider));
		serviceCollection.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(TestTextDocumentManager));
		const accessor = serviceCollection.createTestingAccessor();

		const cppProvider = accessor.get(ICompletionsRelatedFilesProviderService) as MockedCppRelatedFilesProvider;
		const telemetry = TelemetryWithExp.createEmptyConfigForTesting();
		const cppProviderGetMock = Sinon.spy(cppProvider, 'getRelatedFilesResponse');
		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.init([{ uri: WKS_ROOTFOLDER }]);
		const DUMMY_CPP = 'file:///test/relative/dummy.cpp';
		accessTimes.set(DUMMY_CPP, CURRENT_TIME_STAMP);
		tdm.setTextDocument(DUMMY_CPP, DEFAULT_FILE_LANGUAGE, DUMMY_RELATED_FILE);

		// One time init of NeighborSource singleton.
		NeighborSource.reset();
		// An empty list is cached when the retryCount limit is reached for a given URI.
		let result = undefined;
		for (let i = 0; i < RETRY_COUNT; i++) {
			cppProvider.setFailWith(RETRY_COUNT % 2 === 0 ? FailureType.WithException : FailureType.WithUndefined);
			result = await NeighborSource.getNeighborFilesAndTraits(accessor, DUMMY_CPP, DEFAULT_FILE_LANGUAGE, telemetry);
			assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), false);
			assert.strictEqual(cppProviderGetMock.callCount, 1);
			assert.strictEqual(cppProviderGetMock.calledOnce, true);
			cppProviderGetMock.resetHistory();
		}
		cppProvider.setFailWith(FailureType.WithException);
		for (let i = 0; i < RETRY_COUNT; i++) {
			result = await NeighborSource.getNeighborFilesAndTraits(accessor, DUMMY_CPP, DEFAULT_FILE_LANGUAGE, telemetry);
			assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), false);
			assert.strictEqual(cppProviderGetMock.calledOnce, false);
			cppProviderGetMock.resetHistory();
		}

		// The actual result is cached when retrieval works within the given retryCount limit.
		accessTimes.set(DUMMY_OPEN_CPPFILE, CURRENT_TIME_STAMP);
		tdm.setTextDocument(DUMMY_OPEN_CPPFILE, DEFAULT_FILE_LANGUAGE, DUMMY_RELATED_FILE);
		cppProvider.setFailWith(FailureType.WithException);
		for (let i = 0; i < RETRY_COUNT - 1; i++) {
			result = await NeighborSource.getNeighborFilesAndTraits(
				accessor,
				DUMMY_OPEN_CPPFILE,
				DEFAULT_FILE_LANGUAGE,
				telemetry
			);
			assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), false);
			assert.strictEqual(cppProviderGetMock.calledOnce, true);
			cppProviderGetMock.resetHistory();
		}
		cppProvider.setFailWith(FailureType.NoFailure);
		cppProviderGetMock.resetHistory();
		result = await NeighborSource.getNeighborFilesAndTraits(
			accessor,
			DUMMY_OPEN_CPPFILE,
			DEFAULT_FILE_LANGUAGE,
			telemetry
		);
		assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), true);
		assert.strictEqual(result.docs.has(DUMMY_RELATED_FILE), true);
		assert.strictEqual(cppProviderGetMock.calledOnce, true);
		cppProviderGetMock.resetHistory();
		result = await NeighborSource.getNeighborFilesAndTraits(
			accessor,
			DUMMY_OPEN_CPPFILE,
			DEFAULT_FILE_LANGUAGE,
			telemetry
		);
		assert.strictEqual(result.neighborSource.has(NeighboringFileType.RelatedCpp), true);
		assert.strictEqual(result.docs.has(DUMMY_RELATED_FILE), true);
		assert.strictEqual(cppProviderGetMock.calledOnce, false);
		cppProviderGetMock.resetHistory();
	});

	suite('CompositeRelatedFilesProvider', function () {
		class TestCompositeRelatedFilesProvider extends CompositeRelatedFilesProvider {
			override getFileContent(uri: string): Promise<string | undefined> {
				if (uri.endsWith('.js') || uri.endsWith('.ts')) {
					return Promise.resolve('// js dummy');
				} else if (uri.endsWith('.cs')) {
					return Promise.resolve('// cs dummy');
				}
				return Promise.resolve(undefined);
			}
		}

		async function compositeGetRelated(
			providers: Array<{
				languageId: string;
				extensionId: string;
				callback: ProviderCallback;
			}>,
			telemetryWithExp: TelemetryWithExp,
			filetype: 'csharp' | 'javascript' | 'python' = 'javascript',
			cancel = false
		) {
			const serviceCollection = createLibTestingContext();
			serviceCollection.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(TestTextDocumentManager));
			serviceCollection.define(ICompletionsRelatedFilesProviderService, new SyncDescriptor(TestCompositeRelatedFilesProvider));
			const accessor = serviceCollection.createTestingAccessor();

			const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
			// Mock up the workspace folders.
			tdm.init([{ uri: WKS_ROOTFOLDER }]);
			const composite = accessor.get(ICompletionsRelatedFilesProviderService) as TestCompositeRelatedFilesProvider;
			for (const { extensionId, languageId, callback } of providers) {
				composite.registerRelatedFilesProvider(extensionId, languageId, callback);
			}
			const OPEN_FILES_FOR_TEST = createOpenFiles(WKS_ROOTFOLDER, Date.now());

			const closedFiles = OPEN_FILES_FOR_TEST.map(f => ({ ...f, uri: f.uri.replace('.', '2.') }));

			for (const file of OPEN_FILES_FOR_TEST) {
				accessTimes.set(file.uri, file.timestamp);
			}

			for (const file of closedFiles) {
				tdm.setDiskContents(file.uri, file.text);
			}

			for (const file of OPEN_FILES_FOR_TEST) {
				tdm.setTextDocument(file.uri, file.language, file.text);
			}

			const uri = OPEN_FILES_FOR_TEST[filetype === 'javascript' ? 3 : 1].uri;
			const doc = await tdm.getTextDocument({ uri });
			assert.ok(doc, `missing text document ${uri}`);
			const wksFolder = tdm.getWorkspaceFolder(doc);
			assert.ok(wksFolder, `missing workspace folder for ${uri}`);

			const cts = new CancellationTokenSource();
			if (cancel) {
				cts.cancel();
			}
			return (await getRelatedFilesAndTraits(accessor, doc, telemetryWithExp, cts.token, undefined, true)).entries;
		}

		test('zero registered providers returns nothing', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated([], telemetryWithExp);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Typescript provider returns no files for JS file', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'typescript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '2.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Javascript provider returns nothing when cancelled', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url, context, token) =>
							Promise.resolve({
								entries: token.isCancellationRequested
									? []
									: [{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '2.')] }],
							}),
					},
				],
				telemetryWithExp,
				'javascript',
				/*cancel*/ true
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Javascript provider returns a file for JS file', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '2.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(
				relatedFiles,
				new Map([
					[NeighboringFileType.RelatedTypeScript, new Map([['file:///test/relative/j2.js', '// js dummy']])],
				])
			);
		});
		test('Javascript and C# providers only fire Typescript provider for JS', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'csharp',
						extensionId: 'ms-dotnettools.csharp',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedCSharpRoslyn, uris: [url.replace('.', '2.')] },
								],
							}),
					},
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '3.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(
				relatedFiles,
				new Map([
					[NeighboringFileType.RelatedTypeScript, new Map([['file:///test/relative/j3.js', '// js dummy']])],
				])
			);
		});
		test('multiple registration of Typescript providers for JS only returns one file', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '2.')] },
								],
							}),
					},
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '3.')] },
								],
							}),
					},
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '4.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(
				relatedFiles,
				new Map([
					[NeighboringFileType.RelatedTypeScript, new Map([['file:///test/relative/j4.js', '// js dummy']])],
				])
			);
		});
		test('C# provider returns a file for .cs file', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'csharp',
						extensionId: 'ms-dotnettools.csharp',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedCSharpRoslyn, uris: [url.replace('.', '2.')] },
								],
							}),
					},
				],
				telemetryWithExp,
				'csharp'
			);
			assert.deepStrictEqual(
				relatedFiles,
				new Map([[NeighboringFileType.RelatedCSharpRoslyn, new Map([['file:///test/e2.cs', '// cs dummy']])]])
			);
		});
		test('C# provider returns no files for JS file', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'csharp',
						extensionId: 'ms-dotnettools.csharp',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedCSharpRoslyn, uris: [url.replace('.', '2.')] },
								],
							}),
					},
				],
				telemetryWithExp,
				'javascript'
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Provider that throws returns no files', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = true;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) => Promise.reject(new Error(`Error providing files for ${url}`)),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Inactive Typescript provider returns no related files', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = false;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '4.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Inactive Typescript provider returns no related files with general flag enabled', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = false;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = false;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCode] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'javascript',
						extensionId: 'vscode.typescript-language-features',
						callback: (url: string) =>
							Promise.resolve({
								entries: [
									{ type: NeighboringFileType.RelatedTypeScript, uris: [url.replace('.', '4.')] },
								],
							}),
					},
				],
				telemetryWithExp
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
		test('Python provider returns related files with general flag enabled', async function () {
			const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeTypeScript] = false;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] = false;
			telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCode] = true;
			const relatedFiles = await compositeGetRelated(
				[
					{
						languageId: 'python',
						extensionId: 'ms-python.python',
						callback: (url: string) =>
							Promise.resolve({
								entries: [{ type: NeighboringFileType.RelatedOther, uris: [url.replace('.', '4.')] }],
							}),
					},
				],
				telemetryWithExp,
				'python'
			);
			assert.deepStrictEqual(relatedFiles, new Map());
		});
	});
});
