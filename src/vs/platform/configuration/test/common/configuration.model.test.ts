/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

suite('Configuration', () => {

	suiteSetup(() => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': true,
					'overridable': true
				}
			}
		});
	});

	test('simple merge', () => {
		let base = new ConfigurationModel<any>({ 'a': 1, 'b': 2 });
		let add = new ConfigurationModel<any>({ 'a': 3, 'c': 4 });
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': 3, 'b': 2, 'c': 4 });
	});

	test('recursive merge', () => {
		let base = new ConfigurationModel({ 'a': { 'b': 1 } });
		let add = new ConfigurationModel({ 'a': { 'b': 2 } });
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
	});

	test('simple merge overrides', () => {
		let base = new ConfigurationModel<any>({ 'a': { 'b': 1 } }, [], [{ identifiers: ['c'], contents: { 'a': 2 } }]);
		let add = new ConfigurationModel<any>({ 'a': { 'b': 2 } }, [], [{ identifiers: ['c'], contents: { 'b': 2 } }]);
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
		assert.deepEqual(result.overrides, [{ identifiers: ['c'], contents: { 'a': 2, 'b': 2 } }]);
	});

	test('recursive merge overrides', () => {
		let base = new ConfigurationModel<any>({ 'a': { 'b': 1 } }, [], [{ identifiers: ['c'], contents: { 'a': { 'd': 1 } } }]);
		let add = new ConfigurationModel<any>({ 'a': { 'b': 2 } }, [], [{ identifiers: ['c'], contents: { 'a': { 'e': 2 } } }]);
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
		assert.deepEqual(result.overrides, [{ identifiers: ['c'], contents: { 'a': { 'd': 1, 'e': 2 } } }]);
	});

	test('merge ignore keys', () => {
		let base = new ConfigurationModel<any>({ 'a': 1, 'b': 2 });
		let add = new ConfigurationModel<any>({ 'a': 3, 'c': 4 });
		let result = base.merge(add);
		assert.deepEqual(result.keys, []);
	});

	test('Test contents while getting an existing property', () => {
		let testObject = new ConfigurationModel({ 'a': 1 });
		assert.deepEqual(testObject.getContentsFor('a'), 1);

		testObject = new ConfigurationModel<any>({ 'a': { 'b': 1 } });
		assert.deepEqual(testObject.getContentsFor('a'), { 'b': 1 });
	});

	test('Test contents are undefined for non existing properties', () => {
		const testObject = new ConfigurationModel({ awesome: true });

		assert.deepEqual(testObject.getContentsFor('unknownproperty'), undefined);
	});

	test('Test override gives all content merged with overrides', () => {
		const testObject = new ConfigurationModel<any>({ 'a': 1, 'c': 1 }, [], [{ identifiers: ['b'], contents: { 'a': 2 } }]);

		assert.deepEqual(testObject.override('b').contents, { 'a': 2, 'c': 1 });
	});
});