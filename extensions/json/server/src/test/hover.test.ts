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
import {JSONHover} from '../jsonHover';

import {Hover, ITextDocument, TextDocumentIdentifier, TextDocumentPosition, Range, Position, TextEdit} from 'vscode-languageserver';

suite('JSON Hover', () => {

	function testComputeInfo(value: string, schema: JsonSchema.IJSONSchema, position: Position): Thenable<Hover> {
		var uri = 'test://test.json';

		var schemaService = new SchemaService.JSONSchemaService(requestService);
		var hoverProvider = new JSONHover(schemaService);
		var id = "http://myschemastore/test1";
		schemaService.registerExternalSchema(id, ["*.json"], schema);

		var document = ITextDocument.create(uri, value);
		var textDocumentLocation = TextDocumentPosition.create(uri, position);
		var jsonDoc = Parser.parse(value);
		return hoverProvider.doHover(document, textDocumentLocation, jsonDoc);
	}

	var requestService = function(options: IXHROptions): Promise<IXHRResponse> {
		return Promise.reject<IXHRResponse>({ responseText: '', status: 404 });
	}

	test('Simple schema', function(testDone) {

		var content = '{"a": 42, "b": "hello", "c": false}';
		var schema: JsonSchema.IJSONSchema = {
			type: 'object',
			description: 'a very special object',
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
			testComputeInfo(content, schema, { line: 0, character: 0 }).then((result) => {
				assert.deepEqual(result.contents, ['a very special object']);
			}),
			testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
				assert.deepEqual(result.contents, ['A']);
			}),
			testComputeInfo(content, schema, { line: 0, character: 32 }).then((result) => {
				assert.deepEqual(result.contents, ['C']);
			}),
			testComputeInfo(content, schema, { line: 0, character: 7 }).then((result) => {
				assert.deepEqual(result.contents, ['A']);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Nested schema', function(testDone) {

		var content = '{"a": 42, "b": "hello"}';
		var schema: JsonSchema.IJSONSchema = {
			oneOf: [{
				type: 'object',
				description: 'a very special object',
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
			testComputeInfo(content, schema, { line: 0, character: 9 }).then((result) => {
				assert.deepEqual(result.contents, ['a very special object']);
			}),
			testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
				assert.deepEqual(result.contents, ['A']);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
})