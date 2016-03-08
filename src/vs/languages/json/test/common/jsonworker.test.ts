/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import jsonworker = require('vs/languages/json/common/jsonWorker');
import jsonSchema = require('vs/base/common/jsonSchema');
import resourceService = require('vs/editor/common/services/resourceServiceImpl');
import {IResourceService} from 'vs/editor/common/services/resourceService';
import instantiationService = require('vs/platform/instantiation/common/instantiationService');
import mirrorModel = require('vs/editor/common/model/mirrorModel');
import URI from 'vs/base/common/uri';
import SchemaService = require('vs/languages/json/common/jsonSchemaService');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import WinJS = require('vs/base/common/winjs.base');
import modesUtil = require('vs/editor/test/common/modesTestUtils');
import strings = require('vs/base/common/strings');

suite('JSON - Worker', () => {

	var assertOutline:any = function(actual: Modes.IOutlineEntry[], expected: any[], message: string) {
		assert.equal(actual.length, expected.length, message);
		for (var i = 0; i < expected.length; i++) {
			assert.equal(actual[i].label, expected[i].label, message);
			assert.equal(actual[i].type, expected[i].type, message);
			var childrenExpected = expected[i].children || [];
			var childrenActual = actual[i].children || [];
			assertOutline(childrenExpected, childrenActual, message);
		}
	};

	function mockWorkerEnv(url: URI, content: string): { worker: jsonworker.JSONWorker; model: EditorCommon.IMirrorModel; } {
		var mm = mirrorModel.createTestMirrorModelFromString(content, null, url);

		var resourceModelMock: IResourceService = new resourceService.ResourceService();
		resourceModelMock.insert(url, mm);

		var _instantiationService = instantiationService.createInstantiationService({
			resourceService: resourceModelMock
		});
		var worker = _instantiationService.createInstance(jsonworker.JSONWorker, mm.getMode().getId(), []);

		return { worker: worker, model: mm };
	};

	var prepareSchemaServer = function(schema:jsonSchema.IJSONSchema, worker: jsonworker.JSONWorker) : void {
		if (schema) {
			var id = "http://myschemastore/test1";
			var schemaService = <SchemaService.JSONSchemaService> (<any>worker).schemaService;
			schemaService.registerExternalSchema(id, [ "*.json" ], schema);
		}
	}

	var testSuggestionsFor = function(value:string, stringAfter:string, schema?:jsonSchema.IJSONSchema):WinJS.TPromise<Modes.ISuggestResult> {
		var url = URI.parse('test://test.json');
		var env = mockWorkerEnv(url, value);
		prepareSchemaServer(schema, env.worker);

		var idx = stringAfter ? value.indexOf(stringAfter) : 0;
		var position = env.model.getPositionFromOffset(idx);
		return env.worker.suggest(url, position).then(result => result[0]);
	};

	function testComputeInfo(content:string, schema:jsonSchema.IJSONSchema, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IComputeExtraInfoResult> {
		var url = URI.parse('test://test.json');
		var env = mockWorkerEnv(url, content);
		prepareSchemaServer(schema, env.worker);
		return env.worker.computeInfo(url, position);
	}

	var testValueSetFor = function(value:string, schema:jsonSchema.IJSONSchema, selection:string, selectionLength: number, up: boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		var url = URI.parse('test://test.json');
		var env = mockWorkerEnv(url, value);
		prepareSchemaServer(schema, env.worker);

		var pos = env.model.getPositionFromOffset(value.indexOf(selection));
		var range = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column + selectionLength };

		return env.worker.navigateValueSet(url, range, up);
	};

	function getOutline(content: string):WinJS.TPromise<Modes.IOutlineEntry[]> {
		var url = URI.parse('test');
		var workerEnv = mockWorkerEnv(url, content);
		return workerEnv.worker.getOutline(url);
	};

	var assertSuggestion= function(completion:Modes.ISuggestResult, label:string, documentationLabel?: string) {
		var matches = completion.suggestions.filter(function(suggestion: Modes.ISuggestion) {
			return suggestion.label === label && (!documentationLabel || suggestion.documentationLabel === documentationLabel);
		}).length;
		assert.equal(matches, 1, label + " should only existing once");
	};

	test('JSON outline - base types', function(testDone) {
		var content= '{ "key1": 1, "key2": "foo", "key3" : true }';

		var expected= [
			{ label: 'key1', type: 'number'},
			{ label: 'key2', type: 'string'},
			{ label: 'key3', type: 'boolean'},
		];

		getOutline(content).then((entries: Modes.IOutlineEntry[]) => {
			assertOutline(entries, expected);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('JSON outline - arrays', function(testDone) {
		var content= '{ "key1": 1, "key2": [ 1, 2, 3 ], "key3" : [ { "k1": 1 }, {"k2": 2 } ] }';

		var expected= [
			{ label: 'key1', type: 'number'},
			{ label: 'key2', type: 'array'},
			{ label: 'key3', type: 'array', children : [ { label: 'k1', type: 'number'}, { label: 'k2', type: 'number'} ]},
		];

		getOutline(content).then((entries: Modes.IOutlineEntry[]) => {
			assertOutline(entries, expected);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('JSON outline - objects', function(testDone) {
		var content= '{ "key1": { "key2": true }, "key3" : { "k1":  { } }';

		var expected= [
			{ label: 'key1', type: 'object', children : [ { label: 'key2', type: 'boolean'} ] },
			{ label: 'key3', type: 'object', children : [ { label: 'k1', type: 'object'} ] }
		];

		getOutline(content).then((entries: Modes.IOutlineEntry[]) => {
			assertOutline(entries, expected);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('JSON outline - object with syntax error', function(testDone) {
		var content= '{ "key1": { "key2": true, "key3":, "key4": false } }';

		var expected= [
			{ label: 'key1', type: 'object', children : [ { label: 'key2', type: 'boolean'}, { label: 'key4', type: 'boolean'} ] },
		];

		getOutline(content).then((entries: Modes.IOutlineEntry[]) => {
			assertOutline(entries, expected);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});


	test('JSON suggest for keys no schema', function(testDone) {
		WinJS.Promise.join([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { /**/ }', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "/**/ }', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "n/**/ }', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name/**/" }', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", /**/ }', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'number');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest for values no schema', function(testDone) {
		WinJS.Promise.join([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name": /**/', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, '"John"');
			}),
			testSuggestionsFor('[ { "data": { "key": 1, "data": true } }, { "data": /**/', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '{}');
				assertSuggestion(result, 'true');
				assertSuggestion(result, 'false');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "/**/" } ]', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"bar"');
				assertSuggestion(result, '"/**/"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f/**/" } ]', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"f/**/"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"/**/ } ]', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '"xoo"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  /**/ } ]', '/**/').then((result) => {
				assert.strictEqual(result.suggestions.length, 0);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest for keys with schema', function(testDone) {
		var schema:jsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a' : {
					type: 'number',
					description: 'A'
				},
				'b' : {
					type: 'string',
					description: 'B'
				},
				'c' : {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		WinJS.Promise.join([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "a/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'a', 'A');
			}),
			testSuggestionsFor('{ "a" = 1;/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});

	});

	test('JSON suggest for value with schema', function(testDone) {

		var schema:jsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a' : {
					enum: [ 'John', 'Jeff', 'George' ]
				}
			}
		};
		WinJS.Promise.join([
			testSuggestionsFor('{ "a": /**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
				assertSuggestion(result, '"George"');
			}),

			testSuggestionsFor('{ "a": "J/**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
			}),

			testSuggestionsFor('{ "a": "John"/**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '"John"');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest with nested schema', function(testDone) {

		var content = '{/**/}';
		var schema:jsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'a' : {
						type: 'number',
						description: 'A'
					},
					'b' : {
						type: 'string',
						description: 'B'
					},
				}
			}, {
				type: 'array'
			}]
		};
		WinJS.Promise.join([
			testSuggestionsFor(content, '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest with required anyOf', function(testDone) {

		var schema: jsonSchema.IJSONSchema = {
			anyOf: [{
				type: 'object',
				required: ['a', 'b'],
				properties: {
					'a': {
						type: 'string',
						description: 'A'
					},
					'b': {
						type: 'string',
						description: 'B'
					},
				}
			}, {
					type: 'object',
					required: ['c', 'd'],
					properties: {
						'c': {
							type: 'string',
							description: 'C'
						},
						'd': {
							type: 'string',
							description: 'D'
						},
					}
				}]
		};
		WinJS.Promise.join([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 4);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "a": "", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'b', 'B');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest with anyOf', function(testDone) {

		var schema:jsonSchema.IJSONSchema = {
			anyOf: [{
				type: 'object',
				properties: {
					'type' : {
						enum: [ 'house' ]
					},
					'b' : {
						type: 'string'
					},
				}
			}, {
				type: 'object',
				properties: {
					'type' : {
						enum: [ 'appartment' ]
					},
					'c' : {
						type: 'string'
					},
				}
			}]
		};
		WinJS.Promise.join([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": "appartment", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 1);
				assertSuggestion(result, 'c');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest with oneOf', function(testDone) {

		var schema:jsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				allOf: [{
					properties: {
						'a' : {
							type: 'string',
							description: 'A'
						}
					}
				},
				{
					anyOf: [{
						properties: {
							'b1' : {
								type: 'string',
								description: 'B1'
							}
						},
					}, {
						properties: {
							'b2' : {
								type: 'string',
								description: 'B2'
							}
						},
					}]
				}]
			}, {
				type: 'object',
				properties: {
					'c' : {
						type: 'string',
						description: 'C'
					},
					'd' : {
						type: 'string',
						description: 'D'
					},
				}
			}]
		};
		WinJS.Promise.join([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 5);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b1', 'B1');
				assertSuggestion(result, 'b2', 'B2');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "b1": "", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b2', 'B2');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON suggest with oneOf and enums', function(testDone) {

		var schema:jsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'type' : {
						type: 'string',
						enum: [ '1', '2' ]
					},
					'a' : {
						type: 'object',
						properties: {
							'x': {
								type: 'string'
							},
							'y': {
								type: 'string'
							}
						},
						"required" : [ 'x', 'y']
					},
					'b': {}
				},
			}, {
				type: 'object',
				properties: {
					'type' : {
						type: 'string',
						enum: [ '3' ]
					},
					'a' : {
						type: 'object',
						properties: {
							'x': {
								type: 'string'
							},
							'z': {
								type: 'string'
							}
						},
						"required" : [ 'x', 'z']
					},
					'c': {}
				},
			}]
		};
		WinJS.Promise.join([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 4);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'a');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 3);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
				assertSuggestion(result, '"3"');
			}),
			testSuggestionsFor('{ "a": { "x": "", "y": "" }, "type": /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { /**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'x');
				assertSuggestion(result, 'y');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, /**/', '/**/', schema).then((result) => {
				// both alternatives have errors: intellisense proposes all options
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "a" : { "x": "", "z":"" }, /**/', '/**/', schema).then((result) => {
				assert.strictEqual(result.suggestions.length, 2);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'c');
			}),
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON Compute Info', function(testDone) {

		var content = '{"a": 42, "b": "hello", "c": false}';
		var schema:jsonSchema.IJSONSchema = {
			type: 'object',
			description: 'a very special object',
			properties: {
				'a' : {
					type: 'number',
					description: 'A'
				},
				'b' : {
					type: 'string',
					description: 'B'
				},
				'c' : {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		WinJS.Promise.join([
			testComputeInfo(content, schema, {lineNumber:1, column:1}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'a very special object'
					}
				]);
			}),
			testComputeInfo(content, schema, {lineNumber: 1, column: 2}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'A'
					}
				]);
			}),
			testComputeInfo(content, schema, {lineNumber:1, column:33}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'C'
					}
				]);
			}),
			testComputeInfo(content, schema, {lineNumber:1, column:8}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'A'
					}
				]);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('JSON ComputeInfo with nested schema', function(testDone) {

		var content = '{"a": 42, "b": "hello"}';
		var schema:jsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				description: 'a very special object',
				properties: {
					'a' : {
						type: 'number',
						description: 'A'
					},
					'b' : {
						type: 'string',
						description: 'B'
					},
				}
			}, {
				type: 'array'
			}]
		};
		WinJS.Promise.join([
			testComputeInfo(content, schema, {lineNumber:1, column:10}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'a very special object'
					}
				]);
			}),
			testComputeInfo(content, schema, {lineNumber:1, column:2}).then((result) => {
				assert.deepEqual(result.htmlContent, [
					{
						className: 'documentation',
						text: 'A'
					}
				]);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	var assertReplaceResult= function(result:Modes.IInplaceReplaceSupportResult, expected:string) {
		assert.ok(!!result);
		assert.equal(result.value, expected);
	};

	test('JSON value replace', function(testDone) {

		var content = '{ "a" : "error", "b": true }';
		var schema:jsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a' : {
					type: 'string',
					enum : [ 'error', 'warning', 'ignore' ]
				},
				'b' : {
					type: 'boolean'
				}
			}
		};
		WinJS.Promise.join([
			testValueSetFor(content, schema, 'error', 0, true).then((result) => {
				assertReplaceResult(result, '"warning"');
			}),

			testValueSetFor(content, schema, 'error', 0, false).then((result) => {
				assertReplaceResult(result, '"ignore"');
			}),

			testValueSetFor(content, schema, 'true', 0, false).then((result) => {
				assertReplaceResult(result, 'false');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});


});
