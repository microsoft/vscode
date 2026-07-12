/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IIgnoreService } from '../../../../../../../../platform/ignore/common/ignoreService';
import { SyncDescriptor } from '../../../../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { accessTimes } from '../../../documentTracker';
import { ExpTreatmentVariables } from '../../../experiments/expConfig';
import { ICompletionsFileSystemService } from '../../../fileSystem';
import { ICompletionsLogTargetService } from '../../../logger';
import { TelemetryWithExp } from '../../../telemetry';
import { createLibTestingContext } from '../../../test/context';
import { TestTextDocumentManager } from '../../../test/textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';
import { NeighboringFileType, NeighborSource } from '../neighborFiles';
import { OpenTabFiles } from '../openTabFiles';
import {
	ICompletionsRelatedFilesProviderService,
	RelatedFilesDocumentInfo,
	RelatedFilesProvider,
	RelatedFilesResponse,
	RelatedFilesResponseEntry,
	RelatedFileTrait,
} from '../relatedFiles';

const TIMEOUT = 1000;

const WKS_ROOTFOLDER = 'file:///test';

const FILE_A = 'file:///test/a.py';
const FILE_A_TEXT = '# file a';

const FILE_B = 'file:///test/b.py';
const FILE_B_TEXT = '# file b';

const FILE_C = 'file:///test/c.py';
const FILE_C_TEXT = '# file c';

const FILE_D = 'file:///test/d.py';
const FILE_D_TEXT = '# file d';

const FILE_E = 'file:///test/test2/e.py';
const FILE_E_TEXT = '# file e';

const FILE_F = 'file:///test/test2/f.py';
const FILE_F_TEXT = '# file f';

const FILE_G = 'file:///test/test3/test4/g.py';
const FILE_G_TEXT = '# file g';

const FILE_I = 'file:///test/test2/i.py';
const FILE_I_TEXT = '# file i';

const FILE_J = 'file:///test/test2/j.js';
const FILE_J_TEXT = '# file j';

const FILE_K = 'file:///test/test2/k.md';
const FILE_K_TEXT = '# file k';

const FILE_R = 'file:///test/test2/r.jsx';
const FILE_R_TEXT = '# file r';

const FILE_S = 'file:///test/test2/s.js';
const FILE_S_TEXT = '# file s';

const FILE_T = 'file:///test/test2/t.js';
const FILE_T_TEXT = '# file t';

const CURRENT_TIME_STAMP = Date.now();
const CURSOR_HISTORY_FOR_TEST: { uri: string; offset: number; timestamp: number; text: string }[] = [
	{ uri: FILE_C, offset: 0, timestamp: CURRENT_TIME_STAMP - 14, text: FILE_C_TEXT },
	{ uri: FILE_C, offset: 0, timestamp: CURRENT_TIME_STAMP - 13, text: FILE_C_TEXT },
	{ uri: FILE_C, offset: 0, timestamp: CURRENT_TIME_STAMP - 12, text: FILE_C_TEXT },
	{ uri: FILE_A, offset: 0, timestamp: CURRENT_TIME_STAMP - 11, text: FILE_A_TEXT },
	{ uri: FILE_D, offset: 0, timestamp: CURRENT_TIME_STAMP - 10, text: FILE_D_TEXT },
	{ uri: FILE_D, offset: 0, timestamp: CURRENT_TIME_STAMP - 9, text: FILE_D_TEXT },
	{ uri: FILE_D, offset: 0, timestamp: CURRENT_TIME_STAMP - 8, text: FILE_D_TEXT },
	{ uri: FILE_D, offset: 0, timestamp: CURRENT_TIME_STAMP - 7, text: FILE_D_TEXT },
	{ uri: FILE_A, offset: 0, timestamp: CURRENT_TIME_STAMP - 6, text: FILE_A_TEXT },
	{ uri: FILE_C, offset: 0, timestamp: CURRENT_TIME_STAMP - 5, text: FILE_C_TEXT },
	{ uri: FILE_B, offset: 0, timestamp: CURRENT_TIME_STAMP - 4, text: FILE_B_TEXT },
	{ uri: FILE_B, offset: 0, timestamp: CURRENT_TIME_STAMP - 3, text: FILE_B_TEXT },
	{ uri: FILE_B, offset: 0, timestamp: CURRENT_TIME_STAMP - 2, text: FILE_B_TEXT },
	{ uri: FILE_J, offset: 0, timestamp: CURRENT_TIME_STAMP - 1, text: FILE_J_TEXT },
	{ uri: FILE_A, offset: 0, timestamp: CURRENT_TIME_STAMP, text: FILE_A_TEXT },
];

const OPEN_FILES_FOR_TEST: { uri: string; timestamp: number; text: string; language: string }[] = [
	{ uri: FILE_T, timestamp: CURRENT_TIME_STAMP - 7, text: FILE_T_TEXT, language: 'javascript' },
	{ uri: FILE_D, timestamp: CURRENT_TIME_STAMP - 6, text: FILE_D_TEXT, language: 'python' },
	{ uri: FILE_R, timestamp: CURRENT_TIME_STAMP - 3, text: FILE_R_TEXT, language: 'javascriptreact' },
	{ uri: FILE_C, timestamp: CURRENT_TIME_STAMP - 4, text: FILE_C_TEXT, language: 'python' },
	{ uri: FILE_J, timestamp: CURRENT_TIME_STAMP - 3, text: FILE_J_TEXT, language: 'javascript' },
	{ uri: FILE_K, timestamp: CURRENT_TIME_STAMP - 2, text: FILE_K_TEXT, language: 'markdown' },
	{ uri: FILE_B, timestamp: CURRENT_TIME_STAMP - 1, text: FILE_B_TEXT, language: 'python' },
	{ uri: FILE_A, timestamp: CURRENT_TIME_STAMP, text: FILE_A_TEXT, language: 'python' },
];

const WORKSPACE_FILES_FOR_TEST: { uri: string; text: string; language: string }[] = [
	{ uri: FILE_E, text: FILE_E_TEXT, language: 'python' },
	{ uri: FILE_D, text: FILE_D_TEXT, language: 'python' },
	{ uri: FILE_F, text: FILE_F_TEXT, language: 'python' },
	{ uri: FILE_G, text: FILE_G_TEXT, language: 'python' },
	{ uri: FILE_I, text: FILE_I_TEXT, language: 'python' },
	{ uri: FILE_J, text: FILE_J_TEXT, language: 'javascript' },
	{ uri: FILE_K, text: FILE_K_TEXT, language: 'markdown' },
	{ uri: FILE_S, text: FILE_S_TEXT, language: 'javascript' },
	{ uri: FILE_T, text: FILE_T_TEXT, language: 'javascript' },
];

const CURRENT_FILE = CURSOR_HISTORY_FOR_TEST[CURSOR_HISTORY_FOR_TEST.length - 1].uri;

const MAX_NUM_NEIGHBORING_FILES = 20;
const DEFAULT_FILE_LANGUAGE = 'python';

suite('neighbor files tests', function () {
	this.timeout(TIMEOUT);
	const accessor = createLibTestingContext().createTestingAccessor();
	const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;

	const workspaceTextDocumentManager = accessor.get(IInstantiationService).createInstance(TestTextDocumentManager);
	for (const file of WORKSPACE_FILES_FOR_TEST) {
		workspaceTextDocumentManager.setDiskContents(file.uri, file.text);
	}

	workspaceTextDocumentManager.setTextDocument(FILE_I, DEFAULT_FILE_LANGUAGE, FILE_I_TEXT);

	for (const file of OPEN_FILES_FOR_TEST) {
		tdm.setTextDocument(file.uri, file.language, file.text);
	}

	setup(() => {
		accessTimes.clear();
		for (const file of OPEN_FILES_FOR_TEST) {
			accessTimes.set(file.uri, file.timestamp);
		}
	});

	test('Test open files', async function () {
		const at = accessTimes;
		console.log('Access times:', at);
		const ns = new OpenTabFiles(tdm);
		const { docs, neighborSource } = await ns.getNeighborFiles(
			CURRENT_FILE,
			DEFAULT_FILE_LANGUAGE,
			MAX_NUM_NEIGHBORING_FILES
		);
		assert.strictEqual(docs.size, 3);
		assert.strictEqual(docs.has(FILE_B), true);
		assert.strictEqual(docs.has(FILE_C), true);
		assert.strictEqual(docs.has(FILE_D), true);
		assert.strictEqual(neighborSource.has(NeighboringFileType.CursorMostCount), false);
		assert.strictEqual(neighborSource.has(NeighboringFileType.CursorMostRecent), false);
		assert.strictEqual(neighborSource.has(NeighboringFileType.OpenTabs), true);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.length, 3);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.shift(), FILE_B);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.shift(), FILE_C);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.shift(), FILE_D);
	});

	test('Test open files file limit', async function () {
		const ns = new OpenTabFiles(tdm);
		const { docs } = await ns.getNeighborFiles(CURRENT_FILE, DEFAULT_FILE_LANGUAGE, /* maxNumNeighborFiles */ 1);
		assert.strictEqual(docs.size, 1);
	});

	test('Include neighboring files for aliased languages', async function () {
		const ns = new OpenTabFiles(tdm);
		const { docs } = await ns.getNeighborFiles(CURRENT_FILE, 'javascript', MAX_NUM_NEIGHBORING_FILES);

		assert.ok(docs.has(FILE_J));
		assert.ok(docs.has(FILE_R));
	});
});

suite('NeighborSource.getRelativePath tests', function () {
	test('should return the relative path', function () {
		const file = 'file:/path/to/file.txt';
		const base = 'file:/path/to';
		const relativePath = NeighborSource.getRelativePath(file, base);
		assert.strictEqual(relativePath, 'file.txt');

		const sshFile = 'ssh://path/to/file.txt';
		const sshBase = 'ssh:';
		const relativeSshPath = NeighborSource.getRelativePath(sshFile, sshBase);
		assert.strictEqual(relativeSshPath, '/path/to/file.txt');
	});

	test('should return the basename of the file if not related to the basePath (and should not add ".." to the path either)', function () {
		{
			const file = 'gopher:/path/to/file.txt';
			const base = 'https://path/to';
			const relativePath = NeighborSource.getRelativePath(file, base);
			assert.strictEqual(relativePath, 'file.txt');
		}

		{
			const file = 'file:/path/to/file.txt';
			const base = 'file://path/to/sibling';
			const relativePath = NeighborSource.getRelativePath(file, base);
			assert.strictEqual(relativePath, 'file.txt');
			const relativePath2 = NeighborSource.getRelativePath(base, file);
			assert.strictEqual(relativePath2, 'sibling');
		}

		{
			const file = '';
			const base = 'file:///';
			const relativePath = NeighborSource.getRelativePath(file, base);
			assert.strictEqual(relativePath, '');
		}

		{
			const file = '';
			const base = '';
			const relativePath = NeighborSource.getRelativePath(file, base);
			assert.strictEqual(relativePath, '');
		}
	});
});

suite('Neighbor files exclusion tests', function () {
	class MockedRelatedFilesProvider extends RelatedFilesProvider {
		constructor(
			private readonly relatedFiles: RelatedFilesResponseEntry[],
			private readonly traits: RelatedFileTrait[] = [{ name: 'testTraitName', value: 'testTraitValue' }],
			@IInstantiationService instantiationService: IInstantiationService,
			@IIgnoreService ignoreService: IIgnoreService,
			@ICompletionsLogTargetService logTarget: ICompletionsLogTargetService,
			@ICompletionsFileSystemService fileSystemService: ICompletionsFileSystemService,
		) {
			super(instantiationService, ignoreService, logTarget, fileSystemService);
		}

		async getRelatedFilesResponse(
			docInfo: RelatedFilesDocumentInfo,
			telemetryData: TelemetryWithExp
		): Promise<RelatedFilesResponse | undefined> {
			return Promise.resolve({
				entries: this.relatedFiles,
				traits: this.traits,
			});
		}

		override getFileContent(uri: string): Promise<string | undefined> {
			// we are not asserting on file content, so just return a dummy text
			return Promise.resolve('dummy text');
		}
	}

	const serviceCollection = createLibTestingContext();
	serviceCollection.define(ICompletionsRelatedFilesProviderService, new SyncDescriptor(MockedRelatedFilesProvider, [[], [{ name: 'testTraitName', value: 'testTraitValue' }]]));

	const accessor = serviceCollection.createTestingAccessor();
	const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
	tdm.init([{ uri: WKS_ROOTFOLDER }]);

	for (const file of OPEN_FILES_FOR_TEST) {
		accessTimes.set(file.uri, file.timestamp);
	}

	const workspaceTextDocumentManager = accessor.get(IInstantiationService).createInstance(TestTextDocumentManager);
	for (const file of WORKSPACE_FILES_FOR_TEST) {
		workspaceTextDocumentManager.setDiskContents(file.uri, file.text);
	}

	workspaceTextDocumentManager.setTextDocument(FILE_I, DEFAULT_FILE_LANGUAGE, FILE_I_TEXT);

	for (const file of OPEN_FILES_FOR_TEST) {
		tdm.setTextDocument(file.uri, file.language, file.text);
	}

	test('Test with related files excluded', async function () {
		NeighborSource.reset();
		const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
		telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ExcludeRelatedFiles] = true;
		const { docs, neighborSource, traits } = await NeighborSource.getNeighborFilesAndTraits(
			accessor,
			FILE_J,
			'javascript',
			telemetryWithExp,
			undefined,
			undefined,
			true
		);

		assert.strictEqual(docs.size, 2);
		assert.strictEqual(docs.has(FILE_T), true);
		assert.strictEqual(docs.has(FILE_R), true);
		assert.strictEqual(neighborSource.size, 1);
		assert.strictEqual(neighborSource.has(NeighboringFileType.OpenTabs), true);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.length, 2);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.shift(), FILE_R);
		assert.strictEqual(neighborSource.get(NeighboringFileType.OpenTabs)?.shift(), FILE_T);
		assert.strictEqual(traits.length, 0);
	});
});
