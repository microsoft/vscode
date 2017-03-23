/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as model from 'vs/platform/configuration/common/model';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/platform';

suite('ConfigurationService - Model', () => {

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
		let base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('Recursive merge', () => {
		const base = { 'a': { 'b': 1 } };
		model.merge(base, { 'a': { 'b': 2 } }, true);
		assert.deepEqual(base, { 'a': { 'b': 2 } });
	});

	test('simple merge using models', () => {
		let base = new model.ConfigModel(JSON.stringify({ 'a': 1, 'b': 2 }));
		let add = new model.ConfigModel(JSON.stringify({ 'a': 3, 'c': 4 }));
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': 3, 'b': 2, 'c': 4 });
	});

	test('simple merge with an undefined contents', () => {
		let base = new model.ConfigModel(JSON.stringify({ 'a': 1, 'b': 2 }));
		let add = new model.ConfigModel(null);
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': 1, 'b': 2 });

		base = new model.ConfigModel(null);
		add = new model.ConfigModel(JSON.stringify({ 'a': 1, 'b': 2 }));
		result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': 1, 'b': 2 });

		base = new model.ConfigModel(null);
		add = new model.ConfigModel(null);
		result = base.merge(add);
		assert.deepEqual(result.contents, {});
	});

	test('Recursive merge using config models', () => {
		let base = new model.ConfigModel(JSON.stringify({ 'a': { 'b': 1 } }));
		let add = new model.ConfigModel(JSON.stringify({ 'a': { 'b': 2 } }));
		let result = base.merge(add);
		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
	});

	test('Test contents while getting an existing property', () => {
		let testObject = new model.ConfigModel(JSON.stringify({ 'a': 1 }));
		assert.deepEqual(testObject.getContentsFor('a'), 1);

		testObject = new model.ConfigModel(JSON.stringify({ 'a': { 'b': 1 } }));
		assert.deepEqual(testObject.getContentsFor('a'), { 'b': 1 });
	});

	test('Test contents are undefined for non existing properties', () => {
		const testObject = new model.ConfigModel(JSON.stringify({
			awesome: true
		}));

		assert.deepEqual(testObject.getContentsFor('unknownproperty'), undefined);
	});

	test('Test contents are undefined for undefined config', () => {
		const testObject = new model.ConfigModel(null);

		assert.deepEqual(testObject.getContentsFor('unknownproperty'), undefined);
	});

	test('Test configWithOverrides gives all content merged with overrides', () => {
		const testObject = new model.ConfigModel(JSON.stringify({ 'a': 1, 'c': 1, '[b]': { 'a': 2 } }));

		assert.deepEqual(testObject.configWithOverrides('b').contents, { 'a': 2, 'c': 1, '[b]': { 'a': 2 } });
	});

	test('Test configWithOverrides gives empty contents', () => {
		const testObject = new model.ConfigModel(null);

		assert.deepEqual(testObject.configWithOverrides('b').contents, {});
	});

	test('Test update with empty data', () => {
		const testObject = new model.ConfigModel();
		testObject.update('');

		assert.deepEqual(testObject.contents, {});
		assert.deepEqual(testObject.keys, []);

		testObject.update(null);

		assert.deepEqual(testObject.contents, {});
		assert.deepEqual(testObject.keys, []);

		testObject.update(undefined);

		assert.deepEqual(testObject.contents, {});
		assert.deepEqual(testObject.keys, []);
	});

	test('Test registering the same property again', () => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		assert.equal(true, new model.DefaultConfigModel().getContentsFor('a'));
	});

	test('Test registering the language property', () => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
			'id': '[a]',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'[a]': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		assert.equal(undefined, new model.DefaultConfigModel().getContentsFor('[a]'));
	});

});