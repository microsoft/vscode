/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Parser = require('../jsonParser');
import SchemaService = require('../jsonSchemaService');
import JsonSchema = require('../jsonSchema');
import {JSONCompletion} from '../jsonCompletion';
import {XHROptions, XHRResponse} from 'request-light';

import {CompletionItem, CompletionItemKind, CompletionOptions, TextDocument, TextDocumentIdentifier, Range, Position, TextEdit} from 'vscode-languageserver';
import {applyEdits} from './textEditSupport';

suite('JSON Completion', () => {

	let requestService = function(options: XHROptions): Promise<XHRResponse> {
		return Promise.reject<XHRResponse>({ responseText: '', status: 404 });
	}

	let assertCompletion = function(completions: CompletionItem[], label: string, documentation?: string, document?: TextDocument, resultText?: string) {
		let matches = completions.filter(function(completion: CompletionItem) {
			return completion.label === label && (!documentation || completion.documentation === documentation);
		});
		assert.equal(matches.length, 1, label + " should only existing once: Actual: " + completions.map(c => c.label).join(', '));
		if (document && resultText) {
			assert.equal(applyEdits(document, [ matches[0].textEdit ]), resultText);
		}
	};


	let testCompletionsFor = function(value: string, stringAfter: string, schema: JsonSchema.IJSONSchema, test: (items: CompletionItem[], document: TextDocument) => void) : Thenable<void> {
		let uri = 'test://test.json';
		let idx = stringAfter ? value.indexOf(stringAfter) : 0;

		let schemaService = new SchemaService.JSONSchemaService(requestService);
		let completionProvider = new JSONCompletion(schemaService);
		if (schema) {
			let id = "http://myschemastore/test1";
			schemaService.registerExternalSchema(id, ["*.json"], schema);
		}

		let document = TextDocument.create(uri, 'json', 0, value);
		let position = Position.create(0, idx);
		let jsonDoc = Parser.parse(value);
		return completionProvider.doComplete(document, position, jsonDoc).then(list => list.items).then(completions => {
			test(completions, document);
			return null;
		})
	};

	test('Complete keys no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "name": "John", "age": 44 }, { /**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'name');
				assertCompletion(result, 'age');
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "/**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'name');
				assertCompletion(result, 'age');
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "n/**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'name');
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "name/**/" }', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'name');
			}),
			testCompletionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", /**/ }', '/**/', null, result => {
				assert.strictEqual(result.length, 1);
				assertCompletion(result, 'number');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete values no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "name": /**/', '/**/', null, result => {
				assert.strictEqual(result.length, 1);
				assertCompletion(result, '"John"');
			}),
			testCompletionsFor('[ { "data": { "key": 1, "data": true } }, { "data": /**/', '/**/', null, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '{}');
				assertCompletion(result, 'true');
				assertCompletion(result, 'false');
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "/**/" } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, '"foo"');
				assertCompletion(result, '"bar"');
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f/**/" } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, '"foo"');
				assertCompletion(result, '"bar"');
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"/**/ } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '"xoo"');
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  /**/ } ]', '/**/', null, result => {
				assert.strictEqual(result.length, 0);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete keys with schema', function(testDone) {
		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b', 'B');
				assertCompletion(result, 'c', 'C');
			}),
			testCompletionsFor('{ "/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b', 'B');
				assertCompletion(result, 'c', 'C');
			}),
			testCompletionsFor('{ "a/**/}', '/**/', schema, (result, document) => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'a', 'A', document, '{ "a": {{0}}');
			}),
			testCompletionsFor('{ a/**/}', '/**/', schema, (result, document) => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'a', 'A', document, '{ "a": {{0}}/**/}');
			}),
			testCompletionsFor('{ "a" = 1;/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'b', 'B');
				assertCompletion(result, 'c', 'C');
			})
		]).then(() => testDone(), (error) => testDone(error));

	});

	test('Complete value with schema', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'a': {
					enum: ['John', 'Jeff', 'George']
				}
			}
		};
		Promise.all([
			testCompletionsFor('{ "a": /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '"John"');
				assertCompletion(result, '"Jeff"');
				assertCompletion(result, '"George"');
			}),

			testCompletionsFor('{ "a": "J/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '"John"');
				assertCompletion(result, '"Jeff"');
			}),

			testCompletionsFor('{ "a": "John"/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '"John"');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete value with schema: booleans, null', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{ "a": /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'true');
				assertCompletion(result, 'false');
			}),
			testCompletionsFor('{ "b": "/**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'true');
				assertCompletion(result, 'false');
				assertCompletion(result, 'null');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with nested schema', function(testDone) {

		let content = '{/**/}';
		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor(content, '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b', 'B');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with required anyOf', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 4);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b', 'B');
				assertCompletion(result, 'c', 'C');
				assertCompletion(result, 'd', 'D');
			}),
			testCompletionsFor('{ "a": "", /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 1);
				assertCompletion(result, 'b', 'B');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with anyOf', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, 'type');
				assertCompletion(result, 'b');
				assertCompletion(result, 'c');
			}),
			testCompletionsFor('{ "type": "appartment", /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 1);
				assertCompletion(result, 'c');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 5);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b1', 'B1');
				assertCompletion(result, 'b2', 'B2');
				assertCompletion(result, 'c', 'C');
				assertCompletion(result, 'd', 'D');
			}),
			testCompletionsFor('{ "b1": "", /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'a', 'A');
				assertCompletion(result, 'b2', 'B2');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf and enums', function(testDone) {

		let schema: JsonSchema.IJSONSchema = {
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
			testCompletionsFor('{/**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 4);
				assertCompletion(result, 'type');
				assertCompletion(result, 'a');
				assertCompletion(result, 'b');
				assertCompletion(result, 'c');
			}),
			testCompletionsFor('{ "type": /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 3);
				assertCompletion(result, '"1"');
				assertCompletion(result, '"2"');
				assertCompletion(result, '"3"');
			}),
			testCompletionsFor('{ "a": { "x": "", "y": "" }, "type": /**/}', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, '"1"');
				assertCompletion(result, '"2"');
			}),
			testCompletionsFor('{ "type": "1", "a" : { /**/ }', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'x');
				assertCompletion(result, 'y');
			}),
			testCompletionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, /**/', '/**/', schema, result => {
				// both alternatives have errors: intellisense proposes all options
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'b');
				assertCompletion(result, 'c');
			}),
			testCompletionsFor('{ "a" : { "x": "", "z":"" }, /**/', '/**/', schema, result => {
				assert.strictEqual(result.length, 2);
				assertCompletion(result, 'type');
				assertCompletion(result, 'c');
			}),
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "\\\\{{}}": "John" }, { "/**/" }', '/**/', null, result => {
				assertCompletion(result, '\\{{}}');
			}),
			testCompletionsFor('[ { "\\\\{{}}": "John" }, { /**/ }', '/**/', null, (result, document) => {
				assertCompletion(result, '\\{{}}', null, document, '[ { "\\\\{{}}": "John" }, { "\\\\\\\\\\{\\{\\}\\}"/**/ }');
			}),
			testCompletionsFor('[ { "name": "\\{" }, { "name": /**/ }', '/**/', null, result => {
				assertCompletion(result, '"\\{"');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping with schema', function(testDone) {
		let schema: JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				'{\\}': {
					default: "{\\}",
					defaultSnippets: [ { body: "{{let}}"} ],
					enum: ['John{\\}']
				}
			}
		};

		Promise.all([
			testCompletionsFor('{ /**/ }', '/**/', schema, (result, document) => {
				assertCompletion(result, '{\\}', null, document, '{ "\\{\\\\\\\\\\}": "{{\\{\\\\\\\\\\}}}"/**/ }');
			}),
			testCompletionsFor('{ "{\\\\}": /**/ }', '/**/', schema, (result, document) => {
				assertCompletion(result, '"{\\\\}"', null, document, '{ "{\\\\}": "\\{\\\\\\\\\\}"/**/ }');
				assertCompletion(result, '"John{\\\\}"', null, document, '{ "{\\\\}": "John\\{\\\\\\\\\\}"/**/ }');
				assertCompletion(result, '"let"', null, document, '{ "{\\\\}": "{{let}}"/**/ }');
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

});

