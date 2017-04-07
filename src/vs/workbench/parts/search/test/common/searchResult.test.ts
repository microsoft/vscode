/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Match, FileMatch, SearchResult, SearchModel } from 'vs/workbench/parts/search/common/searchModel';
import URI from 'vs/base/common/uri';
import { IFileMatch, ILineMatch } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';

suite('SearchResult', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stubPromise(IReplaceService, {});
		instantiationService.stubPromise(IReplaceService, 'replace', null);
	});

	test('Line Match', function () {
		let fileMatch = aFileMatch('folder/file.txt', null);
		let lineMatch = new Match(fileMatch, 'foo bar', 1, 0, 3);
		assert.equal(lineMatch.text(), 'foo bar');
		assert.equal(lineMatch.range().startLineNumber, 2);
		assert.equal(lineMatch.range().endLineNumber, 2);
		assert.equal(lineMatch.range().startColumn, 1);
		assert.equal(lineMatch.range().endColumn, 4);
		assert.equal('file:///folder/file.txt>1>0foo', lineMatch.id());
	});

	test('Line Match - Remove', function () {
		let fileMatch = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo bar',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}]);
		let lineMatch = fileMatch.matches()[0];
		fileMatch.remove(lineMatch);
		assert.equal(fileMatch.matches().length, 0);
	});

	test('File Match', function () {
		let fileMatch = aFileMatch('folder/file.txt');
		assert.equal(fileMatch.matches(), 0);
		assert.equal(fileMatch.resource().toString(), 'file:///folder/file.txt');
		assert.equal(fileMatch.name(), 'file.txt');

		fileMatch = aFileMatch('file.txt');
		assert.equal(fileMatch.matches(), 0);
		assert.equal(fileMatch.resource().toString(), 'file:///file.txt');
		assert.equal(fileMatch.name(), 'file.txt');
	});

	test('File Match: Select an existing match', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);

		testObject.setSelectedMatch(testObject.matches()[0]);

		assert.equal(testObject.matches()[0], testObject.getSelectedMatch());
	});

	test('File Match: Select non existing match', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);
		let target = testObject.matches()[0];
		testObject.remove(target);

		testObject.setSelectedMatch(target);

		assert.equal(undefined, testObject.getSelectedMatch());
	});

	test('File Match: isSelected return true for selected match', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);
		let target = testObject.matches()[0];
		testObject.setSelectedMatch(target);

		assert.ok(testObject.isMatchSelected(target));
	});

	test('File Match: isSelected return false for un-selected match', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);

		testObject.setSelectedMatch(testObject.matches()[0]);

		assert.ok(!testObject.isMatchSelected(testObject.matches()[1]));
	});

	test('File Match: unselect', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);

		testObject.setSelectedMatch(testObject.matches()[0]);
		testObject.setSelectedMatch(null);

		assert.equal(null, testObject.getSelectedMatch());
	});

	test('File Match: unselect when not selected', function () {
		let testObject = aFileMatch('folder/file.txt', aSearchResult(), ...[{
			preview: 'foo',
			lineNumber: 1,
			offsetAndLengths: [[0, 3]]
		}, {
			preview: 'bar',
			lineNumber: 1,
			offsetAndLengths: [[5, 3]]
		}]);

		testObject.setSelectedMatch(null);

		assert.equal(null, testObject.getSelectedMatch());
	});

	test('Alle Drei Zusammen', function () {
		let searchResult = instantiationService.createInstance(SearchResult, null);
		let fileMatch = aFileMatch('far/boo', searchResult);
		let lineMatch = new Match(fileMatch, 'foo bar', 1, 0, 3);

		assert(lineMatch.parent() === fileMatch);
		assert(fileMatch.parent() === searchResult);
	});

	test('Adding a raw match will add a file match with line matches', function () {
		let testObject = aSearchResult();
		let target = [aRawMatch('file://c:/', aLineMatch('preview 1', 1, [[1, 3], [4, 7]]), aLineMatch('preview 2'))];

		testObject.add(target);

		assert.equal(3, testObject.count());

		let actual = testObject.matches();
		assert.equal(1, actual.length);
		assert.equal('file://c:/', actual[0].resource().toString());

		let actuaMatches = actual[0].matches();
		assert.equal(3, actuaMatches.length);

		assert.equal('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));

		assert.equal('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		assert.equal('preview 2', actuaMatches[2].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[2].range()));
	});

	test('Adding multiple raw matches', function () {
		let testObject = aSearchResult();
		let target = [aRawMatch('file://c:/1', aLineMatch('preview 1', 1, [[1, 3], [4, 7]])), aRawMatch('file://c:/2', aLineMatch('preview 2'))];

		testObject.add(target);

		assert.equal(3, testObject.count());

		let actual = testObject.matches();
		assert.equal(2, actual.length);
		assert.equal('file://c:/1', actual[0].resource().toString());

		let actuaMatches = actual[0].matches();
		assert.equal(2, actuaMatches.length);
		assert.equal('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
		assert.equal('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		actuaMatches = actual[1].matches();
		assert.equal(1, actuaMatches.length);
		assert.equal('preview 2', actuaMatches[0].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
	});

	test('Dispose disposes matches', function () {
		let target1 = sinon.spy();
		let target2 = sinon.spy();

		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1')), aRawMatch('file://c:/2', aLineMatch('preview 2'))]);

		testObject.matches()[0].onDispose(target1);
		testObject.matches()[1].onDispose(target2);

		testObject.dispose();

		assert.ok(testObject.isEmpty());
		assert.ok(target1.calledOnce);
		assert.ok(target2.calledOnce);
	});

	test('remove triggers change event', function () {
		let target = sinon.spy();
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1'))]);
		let objectRoRemove = testObject.matches()[0];
		testObject.onChange(target);

		testObject.remove(objectRoRemove);

		assert.ok(target.calledOnce);
		assert.deepEqual([{ elements: [objectRoRemove], removed: true }], target.args[0]);
	});

	test('remove triggers change event', function () {
		let target = sinon.spy();
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1'))]);
		let objectRoRemove = testObject.matches()[0];
		testObject.onChange(target);

		testObject.remove(objectRoRemove);

		assert.ok(target.calledOnce);
		assert.deepEqual([{ elements: [objectRoRemove], removed: true }], target.args[0]);
	});

	test('Removing all line matches and adding back will add file back to result', function () {
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1'))]);
		let target = testObject.matches()[0];
		let matchToRemove = target.matches()[0];
		target.remove(matchToRemove);

		assert.ok(testObject.isEmpty());
		target.add(matchToRemove, true);

		assert.equal(1, testObject.fileCount());
		assert.equal(target, testObject.matches()[0]);
	});

	test('replace should remove the file match', function () {
		instantiationService.stubPromise(IReplaceService, 'replace', null);
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1'))]);

		testObject.replace(testObject.matches()[0]);

		assert.ok(testObject.isEmpty());
	});

	test('replace should trigger the change event', function () {
		let target = sinon.spy();
		instantiationService.stubPromise(IReplaceService, 'replace', null);
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1'))]);
		testObject.onChange(target);
		let objectRoRemove = testObject.matches()[0];

		testObject.replace(objectRoRemove);

		assert.ok(target.calledOnce);
		assert.deepEqual([{ elements: [objectRoRemove], removed: true }], target.args[0]);
	});

	test('replaceAll should remove all file matches', function () {
		instantiationService.stubPromise(IReplaceService, 'replace', null);
		let testObject = aSearchResult();
		testObject.add([aRawMatch('file://c:/1', aLineMatch('preview 1')), aRawMatch('file://c:/2', aLineMatch('preview 2'))]);

		testObject.replaceAll(null);

		assert.ok(testObject.isEmpty());
	});

	//// ----- utils
	//function lineHasDecorations(model: editor.IModel, lineNumber: number, decorations: { start: number; end: number; }[]): void {
	//    let lineDecorations:typeof decorations = [];
	//    let decs = model.getLineDecorations(lineNumber);
	//    for (let i = 0, len = decs.length; i < len; i++) {
	//        lineDecorations.push({
	//            start: decs[i].range.startColumn,
	//            end: decs[i].range.endColumn
	//        });
	//    }
	//    assert.deepEqual(lineDecorations, decorations);
	//}
	//
	//function lineHasNoDecoration(model: editor.IModel, lineNumber: number): void {
	//    lineHasDecorations(model, lineNumber, []);
	//}
	//
	//function lineHasDecoration(model: editor.IModel, lineNumber: number, start: number, end: number): void {
	//    lineHasDecorations(model, lineNumber, [{
	//        start: start,
	//        end: end
	//    }]);
	//}
	//// ----- end utils
	//
	//test('Model Highlights', function () {
	//
	//    let fileMatch = instantiation.createInstance(FileMatch, null, toUri('folder\\file.txt'));
	//    fileMatch.add(new Match(fileMatch, 'line2', 1, 0, 2));
	//    fileMatch.connect();
	//    lineHasDecoration(oneModel, 2, 1, 3);
	//});
	//
	//test('Dispose', function () {
	//
	//    let fileMatch = instantiation.createInstance(FileMatch, null, toUri('folder\\file.txt'));
	//    fileMatch.add(new Match(fileMatch, 'line2', 1, 0, 2));
	//    fileMatch.connect();
	//    lineHasDecoration(oneModel, 2, 1, 3);
	//
	//    fileMatch.dispose();
	//    lineHasNoDecoration(oneModel, 2);
	//});

	function aFileMatch(path: string, searchResult?: SearchResult, ...lineMatches: ILineMatch[]): FileMatch {
		let rawMatch: IFileMatch = {
			resource: URI.file('/' + path),
			lineMatches: lineMatches
		};
		return instantiationService.createInstance(FileMatch, null, searchResult, rawMatch);
	}

	function aSearchResult(): SearchResult {
		let searchModel = instantiationService.createInstance(SearchModel);
		return searchModel.searchResult;
	}

	function aRawMatch(resource: string, ...lineMatches: ILineMatch[]): IFileMatch {
		return { resource: URI.parse(resource), lineMatches };
	}

	function aLineMatch(preview: string, lineNumber: number = 1, offsetAndLengths: number[][] = [[0, 1]]): ILineMatch {
		return { preview, lineNumber, offsetAndLengths };
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		return instantiationService.createInstance(ModelServiceImpl);
	}
});
