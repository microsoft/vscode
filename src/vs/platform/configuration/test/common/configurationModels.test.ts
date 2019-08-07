/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ConfigurationModel, DefaultConfigurationModel, ConfigurationChangeEvent, ConfigurationModelParser, Configuration } from 'vs/platform/configuration/common/configurationModels';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { URI } from 'vs/base/common/uri';

suite('ConfigurationModel', () => {

	test('setValue for a key that has no sections and not defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 } }, ['a.b']);

		testObject.setValue('f', 1);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1 }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b', 'f']);
	});

	test('setValue for a key that has no sections and defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setValue('f', 3);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1 }, 'f': 3 });
		assert.deepEqual(testObject.keys, ['a.b', 'f']);
	});

	test('setValue for a key that has sections and not defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setValue('b.c', 1);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1 }, 'b': { 'c': 1 }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b', 'f', 'b.c']);
	});

	test('setValue for a key that has sections and defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 }, 'b': { 'c': 1 }, 'f': 1 }, ['a.b', 'b.c', 'f']);

		testObject.setValue('b.c', 3);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1 }, 'b': { 'c': 3 }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b', 'b.c', 'f']);
	});

	test('setValue for a key that has sections and sub section not defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setValue('a.c', 1);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1, 'c': 1 }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b', 'f', 'a.c']);
	});

	test('setValue for a key that has sections and sub section defined', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1, 'c': 1 }, 'f': 1 }, ['a.b', 'a.c', 'f']);

		testObject.setValue('a.c', 3);

		assert.deepEqual(testObject.contents, { 'a': { 'b': 1, 'c': 3 }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b', 'a.c', 'f']);
	});

	test('setValue for a key that has sections and last section is added', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': {} }, 'f': 1 }, ['a.b', 'f']);

		testObject.setValue('a.b.c', 1);

		assert.deepEqual(testObject.contents, { 'a': { 'b': { 'c': 1 } }, 'f': 1 });
		assert.deepEqual(testObject.keys, ['a.b.c', 'f']);
	});

	test('removeValue: remove a non existing key', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 2 } }, ['a.b']);

		testObject.removeValue('a.b.c');

		assert.deepEqual(testObject.contents, { 'a': { 'b': 2 } });
		assert.deepEqual(testObject.keys, ['a.b']);
	});

	test('removeValue: remove a single segmented key', () => {
		let testObject = new ConfigurationModel({ 'a': 1 }, ['a']);

		testObject.removeValue('a');

		assert.deepEqual(testObject.contents, {});
		assert.deepEqual(testObject.keys, []);
	});

	test('removeValue: remove a multi segmented key', () => {
		let testObject = new ConfigurationModel({ 'a': { 'b': 1 } }, ['a.b']);

		testObject.removeValue('a.b');

		assert.deepEqual(testObject.contents, {});
		assert.deepEqual(testObject.keys, []);
	});

	test('get overriding configuration model for an existing identifier', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiers: ['c'], contents: { 'a': { 'd': 1 } } }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1 });
	});

	test('get overriding configuration model for an identifier that does not exist', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiers: ['c'], contents: { 'a': { 'd': 1 } } }]);

		assert.deepEqual(testObject.override('xyz').contents, { 'a': { 'b': 1 }, 'f': 1 });
	});

	test('get overriding configuration when one of the keys does not exist in base', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiers: ['c'], contents: { 'a': { 'd': 1 }, 'g': 1 } }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1, 'g': 1 });
	});

	test('get overriding configuration when one of the key in base is not of object type', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiers: ['c'], contents: { 'a': { 'd': 1 }, 'f': { 'g': 1 } } }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': { 'g': 1 } });
	});

	test('get overriding configuration when one of the key in overriding contents is not of object type', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiers: ['c'], contents: { 'a': { 'd': 1 }, 'f': 1 } }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1 });
	});

	test('get overriding configuration if the value of overriding identifier is not object', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiers: ['c'], contents: 'abc' }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1 }, 'f': { 'g': 1 } });
	});

	test('get overriding configuration if the value of overriding identifier is an empty object', () => {
		let testObject = new ConfigurationModel(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiers: ['c'], contents: {} }]);

		assert.deepEqual(testObject.override('c').contents, { 'a': { 'b': 1 }, 'f': { 'g': 1 } });
	});

	test('simple merge', () => {
		let base = new ConfigurationModel({ 'a': 1, 'b': 2 }, ['a', 'b']);
		let add = new ConfigurationModel({ 'a': 3, 'c': 4 }, ['a', 'c']);
		let result = base.merge(add);

		assert.deepEqual(result.contents, { 'a': 3, 'b': 2, 'c': 4 });
		assert.deepEqual(result.keys, ['a', 'b', 'c']);
	});

	test('recursive merge', () => {
		let base = new ConfigurationModel({ 'a': { 'b': 1 } }, ['a.b']);
		let add = new ConfigurationModel({ 'a': { 'b': 2 } }, ['a.b']);
		let result = base.merge(add);

		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
		assert.deepEqual(result.getValue('a'), { 'b': 2 });
		assert.deepEqual(result.keys, ['a.b']);
	});

	test('simple merge overrides', () => {
		let base = new ConfigurationModel({ 'a': { 'b': 1 } }, ['a.b'], [{ identifiers: ['c'], contents: { 'a': 2 } }]);
		let add = new ConfigurationModel({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiers: ['c'], contents: { 'b': 2 } }]);
		let result = base.merge(add);

		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
		assert.deepEqual(result.overrides, [{ identifiers: ['c'], contents: { 'a': 2, 'b': 2 } }]);
		assert.deepEqual(result.override('c').contents, { 'a': 2, 'b': 2 });
		assert.deepEqual(result.keys, ['a.b']);
	});

	test('recursive merge overrides', () => {
		let base = new ConfigurationModel({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f'], [{ identifiers: ['c'], contents: { 'a': { 'd': 1 } } }]);
		let add = new ConfigurationModel({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiers: ['c'], contents: { 'a': { 'e': 2 } } }]);
		let result = base.merge(add);

		assert.deepEqual(result.contents, { 'a': { 'b': 2 }, 'f': 1 });
		assert.deepEqual(result.overrides, [{ identifiers: ['c'], contents: { 'a': { 'd': 1, 'e': 2 } } }]);
		assert.deepEqual(result.override('c').contents, { 'a': { 'b': 2, 'd': 1, 'e': 2 }, 'f': 1 });
		assert.deepEqual(result.keys, ['a.b', 'f']);
	});

	test('merge overrides when frozen', () => {
		let model1 = new ConfigurationModel({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f'], [{ identifiers: ['c'], contents: { 'a': { 'd': 1 } } }]).freeze();
		let model2 = new ConfigurationModel({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiers: ['c'], contents: { 'a': { 'e': 2 } } }]).freeze();
		let result = new ConfigurationModel().merge(model1, model2);

		assert.deepEqual(result.contents, { 'a': { 'b': 2 }, 'f': 1 });
		assert.deepEqual(result.overrides, [{ identifiers: ['c'], contents: { 'a': { 'd': 1, 'e': 2 } } }]);
		assert.deepEqual(result.override('c').contents, { 'a': { 'b': 2, 'd': 1, 'e': 2 }, 'f': 1 });
		assert.deepEqual(result.keys, ['a.b', 'f']);
	});

	test('Test contents while getting an existing property', () => {
		let testObject = new ConfigurationModel({ 'a': 1 });
		assert.deepEqual(testObject.getValue('a'), 1);

		testObject = new ConfigurationModel({ 'a': { 'b': 1 } });
		assert.deepEqual(testObject.getValue('a'), { 'b': 1 });
	});

	test('Test contents are undefined for non existing properties', () => {
		const testObject = new ConfigurationModel({ awesome: true });

		assert.deepEqual(testObject.getValue('unknownproperty'), undefined);
	});

	test('Test override gives all content merged with overrides', () => {
		const testObject = new ConfigurationModel({ 'a': 1, 'c': 1 }, [], [{ identifiers: ['b'], contents: { 'a': 2 } }]);

		assert.deepEqual(testObject.override('b').contents, { 'a': 2, 'c': 1 });
	});
});

suite('CustomConfigurationModel', () => {

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

	test('simple merge using models', () => {
		let base = new ConfigurationModelParser('base');
		base.parseContent(JSON.stringify({ 'a': 1, 'b': 2 }));

		let add = new ConfigurationModelParser('add');
		add.parseContent(JSON.stringify({ 'a': 3, 'c': 4 }));

		let result = base.configurationModel.merge(add.configurationModel);
		assert.deepEqual(result.contents, { 'a': 3, 'b': 2, 'c': 4 });
	});

	test('simple merge with an undefined contents', () => {
		let base = new ConfigurationModelParser('base');
		base.parseContent(JSON.stringify({ 'a': 1, 'b': 2 }));
		let add = new ConfigurationModelParser('add');
		let result = base.configurationModel.merge(add.configurationModel);
		assert.deepEqual(result.contents, { 'a': 1, 'b': 2 });

		base = new ConfigurationModelParser('base');
		add = new ConfigurationModelParser('add');
		add.parseContent(JSON.stringify({ 'a': 1, 'b': 2 }));
		result = base.configurationModel.merge(add.configurationModel);
		assert.deepEqual(result.contents, { 'a': 1, 'b': 2 });

		base = new ConfigurationModelParser('base');
		add = new ConfigurationModelParser('add');
		result = base.configurationModel.merge(add.configurationModel);
		assert.deepEqual(result.contents, {});
	});

	test('Recursive merge using config models', () => {
		let base = new ConfigurationModelParser('base');
		base.parseContent(JSON.stringify({ 'a': { 'b': 1 } }));
		let add = new ConfigurationModelParser('add');
		add.parseContent(JSON.stringify({ 'a': { 'b': 2 } }));
		let result = base.configurationModel.merge(add.configurationModel);
		assert.deepEqual(result.contents, { 'a': { 'b': 2 } });
	});

	test('Test contents while getting an existing property', () => {
		let testObject = new ConfigurationModelParser('test');
		testObject.parseContent(JSON.stringify({ 'a': 1 }));
		assert.deepEqual(testObject.configurationModel.getValue('a'), 1);

		testObject.parseContent(JSON.stringify({ 'a': { 'b': 1 } }));
		assert.deepEqual(testObject.configurationModel.getValue('a'), { 'b': 1 });
	});

	test('Test contents are undefined for non existing properties', () => {
		const testObject = new ConfigurationModelParser('test');
		testObject.parseContent(JSON.stringify({
			awesome: true
		}));

		assert.deepEqual(testObject.configurationModel.getValue('unknownproperty'), undefined);
	});

	test('Test contents are undefined for undefined config', () => {
		const testObject = new ConfigurationModelParser('test');

		assert.deepEqual(testObject.configurationModel.getValue('unknownproperty'), undefined);
	});

	test('Test configWithOverrides gives all content merged with overrides', () => {
		const testObject = new ConfigurationModelParser('test');
		testObject.parseContent(JSON.stringify({ 'a': 1, 'c': 1, '[b]': { 'a': 2 } }));

		assert.deepEqual(testObject.configurationModel.override('b').contents, { 'a': 2, 'c': 1, '[b]': { 'a': 2 } });
	});

	test('Test configWithOverrides gives empty contents', () => {
		const testObject = new ConfigurationModelParser('test');

		assert.deepEqual(testObject.configurationModel.override('b').contents, {});
	});

	test('Test update with empty data', () => {
		const testObject = new ConfigurationModelParser('test');
		testObject.parseContent('');

		assert.deepEqual(testObject.configurationModel.contents, {});
		assert.deepEqual(testObject.configurationModel.keys, []);

		testObject.parseContent(null!);

		assert.deepEqual(testObject.configurationModel.contents, {});
		assert.deepEqual(testObject.configurationModel.keys, []);

		testObject.parseContent(undefined!);

		assert.deepEqual(testObject.configurationModel.contents, {});
		assert.deepEqual(testObject.configurationModel.keys, []);
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
		assert.equal(true, new DefaultConfigurationModel().getValue('a'));
	});
});

suite('ConfigurationChangeEvent', () => {

	test('changeEvent affecting keys for all resources', () => {
		let testObject = new ConfigurationChangeEvent();

		testObject.change(['window.zoomLevel', 'workbench.editor.enablePreview', 'files', '[markdown]']);

		assert.deepEqual(testObject.affectedKeys, ['window.zoomLevel', 'workbench.editor.enablePreview', 'files', '[markdown]']);
		assert.ok(testObject.affectsConfiguration('window.zoomLevel'));
		assert.ok(testObject.affectsConfiguration('window'));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview'));
		assert.ok(testObject.affectsConfiguration('workbench.editor'));
		assert.ok(testObject.affectsConfiguration('workbench'));
		assert.ok(testObject.affectsConfiguration('files'));
		assert.ok(!testObject.affectsConfiguration('files.exclude'));
		assert.ok(testObject.affectsConfiguration('[markdown]'));
	});

	test('changeEvent affecting a root key and its children', () => {
		let testObject = new ConfigurationChangeEvent();

		testObject.change(['launch', 'launch.version', 'tasks']);

		assert.deepEqual(testObject.affectedKeys, ['launch.version', 'tasks']);
		assert.ok(testObject.affectsConfiguration('launch'));
		assert.ok(testObject.affectsConfiguration('launch.version'));
		assert.ok(testObject.affectsConfiguration('tasks'));
	});

	test('changeEvent affecting keys for resources', () => {
		let testObject = new ConfigurationChangeEvent();

		testObject.change(['window.title']);
		testObject.change(['window.zoomLevel'], URI.file('file1'));
		testObject.change(['workbench.editor.enablePreview'], URI.file('file2'));
		testObject.change(['window.restoreFullscreen'], URI.file('file1'));
		testObject.change(['window.restoreWindows'], URI.file('file2'));

		assert.deepEqual(testObject.affectedKeys, ['window.title', 'window.zoomLevel', 'window.restoreFullscreen', 'workbench.editor.enablePreview', 'window.restoreWindows']);

		assert.ok(testObject.affectsConfiguration('window.zoomLevel'));
		assert.ok(testObject.affectsConfiguration('window.zoomLevel', URI.file('file1')));
		assert.ok(!testObject.affectsConfiguration('window.zoomLevel', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen'));
		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file1')));
		assert.ok(!testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window.restoreWindows'));
		assert.ok(testObject.affectsConfiguration('window.restoreWindows', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('window.restoreWindows', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('window.title'));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window'));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview'));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('workbench.editor'));
		assert.ok(testObject.affectsConfiguration('workbench.editor', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('workbench.editor', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('workbench'));
		assert.ok(testObject.affectsConfiguration('workbench', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('workbench', URI.file('file1')));

		assert.ok(!testObject.affectsConfiguration('files'));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('file1')));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('file2')));
	});

	test('merging change events', () => {
		let event1 = new ConfigurationChangeEvent().change(['window.zoomLevel', 'files']);
		let event2 = new ConfigurationChangeEvent().change(['window.title'], URI.file('file1')).change(['[markdown]']);

		let actual = event1.change(event2);

		assert.deepEqual(actual.affectedKeys, ['window.zoomLevel', 'files', '[markdown]', 'window.title']);

		assert.ok(actual.affectsConfiguration('window.zoomLevel'));
		assert.ok(actual.affectsConfiguration('window.zoomLevel', URI.file('file1')));
		assert.ok(actual.affectsConfiguration('window.zoomLevel', URI.file('file2')));

		assert.ok(actual.affectsConfiguration('window'));
		assert.ok(actual.affectsConfiguration('window', URI.file('file1')));
		assert.ok(actual.affectsConfiguration('window', URI.file('file2')));

		assert.ok(actual.affectsConfiguration('files'));
		assert.ok(actual.affectsConfiguration('files', URI.file('file1')));
		assert.ok(actual.affectsConfiguration('files', URI.file('file2')));

		assert.ok(actual.affectsConfiguration('window.title'));
		assert.ok(actual.affectsConfiguration('window.title', URI.file('file1')));
		assert.ok(!actual.affectsConfiguration('window.title', URI.file('file2')));

		assert.ok(actual.affectsConfiguration('[markdown]'));
		assert.ok(actual.affectsConfiguration('[markdown]', URI.file('file1')));
		assert.ok(actual.affectsConfiguration('[markdown]', URI.file('file2')));
	});

});

suite('Configuration', () => {

	test('Test update value', () => {
		const parser = new ConfigurationModelParser('test');
		parser.parseContent(JSON.stringify({ 'a': 1 }));
		const testObject: Configuration = new Configuration(parser.configurationModel, new ConfigurationModel());

		testObject.updateValue('a', 2);

		assert.equal(testObject.getValue('a', {}, undefined), 2);
	});

	test('Test update value after inspect', () => {
		const parser = new ConfigurationModelParser('test');
		parser.parseContent(JSON.stringify({ 'a': 1 }));
		const testObject: Configuration = new Configuration(parser.configurationModel, new ConfigurationModel());

		testObject.inspect('a', {}, undefined);
		testObject.updateValue('a', 2);

		assert.equal(testObject.getValue('a', {}, undefined), 2);
	});


});