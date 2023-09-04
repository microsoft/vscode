/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Match, FileMatch, SearchResult, SearchModel, FolderMatch, CellMatch } from 'vs/workbench/contrib/search/browser/searchModel';
import { URI } from 'vs/base/common/uri';
import { IFileMatch, TextSearchMatch, OneLineRange, ITextSearchMatch, QueryType } from 'vs/workbench/services/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IModelService } from 'vs/editor/common/services/model';
import { IReplaceService } from 'vs/workbench/contrib/search/browser/replace';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { FileService } from 'vs/platform/files/common/fileService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { ILabelService } from 'vs/platform/label/common/label';
import { MockLabelService } from 'vs/workbench/services/label/test/common/mockLabelService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { TestEditorGroupsService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { ICellMatch, IFileMatchWithCells } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { addToSearchResult, createFileUriFromPathFromRoot, getRootName } from 'vs/workbench/contrib/search/test/browser/searchTestCommon';

const lineOneRange = new OneLineRange(1, 0, 1);

suite('SearchResult', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
		instantiationService.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));
		instantiationService.stubPromise(IReplaceService, {});
		instantiationService.stub(IReplaceService, 'replace', () => Promise.resolve(null));
		instantiationService.stub(ILabelService, new MockLabelService());
		instantiationService.stub(ILogService, new NullLogService());
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('Line Match', function () {
		const fileMatch = aFileMatch('folder/file.txt', null!);
		const lineMatch = new Match(fileMatch, ['0 foo bar'], new OneLineRange(0, 2, 5), new OneLineRange(1, 0, 5));
		assert.strictEqual(lineMatch.text(), '0 foo bar');
		assert.strictEqual(lineMatch.range().startLineNumber, 2);
		assert.strictEqual(lineMatch.range().endLineNumber, 2);
		assert.strictEqual(lineMatch.range().startColumn, 1);
		assert.strictEqual(lineMatch.range().endColumn, 6);
		assert.strictEqual(lineMatch.id(), 'file:///folder/file.txt>[2,1 -> 2,6]foo');

		assert.strictEqual(lineMatch.fullMatchText(), 'foo');
		assert.strictEqual(lineMatch.fullMatchText(true), '0 foo bar');
	});

	test('Line Match - Remove', function () {
		const fileMatch = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo bar', new OneLineRange(1, 0, 3)));
		const lineMatch = fileMatch.matches()[0];
		fileMatch.remove(lineMatch);
		assert.strictEqual(fileMatch.matches().length, 0);
	});

	test('File Match', function () {
		let fileMatch = aFileMatch('folder/file.txt', aSearchResult());
		assert.strictEqual(fileMatch.matches().length, 0);
		assert.strictEqual(fileMatch.resource.toString(), 'file:///folder/file.txt');
		assert.strictEqual(fileMatch.name(), 'file.txt');

		fileMatch = aFileMatch('file.txt', aSearchResult());
		assert.strictEqual(fileMatch.matches().length, 0);
		assert.strictEqual(fileMatch.resource.toString(), 'file:///file.txt');
		assert.strictEqual(fileMatch.name(), 'file.txt');
	});

	test('File Match: Select an existing match', function () {
		const testObject = aFileMatch(
			'folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));

		testObject.setSelectedMatch(testObject.matches()[0]);

		assert.strictEqual(testObject.matches()[0], testObject.getSelectedMatch());
	});

	test('File Match: Select non existing match', function () {
		const testObject = aFileMatch(
			'folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
		const target = testObject.matches()[0];
		testObject.remove(target);

		testObject.setSelectedMatch(target);

		assert.strictEqual(testObject.getSelectedMatch(), null);
	});

	test('File Match: isSelected return true for selected match', function () {
		const testObject = aFileMatch(
			'folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
		const target = testObject.matches()[0];
		testObject.setSelectedMatch(target);

		assert.ok(testObject.isMatchSelected(target));
	});

	test('File Match: isSelected return false for un-selected match', function () {
		const testObject = aFileMatch('folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
		testObject.setSelectedMatch(testObject.matches()[0]);
		assert.ok(!testObject.isMatchSelected(testObject.matches()[1]));
	});

	test('File Match: unselect', function () {
		const testObject = aFileMatch(
			'folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
		testObject.setSelectedMatch(testObject.matches()[0]);
		testObject.setSelectedMatch(null);

		assert.strictEqual(null, testObject.getSelectedMatch());
	});

	test('File Match: unselect when not selected', function () {
		const testObject = aFileMatch(
			'folder/file.txt',
			aSearchResult(),
			new TextSearchMatch('foo', new OneLineRange(1, 0, 3)),
			new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
		testObject.setSelectedMatch(null);

		assert.strictEqual(null, testObject.getSelectedMatch());
	});

	test('Match -> FileMatch -> SearchResult hierarchy exists', function () {

		const searchModel = instantiationService.createInstance(SearchModel);
		const searchResult = instantiationService.createInstance(SearchResult, searchModel);
		const fileMatch = aFileMatch('far/boo', searchResult);
		const lineMatch = new Match(fileMatch, ['foo bar'], new OneLineRange(0, 0, 3), new OneLineRange(1, 0, 3));

		assert(lineMatch.parent() === fileMatch);
		assert(fileMatch.parent() === searchResult.folderMatches()[0]);
	});

	test('Adding a raw match will add a file match with line matches', function () {
		const testObject = aSearchResult();
		const target = [aRawMatch('/1',
			new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
			new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)),
			new TextSearchMatch('preview 2', lineOneRange))];

		addToSearchResult(testObject, target);

		assert.strictEqual(3, testObject.count());

		const actual = testObject.matches();
		assert.strictEqual(1, actual.length);
		assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());

		const actuaMatches = actual[0].matches();
		assert.strictEqual(3, actuaMatches.length);

		assert.strictEqual('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));

		assert.strictEqual('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		assert.strictEqual('preview 2', actuaMatches[2].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[2].range()));
	});

	test('Adding multiple raw matches', function () {
		const testObject = aSearchResult();
		const target = [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))];

		addToSearchResult(testObject, target);

		assert.strictEqual(3, testObject.count());

		const actual = testObject.matches();
		assert.strictEqual(2, actual.length);
		assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());

		let actuaMatches = actual[0].matches();
		assert.strictEqual(2, actuaMatches.length);
		assert.strictEqual('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
		assert.strictEqual('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		actuaMatches = actual[1].matches();
		assert.strictEqual(1, actuaMatches.length);
		assert.strictEqual('preview 2', actuaMatches[0].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
	});

	test('Test that notebook matches get added correctly', function () {
		const testObject = aSearchResult();
		const cell1 = { cellKind: CellKind.Code } as ICellViewModel;
		const cell2 = { cellKind: CellKind.Code } as ICellViewModel;

		sinon.stub(CellMatch.prototype, 'addContext');

		const addFileMatch = sinon.spy(FolderMatch.prototype, "addFileMatch");
		const fileMatch1 = aRawFileMatchWithCells('/1',
			{
				cell: cell1,
				index: 0,
				contentResults: [
					new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				],
				webviewResults: [
					new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)),
					new TextSearchMatch('preview 2', lineOneRange)
				]
			},);
		const fileMatch2 = aRawFileMatchWithCells('/2',
			{
				cell: cell2,
				index: 0,
				contentResults: [
					new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				],
				webviewResults: [
					new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)),
					new TextSearchMatch('preview 2', lineOneRange)
				]
			});
		const target = [fileMatch1, fileMatch2];

		addToSearchResult(testObject, target);
		assert.strictEqual(6, testObject.count());
		assert.deepStrictEqual(fileMatch1.cellResults[0].contentResults, (addFileMatch.getCall(0).args[0][0] as IFileMatchWithCells).cellResults[0].contentResults);
		assert.deepStrictEqual(fileMatch1.cellResults[0].webviewResults, (addFileMatch.getCall(0).args[0][0] as IFileMatchWithCells).cellResults[0].webviewResults);
		assert.deepStrictEqual(fileMatch2.cellResults[0].contentResults, (addFileMatch.getCall(0).args[0][1] as IFileMatchWithCells).cellResults[0].contentResults);
		assert.deepStrictEqual(fileMatch2.cellResults[0].webviewResults, (addFileMatch.getCall(0).args[0][1] as IFileMatchWithCells).cellResults[0].webviewResults);
	});

	test('Dispose disposes matches', function () {
		const target1 = sinon.spy();
		const target2 = sinon.spy();

		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange)),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))]);

		testObject.matches()[0].onDispose(target1);
		testObject.matches()[1].onDispose(target2);

		testObject.dispose();

		assert.ok(testObject.isEmpty());
		assert.ok(target1.calledOnce);
		assert.ok(target2.calledOnce);
	});

	test('remove triggers change event', function () {
		const target = sinon.spy();
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange))]);
		const objectToRemove = testObject.matches()[0];
		testObject.onChange(target);

		testObject.remove(objectToRemove);

		assert.ok(target.calledOnce);
		assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
	});

	test('remove array triggers change event', function () {
		const target = sinon.spy();
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange)),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))]);
		const arrayToRemove = testObject.matches();
		testObject.onChange(target);

		testObject.remove(arrayToRemove);

		assert.ok(target.calledOnce);
		assert.deepStrictEqual([{ elements: arrayToRemove, removed: true }], target.args[0]);
	});

	test('Removing all line matches and adding back will add file back to result', function () {
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange))]);
		const target = testObject.matches()[0];
		const matchToRemove = target.matches()[0];
		target.remove(matchToRemove);

		assert.ok(testObject.isEmpty());
		target.add(matchToRemove, true);

		assert.strictEqual(1, testObject.fileCount());
		assert.strictEqual(target, testObject.matches()[0]);
	});

	test('replace should remove the file match', function () {
		const voidPromise = Promise.resolve(null);
		instantiationService.stub(IReplaceService, 'replace', voidPromise);
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange))]);

		testObject.replace(testObject.matches()[0]);

		return voidPromise.then(() => assert.ok(testObject.isEmpty()));
	});

	test('replace should trigger the change event', function () {
		const target = sinon.spy();
		const voidPromise = Promise.resolve(null);
		instantiationService.stub(IReplaceService, 'replace', voidPromise);
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange))]);
		testObject.onChange(target);
		const objectToRemove = testObject.matches()[0];

		testObject.replace(objectToRemove);

		return voidPromise.then(() => {
			assert.ok(target.calledOnce);
			assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
		});
	});

	test('replaceAll should remove all file matches', function () {
		const voidPromise = Promise.resolve(null);
		instantiationService.stubPromise(IReplaceService, 'replace', voidPromise);
		const testObject = aSearchResult();
		addToSearchResult(testObject, [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', lineOneRange)),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))]);

		testObject.replaceAll(null!);

		return voidPromise.then(() => assert.ok(testObject.isEmpty()));
	});

	test('batchRemove should trigger the onChange event correctly', function () {
		const target = sinon.spy();
		const testObject = getPopulatedSearchResult();

		const folderMatch = testObject.folderMatches()[0];
		const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
		const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];

		const arrayToRemove = [folderMatch, fileMatch, match];
		const expectedArrayResult = folderMatch.allDownstreamFileMatches().concat([fileMatch, match.parent()]);

		testObject.onChange(target);
		testObject.batchRemove(arrayToRemove);

		assert.ok(target.calledOnce);
		assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);
	});

	test('batchReplace should trigger the onChange event correctly', async function () {
		const replaceSpy = sinon.spy();
		instantiationService.stub(IReplaceService, 'replace', (arg: any) => {
			if (Array.isArray(arg)) {
				replaceSpy(arg[0]);
			} else {
				replaceSpy(arg);
			}
			return Promise.resolve();
		});

		const target = sinon.spy();
		const testObject = getPopulatedSearchResult();

		const folderMatch = testObject.folderMatches()[0];
		const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
		const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];

		const firstExpectedMatch = folderMatch.allDownstreamFileMatches()[0];

		const arrayToRemove = [folderMatch, fileMatch, match];

		testObject.onChange(target);
		await testObject.batchReplace(arrayToRemove);

		assert.ok(target.calledOnce);
		sinon.assert.calledThrice(replaceSpy);
		sinon.assert.calledWith(replaceSpy.firstCall, firstExpectedMatch);
		sinon.assert.calledWith(replaceSpy.secondCall, fileMatch);
		sinon.assert.calledWith(replaceSpy.thirdCall, match);
	});

	test('Creating a model with nested folders should create the correct structure', function () {
		const testObject = getPopulatedSearchResultForTreeTesting();

		const root0 = testObject.folderMatches()[0];
		const root1 = testObject.folderMatches()[1];
		const root2 = testObject.folderMatches()[2];
		const root3 = testObject.folderMatches()[3];

		const root0DownstreamFiles = root0.allDownstreamFileMatches();
		assert.deepStrictEqual(root0DownstreamFiles, [...root0.fileMatchesIterator(), ...getFolderMatchAtIndex(root0, 0).fileMatchesIterator()]);
		assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).allDownstreamFileMatches(), Array.from(getFolderMatchAtIndex(root0, 0).fileMatchesIterator()));
		assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root0, 0), 0).parent(), getFolderMatchAtIndex(root0, 0));
		assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).parent(), root0);
		assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).closestRoot, root0);
		root0DownstreamFiles.forEach((e) => {
			assert.deepStrictEqual(e.closestRoot, root0);
		});

		const root1DownstreamFiles = root1.allDownstreamFileMatches();
		assert.deepStrictEqual(root1.allDownstreamFileMatches(), [...root1.fileMatchesIterator(), ...getFolderMatchAtIndex(root1, 0).fileMatchesIterator()]); // excludes the matches from nested root
		assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root1, 0), 0).parent(), getFolderMatchAtIndex(root1, 0));
		root1DownstreamFiles.forEach((e) => {
			assert.deepStrictEqual(e.closestRoot, root1);
		});

		const root2DownstreamFiles = root2.allDownstreamFileMatches();
		assert.deepStrictEqual(root2DownstreamFiles, Array.from(root2.fileMatchesIterator()));
		assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).parent(), root2);
		assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).closestRoot, root2);


		const root3DownstreamFiles = root3.allDownstreamFileMatches();
		const root3Level3Folder = getFolderMatchAtIndex(getFolderMatchAtIndex(root3, 0), 0);
		assert.deepStrictEqual(root3DownstreamFiles, [...root3.fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 0).fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 1).fileMatchesIterator()].flat());
		assert.deepStrictEqual(root3Level3Folder.allDownstreamFileMatches(), getFolderMatchAtIndex(root3, 0).allDownstreamFileMatches());

		assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root3Level3Folder, 1), 0).parent(), getFolderMatchAtIndex(root3Level3Folder, 1));
		assert.deepStrictEqual(getFolderMatchAtIndex(root3Level3Folder, 1).parent(), root3Level3Folder);
		assert.deepStrictEqual(root3Level3Folder.parent(), getFolderMatchAtIndex(root3, 0));

		root3DownstreamFiles.forEach((e) => {
			assert.deepStrictEqual(e.closestRoot, root3);
		});
	});

	test('Removing an intermediate folder should call OnChange() on all downstream file matches', function () {
		const target = sinon.spy();
		const testObject = getPopulatedSearchResultForTreeTesting();

		const folderMatch = getFolderMatchAtIndex(getFolderMatchAtIndex(getFolderMatchAtIndex(testObject.folderMatches()[3], 0), 0), 0);

		const expectedArrayResult = folderMatch.allDownstreamFileMatches();

		testObject.onChange(target);
		testObject.remove(folderMatch);
		assert.ok(target.calledOnce);
		assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false, clearingAll: false }], target.args[0]);
	});

	test('Replacing an intermediate folder should remove all downstream folders and file matches', async function () {
		const target = sinon.spy();
		const testObject = getPopulatedSearchResultForTreeTesting();

		const folderMatch = getFolderMatchAtIndex(testObject.folderMatches()[3], 0);

		const expectedArrayResult = folderMatch.allDownstreamFileMatches();

		testObject.onChange(target);
		await testObject.batchReplace([folderMatch]);
		assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);

	});

	function aFileMatch(path: string, searchResult: SearchResult | undefined, ...lineMatches: ITextSearchMatch[]): FileMatch {
		if (!searchResult) {
			searchResult = aSearchResult();
		}
		const rawMatch: IFileMatch = {
			resource: URI.file('/' + path),
			results: lineMatches
		};
		const root = searchResult?.folderMatches()[0];
		return instantiationService.createInstance(FileMatch, {
			pattern: ''
		}, undefined, undefined, root, rawMatch, null, '');
	}

	function aSearchResult(): SearchResult {
		const searchModel = instantiationService.createInstance(SearchModel);
		searchModel.searchResult.query = {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		};
		return searchModel.searchResult;
	}

	function aRawMatch(resource: string, ...results: ITextSearchMatch[]): IFileMatch {
		return { resource: createFileUriFromPathFromRoot(resource), results };
	}

	function aRawFileMatchWithCells(resource: string, ...cellMatches: ICellMatch[]): IFileMatchWithCells {
		return {
			resource: createFileUriFromPathFromRoot(resource),
			cellResults: cellMatches
		};
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IThemeService, new TestThemeService());
		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);
		return instantiationService.createInstance(ModelService);
	}

	function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		return instantiationService.createInstance(NotebookEditorWidgetService);
	}

	function getPopulatedSearchResult() {
		const testObject = aSearchResult();

		testObject.query = {
			type: QueryType.Text,
			contentPattern: { pattern: 'foo' },
			folderQueries: [{
				folder: createFileUriFromPathFromRoot('/voo')
			},
			{ folder: createFileUriFromPathFromRoot('/with') },
			]
		};

		addToSearchResult(testObject, [
			aRawMatch('/voo/foo.a',
				new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
			aRawMatch('/with/path/bar.b',
				new TextSearchMatch('preview 3', lineOneRange)),
			aRawMatch('/with/path.c',
				new TextSearchMatch('preview 4', lineOneRange), new TextSearchMatch('preview 5', lineOneRange)),
		]);
		return testObject;
	}

	function getPopulatedSearchResultForTreeTesting() {
		const testObject = aSearchResult();

		testObject.query = {
			type: QueryType.Text,
			contentPattern: { pattern: 'foo' },
			folderQueries: [{
				folder: createFileUriFromPathFromRoot('/voo')
			},
			{
				folder: createFileUriFromPathFromRoot('/with')
			},
			{
				folder: createFileUriFromPathFromRoot('/with/test')
			},
			{
				folder: createFileUriFromPathFromRoot('/eep')
			},
			]
		};
		/***
		 * file structure looks like:
		 * *voo/
		 * |- foo.a
		 * |- beep
		 *    |- foo.c
		 * 	  |- boop.c
		 * *with/
		 * |- path
		 *    |- bar.b
		 * |- path.c
		 * |- *test/
		 *    |- woo.c
		 * eep/
		 *    |- bar
		 *       |- goo
		 *           |- foo
		 *              |- here.txt
		 * 			 |- ooo
		 *              |- there.txt
		 *    |- eyy.y
		 */

		addToSearchResult(testObject, [
			aRawMatch('/voo/foo.a',
				new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
			aRawMatch('/voo/beep/foo.c',
				new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
			aRawMatch('/voo/beep/boop.c',
				new TextSearchMatch('preview 3', lineOneRange)),
			aRawMatch('/with/path.c',
				new TextSearchMatch('preview 4', lineOneRange), new TextSearchMatch('preview 5', lineOneRange)),
			aRawMatch('/with/path/bar.b',
				new TextSearchMatch('preview 3', lineOneRange)),
			aRawMatch('/with/test/woo.c',
				new TextSearchMatch('preview 3', lineOneRange)),
			aRawMatch('/eep/bar/goo/foo/here.txt',
				new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange)),
			aRawMatch('/eep/bar/goo/ooo/there.txt',
				new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange)),
			aRawMatch('/eep/eyy.y',
				new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange))
		]);
		return testObject;
	}

	function getFolderMatchAtIndex(parent: FolderMatch, index: number) {
		return Array.from(parent.folderMatchesIterator())[index];
	}

	function getFileMatchAtIndex(parent: FolderMatch, index: number) {
		return Array.from(parent.fileMatchesIterator())[index];
	}
});
