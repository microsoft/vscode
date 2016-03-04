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
import {applyEdits} from './textEditSupport';

suite('JSON Completion', () => {

	var requestService = function(options: IXHROptions): Promise<IXHRResponse> {
		return Promise.reject<IXHRResponse>({ responseText: '', status: 404 });
	}

	var assertSuggestion = function(completions: CompletionItem[], label: string, documentation?: string, document?: ITextDocument, resultText?: string) {
		var matches = completions.filter(function(completion: CompletionItem) {
			return completion.label === label && (!documentation || completion.documentation === documentation);
		});
		assert.equal(matches.length, 1, label + " should only existing once: Actual: " + completions.map(c => c.label).join(', '));
		if (document && resultText) {
			assert.equal(applyEdits(document, [ matches[0].textEdit ]), resultText);
		}
	};


	var testSuggestionsFor = function(value: string, stringAfter: string, schema: JsonSchema.IJSONSchema, test: (items: CompletionItem[], document: ITextDocument) => void) : Thenable<void> {
		var uri = 'test://test.json';
		var idx = stringAfter ? value.indexOf(stringAfter) : 0;

		var schemaService = new SchemaService.JSONSchemaService(requestService);
		var completionProvider = new JSONCompletion(schemaService, console);
		if (schema) {
			var id = "http://myschemastore/test1";
			schemaService.registerExternalSchema(id, ["*.json"], schema);
		}

		var document = ITextDocument.create(uri, value);
		var textDocumentLocation = TextDocumentPosition.create(uri, Position.create(0, idx));
		var jsonDoc = Parser.parse(value);
		return completionProvider.doSuggest(document, textDocumentLocation, jsonDoc).then(list => list.items).then(completions => {
			test(completions, document);
			return null;
		})
	};

	test('Complete keys no schema', function(testDone) {
		Promise.all([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { /**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "/**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
				assertSuggestion(result, 'age');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "n/**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name/**/" }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'name');
			}),
			testSuggestionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", /**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, 'number');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete values no schema', function(testDone) {
		Promise.all([
			testSuggestionsFor('[ { "name": "John", "age": 44 }, { "name": /**/', '/**/', null, result => {
				assert.strictEqual(result.length, 1);
				assertSuggestion(result, '"John"');
			}),
			testSuggestionsFor('[ { "data": { "key": 1, "data": true } }, { "data": /**/', '/**/', null, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '{}');
				assertSuggestion(result, 'true');
				assertSuggestion(result, 'false');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "/**/" } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"bar"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f/**/" } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, '"foo"');
				assertSuggestion(result, '"bar"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"/**/ } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"xoo"');
			}),
			testSuggestionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  /**/ } ]', '/**/', null, result => {
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
			testSuggestionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
			}),
			testSuggestionsFor('{ "a/**/}', '/**/', schema, (result, document) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A', document, '{ "a": {{0}}');
			}),
			testSuggestionsFor('{ a/**/}', '/**/', schema, (result, document) => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'a', 'A', document, '{ "a": {{0}}/**/}');
			}),
			testSuggestionsFor('{ "a" = 1;/**/}', '/**/', schema, result => {
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
			testSuggestionsFor('{ "a": /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
				assertSuggestion(result, '"George"');
			}),

			testSuggestionsFor('{ "a": "J/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
				assertSuggestion(result, '"Jeff"');
			}),

			testSuggestionsFor('{ "a": "John"/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"John"');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete value with schema: booleans, null', function(testDone) {

		var schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a': {
					type: 'boolean'
				},
				'b': {
					type: ['boolean', 'null']
				},
			}
		};
		Promise.all([
			testSuggestionsFor('{ "a": /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'true');
				assertSuggestion(result, 'false');
			}),
			testSuggestionsFor('{ "b": "/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'true');
				assertSuggestion(result, 'false');
				assertSuggestion(result, 'null');
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
			testSuggestionsFor(content, '/**/', schema, result => {
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
			testSuggestionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 4);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b', 'B');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "a": "", /**/}', '/**/', schema, result => {
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
			testSuggestionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": "appartment", /**/}', '/**/', schema, result => {
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
			testSuggestionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 5);
				assertSuggestion(result, 'a', 'A');
				assertSuggestion(result, 'b1', 'B1');
				assertSuggestion(result, 'b2', 'B2');
				assertSuggestion(result, 'c', 'C');
				assertSuggestion(result, 'd', 'D');
			}),
			testSuggestionsFor('{ "b1": "", /**/}', '/**/', schema, result => {
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
			testSuggestionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 4);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'a');
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "type": /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
				assertSuggestion(result, '"3"');
			}),
			testSuggestionsFor('{ "a": { "x": "", "y": "" }, "type": /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, '"1"');
				assertSuggestion(result, '"2"');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'x');
				assertSuggestion(result, 'y');
			}),
			testSuggestionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, /**/', '/**/', schema, result => {
				// both alternatives have errors: intellisense proposes all options
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'b');
				assertSuggestion(result, 'c');
			}),
			testSuggestionsFor('{ "a" : { "x": "", "z":"" }, /**/', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertSuggestion(result, 'type');
				assertSuggestion(result, 'c');
			}),
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping no schema', function(testDone) {
		Promise.all([
			testSuggestionsFor('[ { "\\\\{{}}": "John" }, { "/**/" }', '/**/', null, result => {
				assertSuggestion(result, '\\{{}}');
			}),
			testSuggestionsFor('[ { "\\\\{{}}": "John" }, { /**/ }', '/**/', null, (result, document) => {
				assertSuggestion(result, '\\{{}}', null, document, '[ { "\\\\{{}}": "John" }, { "\\\\\\\\\\{\\{\\}\\}"/**/ }');
			}),
			testSuggestionsFor('[ { "name": "\\{" }, { "name": /**/ }', '/**/', null, result => {
				assertSuggestion(result, '"\\{"');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping with schema', function(testDone) {
		var schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'{\\}': {
					default: "{\\}",
					defaultSnippets: [ { body: "{{var}}"} ],
					enum: ['John{\\}']
				}
			}
		};

		Promise.all([
			testSuggestionsFor('{ /**/ }', '/**/', schema, (result, document) => {
				assertSuggestion(result, '{\\}', null, document, '{ "\\{\\\\\\\\\\}": "{{\\{\\\\\\\\\\}}}"/**/ }');
			}),
			testSuggestionsFor('{ "{\\\\}": /**/ }', '/**/', schema, (result, document) => {
				assertSuggestion(result, '"{\\\\}"', null, document, '{ "{\\\\}": "\\{\\\\\\\\\\}"/**/ }');
				assertSuggestion(result, '"John{\\\\}"', null, document, '{ "{\\\\}": "John\\{\\\\\\\\\\}"/**/ }');
				assertSuggestion(result, '"var"', null, document, '{ "{\\\\}": "{{var}}"/**/ }');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

});

