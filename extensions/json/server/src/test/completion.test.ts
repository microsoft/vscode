/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Parser = require('../jsonParser');
import SchemaService = require('../jsonSchemaService');
import JsonSchema = require('../json-toolbox/jsonSchema');
import {JSONCompletion} from '../jsonCompletion';
import {IXHROptions, IXHRResponse} from '../utils/httpRequest';

import {CompletionItem, CompletionItemKind, CompletionOptions, ITextDocument, TextDocumentIdentifier, TextDocumentPosition, Range, Position, TextEdit} from 'vscode-languageserver';

suite('JSON Completion', () => {

	var requestService = function(options: IXHROptions): Promise<IXHRResponse> {
		return Promise.reject<IXHRResponse>({ responseText: '', status: 404 });
	}

	var assertSuggestion = function(completions: CompletionItem[], label: string, documentation?: string) {
		var matches = completions.filter(function(completion: CompletionItem) {
			return completion.label === label && (!documentation || completion.documentation === documentation);
		}).length;
		assert.equal(matches, 1, label + " should only existing once");
	};

	var testSuggestionsFor = function(value: string, stringAfter: string, schema?: JsonSchema.IJSONSchema): Thenable<CompletionItem[]> {
		var uri = 'test://test.json';
		var idx = stringAfter ? value.indexOf(stringAfter) : 0;

		var schemaService = new SchemaService.JSONSchemaService(requestService);
		var completionProvider = new JSONCompletion(schemaService);
		if (schema) {
			var id = "http://myschemastore/test1";
			schemaService.registerExternalSchema(id, ["*.json"], schema);
		}

		var document = ITextDocument.create(uri, value);
		var textDocumentLocation = TextDocumentPosition.create(uri, Position.create(0, idx));
		var jsonDoc = Parser.parse(value);
		return completionProvider.doSuggest(document, textDocumentLocation, jsonDoc).then(list => list.items);
	};



	test('Complete keys no schema', function(testDone) {
		Promise.all([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { /**/ }', '/**/').then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "/**/ }', '/**/').then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "n/**/ }', '/**/').then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name/**/" }', '/**/').then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", /**/ }', '/**/').then((result) => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, 'number');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete values no schema', function(testDone) {
		Promise.all([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name": /**/', '/**/').then((result) => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, '"John"');
			}),
			testSuggestionsFor('[ { "data": { "key": 1, "data": true } }, { "data": /**/', '/**/').then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '{}');
				assertSuggestion(result, 'true');
				assertSuggestion(result, 'false');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "/**/" } ]', '/**/').then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"bar"');
				assertSuggestion(result, '"/**/"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f/**/" } ]', '/**/').then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"bar"');
				assertSuggestion(result, '"f/**/"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"/**/ } ]', '/**/').then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"xoo"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  /**/ } ]', '/**/').then((result) => {
				assert.strictEqual(result.length, 0);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete keys with schema', function(testDone) {
		var schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a': {
					type: 'number',
					description: 'A'
				},
				'b': {
					type: 'string',
					description: 'B'
				},
				'c': {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		Promise.all([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "a/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A');
			}),
			testSuggestionsFor('{ "a" = 1;/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			})
		]).then(() => testDone(), (error) => testDone(error));

	});

	test('Complete value with schema', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a': {
					enum: ['John', 'Jeff', 'George']
				}
			}
		};
		Promise.all([
			testSuggestionsFor('{ "a": /**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
				assertSuggestion(result, '"George"');
			}),

			testSuggestionsFor('{ "a": "J/**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
			}),

			testSuggestionsFor('{ "a": "John"/**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with nested schema', function(testDone) {

		var content = '{/**/}';
		var schema: JsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'a': {
						type: 'number',
						description: 'A'
					},
					'b': {
						type: 'string',
						description: 'B'
					},
				}
			}, {
					type: 'array'
				}]
		};
		Promise.all([
			testSuggestionsFor(content, '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with required anyOf', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
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
		Promise.all([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 4);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "a": "", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, 'b', 'B');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with anyOf', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
			anyOf: [{
				type: 'object',
				properties: {
					'type': {
						enum: ['house']
					},
					'b': {
						type: 'string'
					},
				}
			}, {
					type: 'object',
					properties: {
						'type': {
							enum: ['appartment']
						},
						'c': {
							type: 'string'
						},
					}
				}]
		};
		Promise.all([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": "appartment", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, 'c');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				allOf: [{
					properties: {
						'a': {
							type: 'string',
							description: 'A'
						}
					}
				},
					{
						anyOf: [{
							properties: {
								'b1': {
									type: 'string',
									description: 'B1'
								}
							},
						}, {
								properties: {
									'b2': {
										type: 'string',
										description: 'B2'
									}
								},
							}]
					}]
			}, {
					type: 'object',
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
		Promise.all([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 5);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b1', 'B1');
				assertSuggestion(result, 'b2', 'B2');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "b1": "", /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b2', 'B2');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf and enums', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'type': {
						type: 'string',
						enum: ['1', '2']
					},
					'a': {
						type: 'object',
						properties: {
							'x': {
								type: 'string'
							},
							'y': {
								type: 'string'
							}
						},
						"required": ['x', 'y']
					},
					'b': {}
				},
			}, {
					type: 'object',
					properties: {
						'type': {
							type: 'string',
							enum: ['3']
						},
						'a': {
							type: 'object',
							properties: {
								'x': {
									type: 'string'
								},
								'z': {
									type: 'string'
								}
							},
							"required": ['x', 'z']
						},
						'c': {}
					},
				}]
		};
		Promise.all([
			testSuggestionsFor('{/**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 4);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'a');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
				assertSuggestion(result, '"3"');
			}),
			testSuggestionsFor('{ "a": { "x": "", "y": "" }, "type": /**/}', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { /**/ }', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'x');
				assertSuggestion(result, 'y');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, /**/', '/**/', schema).then((result) => {
				// both alternatives have errors: intellisense proposes all options
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "a" : { "x": "", "z":"" }, /**/', '/**/', schema).then((result) => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'c');
			}),
		]).then(() => testDone(), (error) => testDone(error));
	});
});