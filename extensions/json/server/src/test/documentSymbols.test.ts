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
import {JSONDocumentSymbols} from '../jsonDocumentSymbols';

import {SymbolInformation, SymbolKind, TextDocumentIdentifier, ITextDocument, TextDocumentPosition, Range, Position, TextEdit} from 'vscode-languageserver';

suite('JSON Document Symbols', () => {

	function getOutline(value: string): Promise<SymbolInformation[]> {
		var uri = 'test://test.json';

		var symbolProvider = new JSONDocumentSymbols();

		var document = ITextDocument.create(uri, value);
		var jsonDoc = Parser.parse(value);
		return symbolProvider.compute(document, jsonDoc);
	}

	var assertOutline: any = function(actual: SymbolInformation[], expected: any[], message: string) {
		assert.equal(actual.length, expected.length, message);
		for (var i = 0; i < expected.length; i++) {
			assert.equal(actual[i].name, expected[i].label, message);
			assert.equal(actual[i].kind, expected[i].kind, message);
		}
	};


	test('Base types', function(testDone) {
		var content = '{ "key1": 1, "key2": "foo", "key3" : true }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Number },
			{ label: 'key2', kind: SymbolKind.String },
			{ label: 'key3', kind: SymbolKind.Boolean },
		];

		getOutline(content).then((entries: SymbolInformation[]) => {
			assertOutline(entries, expected);
		}).then(() => testDone(), (error) => testDone(error));
	});

	test('Arrays', function(testDone) {
		var content = '{ "key1": 1, "key2": [ 1, 2, 3 ], "key3" : [ { "k1": 1 }, {"k2": 2 } ] }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Number },
			{ label: 'key2', kind: SymbolKind.Array },
			{ label: 'key3', kind: SymbolKind.Array },
			{ label: 'k1', kind: SymbolKind.Number },
			{ label: 'k2', kind: SymbolKind.Number }
		];

		getOutline(content).then((entries: SymbolInformation[]) => {
			assertOutline(entries, expected);
		}).then(() => testDone(), (error) => testDone(error));
	});

	test('Objects', function(testDone) {
		var content = '{ "key1": { "key2": true }, "key3" : { "k1":  { } }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Module },
			{ label: 'key2', kind: SymbolKind.Boolean },
			{ label: 'key3', kind: SymbolKind.Module },
			{ label: 'k1', kind: SymbolKind.Module }
		];

		getOutline(content).then((entries: SymbolInformation[]) => {
			assertOutline(entries, expected);
		}).then(() => testDone(), (error) => testDone(error));
	});

	test('Outline - object with syntax error', function(testDone) {
		var content = '{ "key1": { "key2": true, "key3":, "key4": false } }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Module },
			{ label: 'key2', kind: SymbolKind.Boolean },
			{ label: 'key4', kind: SymbolKind.Boolean },
		];

		getOutline(content).then((entries: SymbolInformation[]) => {
			assertOutline(entries, expected);
		}).then(() => testDone(), (error) => testDone(error));
	});

});