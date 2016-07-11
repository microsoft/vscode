/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import { DeferredPPromise } from 'vs/test/utils/promiseTestUtils';
import { PPromise } from 'vs/base/common/winjs.base';
import { nullEvent } from 'vs/base/common/timer';
import { SearchModel } from 'vs/workbench/parts/search/common/searchModel';
import URI from 'vs/base/common/uri';
import {IFileMatch, ILineMatch} from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ISearchService, ISearchComplete, ISearchProgressItem } from 'vs/platform/search/common/search';
import { Range } from 'vs/editor/common/core/range';

suite('SearchModel', () => {

	let instantiationService: TestInstantiationService;
	let restoreStubs;

	setup(() => {
		restoreStubs= [];
		instantiationService= new TestInstantiationService();
		instantiationService.stub(ITelemetryService);
	});

	teardown(() => {
		restoreStubs.forEach(element => {
			element.restore();
		});
	});

	test('Search Model: Search adds to results', function () {
		let results= [aRawMatch('file://c:/1', aLineMatch('preview 1', 1, [[1, 3], [4, 7]])), aRawMatch('file://c:/2', aLineMatch('preview 2'))];
		instantiationService.stub(ISearchService, 'search',  PPromise.as({results: results}));

		let testObject= instantiationService.createInstance(SearchModel);
		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		let actual= testObject.searchResult.matches();

		assert.equal(2, actual.length);
		assert.equal('file://c:/1', actual[0].resource().toString());

		let actuaMatches= actual[0].matches();
		assert.equal(2, actuaMatches.length);
		assert.equal('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
		assert.equal('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		actuaMatches= actual[1].matches();
		assert.equal(1, actuaMatches.length);
		assert.equal('preview 2', actuaMatches[0].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
	});

	test('Search Model: Search adds to results during progress', function (done) {
		let results= [aRawMatch('file://c:/1', aLineMatch('preview 1', 1, [[1, 3], [4, 7]])), aRawMatch('file://c:/2', aLineMatch('preview 2'))];
		let promise= new DeferredPPromise<ISearchComplete, ISearchProgressItem>();
		instantiationService.stub(ISearchService, 'search',  promise);

		let testObject= instantiationService.createInstance(SearchModel);
		let result= testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		promise.progress(results[0]);
		promise.progress(results[1]);
		promise.complete({results: []});

		result.done(() => {
			let actual= testObject.searchResult.matches();

			assert.equal(2, actual.length);
			assert.equal('file://c:/1', actual[0].resource().toString());

			let actuaMatches= actual[0].matches();
			assert.equal(2, actuaMatches.length);
			assert.equal('preview 1', actuaMatches[0].text());
			assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
			assert.equal('preview 1', actuaMatches[1].text());
			assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

			actuaMatches= actual[1].matches();
			assert.equal(1, actuaMatches.length);
			assert.equal('preview 2', actuaMatches[0].text());
			assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));

			done();
		});
	});

	test('Search Model: Search reports telemetry on search completed', function () {
		let target= instantiationService.spy(ITelemetryService, 'publicLog');
		let results= [aRawMatch('file://c:/1', aLineMatch('preview 1', 1, [[1, 3], [4, 7]])), aRawMatch('file://c:/2', aLineMatch('preview 2'))];
		instantiationService.stub(ISearchService, 'search',  PPromise.as({results: results}));

		let testObject= instantiationService.createInstance(SearchModel);
		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		assert.ok(target.calledOnce);
		assert.deepEqual(['searchResultsShown', {count: 3, fileCount: 2}], target.args[0]);
	});

	test('Search Model: Search reports timed telemetry on search when progress is not called', function () {
		let target2= sinon.spy();
		stub(nullEvent, 'stop', target2);
		let target1= sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'timedPublicLog', target1);

		instantiationService.stub(ISearchService, 'search',  PPromise.as({results: []}));

		let testObject= instantiationService.createInstance(SearchModel);
		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		assert.ok(target1.calledTwice);
		assert.ok(target1.calledWith('searchResultsFirstRender'));
		assert.ok(target1.calledWith('searchResultsFinished'));
		assert.ok(target2.calledThrice);
	});

	test('Search Model: Search reports timed telemetry on search when progress is called', function (done) {
		let target2= sinon.spy();
		stub(nullEvent, 'stop', target2);
		let target1= sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'timedPublicLog', target1);

		let promise= new DeferredPPromise<ISearchComplete, ISearchProgressItem>();
		instantiationService.stub(ISearchService, 'search',  promise);

		let testObject= instantiationService.createInstance(SearchModel);
		let result= testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		promise.progress(aRawMatch('file://c:/1', aLineMatch('some preview')));
		promise.complete({results: []});

		result.done(() => {
			assert.ok(target1.calledTwice);
			assert.ok(target1.calledWith('searchResultsFirstRender'));
			assert.ok(target1.calledWith('searchResultsFinished'));
			assert.equal(4, target2.callCount);

			done();
		});
	});

	test('Search Model: Search reports timed telemetry on search when error is called', function (done) {
		let target2= sinon.spy();
		stub(nullEvent, 'stop', target2);
		let target1= sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'timedPublicLog', target1);

		let promise= new DeferredPPromise<ISearchComplete, ISearchProgressItem>();
		instantiationService.stub(ISearchService, 'search',  promise);

		let testObject= instantiationService.createInstance(SearchModel);
		let result= testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		promise.error('error');

		result.done(() => {}, () => {
			assert.ok(target1.calledTwice);
			assert.ok(target1.calledWith('searchResultsFirstRender'));
			assert.ok(target1.calledWith('searchResultsFinished'));
			assert.ok(target2.calledThrice);

			done();
		});
	});

	test('Search Model: Search reports timed telemetry on search when error is cancelled error', function (done) {
		let target2= sinon.spy();
		stub(nullEvent, 'stop', target2);
		let target1= sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'timedPublicLog', target1);

		let promise= new DeferredPPromise<ISearchComplete, ISearchProgressItem>();
		instantiationService.stub(ISearchService, 'search',  promise);

		let testObject= instantiationService.createInstance(SearchModel);
		let result= testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		promise.cancel();

		result.done(() => {}, () => {
			assert.ok(target1.calledTwice);
			assert.ok(target1.calledWith('searchResultsFirstRender'));
			assert.ok(target1.calledWith('searchResultsFinished'));
			assert.ok(target2.calledThrice);
			done();
		});
	});

	test('Search Model: Search results are cleared during search', function () {
		let results= [aRawMatch('file://c:/1', aLineMatch('preview 1', 1, [[1, 3], [4, 7]])), aRawMatch('file://c:/2', aLineMatch('preview 2'))];
		instantiationService.stub(ISearchService, 'search',  PPromise.as({results: results}));
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});
		assert.ok(!testObject.searchResult.isEmpty());

		instantiationService.stub(ISearchService, 'search',  new DeferredPPromise<ISearchComplete, ISearchProgressItem>());

		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});
		assert.ok(testObject.searchResult.isEmpty());
	});

	test('Search Model: Previous search is cancelled when new search is called', function () {
		let target= sinon.spy();
		instantiationService.stub(ISearchService, 'search',  new DeferredPPromise((c, e, p) => {}, target));
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);

		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});
		instantiationService.stub(ISearchService, 'search',  new DeferredPPromise<ISearchComplete, ISearchProgressItem>());
		testObject.search({contentPattern: {pattern: 'somestring'}, type: 1});

		assert.ok(target.calledOnce);
	});

	test('Search Model: isReplaceActive return false if no replace text is set', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);

		assert.ok(!testObject.isReplaceActive());
	});

	test('Search Model: isReplaceActive return false if replace text is set to null', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= null;

		assert.ok(!testObject.isReplaceActive());
	});

	test('Search Model: isReplaceActive return false if replace text is set to undefined', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= void 0;

		assert.ok(!testObject.isReplaceActive());
	});

	test('Search Model: isReplaceActive return true if replace text is set to empty string', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= '';

		assert.ok(testObject.isReplaceActive());
	});

	test('Search Model: isReplaceActive return true if replace text is set to non empty string', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= 'some value';

		assert.ok(testObject.isReplaceActive());
	});

	test('Search Model: hasReplaceText return false if no replace text is set', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);

		assert.ok(!testObject.hasReplaceText());
	});

	test('Search Model: hasReplaceText return false if replace text is set to null', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= null;

		assert.ok(!testObject.hasReplaceText());
	});

	test('Search Model: hasReplaceText return false if replace text is set to undefined', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= void 0;

		assert.ok(!testObject.hasReplaceText());
	});

	test('Search Model: hasReplaceText return false if replace text is set to empty string', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= '';

		assert.ok(!testObject.hasReplaceText());
	});

	test('Search Model: hasReplaceText return true if replace text is set to non empty string', function () {
		let testObject:SearchModel= instantiationService.createInstance(SearchModel);
		testObject.replaceText= 'some value';

		assert.ok(testObject.hasReplaceText());
	});

	function aRawMatch(resource: string, ...lineMatches: ILineMatch[]): IFileMatch {
		return { resource: URI.parse(resource), lineMatches };
	}

	function aLineMatch(preview: string, lineNumber: number = 1, offsetAndLengths: number[][] = [[0, 1]]): ILineMatch {
		return { preview, lineNumber, offsetAndLengths };
	}

	function stub(arg1, arg2, arg3) : sinon.SinonStub {
		const stub= sinon.stub(arg1, arg2, arg3);
		restoreStubs.push(stub);
		return stub;
	}

});