/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { join } from 'vs/base/common/path';
import { Registry } from 'vs/platform/registry/common/platform';
import { WorkspaceConfigurationChangeEvent, StandaloneConfigurationModelParser, AllKeysConfigurationChangeEvent, Configuration } from 'vs/workbench/services/configuration/common/configurationModels';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { ConfigurationChangeEvent, ConfigurationModel, ConfigurationModelParser } from 'vs/platform/configuration/common/configurationModels';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ResourceMap } from 'vs/base/common/map';

suite('FolderSettingsModelParser', () => {

	suiteSetup(() => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': 'FolderSettingsModelParser_1',
			'type': 'object',
			'properties': {
				'FolderSettingsModelParser.window': {
					'type': 'string',
					'default': 'isSet'
				},
				'FolderSettingsModelParser.resource': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE,
					overridable: true
				},
				'FolderSettingsModelParser.application': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'FolderSettingsModelParser.machine': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});
	});

	test('parse all folder settings', () => {
		const testObject = new ConfigurationModelParser('settings', [ConfigurationScope.RESOURCE, ConfigurationScope.WINDOW]);

		testObject.parseContent(JSON.stringify({ 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' }));

		assert.deepEqual(testObject.configurationModel.contents, { 'FolderSettingsModelParser': { 'window': 'window', 'resource': 'resource' } });
	});

	test('parse resource folder settings', () => {
		const testObject = new ConfigurationModelParser('settings', [ConfigurationScope.RESOURCE]);

		testObject.parseContent(JSON.stringify({ 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' }));

		assert.deepEqual(testObject.configurationModel.contents, { 'FolderSettingsModelParser': { 'resource': 'resource' } });
	});

	test('parse overridable resource settings', () => {
		const testObject = new ConfigurationModelParser('settings', [ConfigurationScope.RESOURCE]);

		testObject.parseContent(JSON.stringify({ '[json]': { 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' } }));

		assert.deepEqual(testObject.configurationModel.overrides, [{ 'contents': { 'FolderSettingsModelParser': { 'resource': 'resource' } }, 'identifiers': ['json'] }]);
	});

	test('reprocess folder settings excludes application and machine setting', () => {
		const testObject = new ConfigurationModelParser('settings', [ConfigurationScope.RESOURCE, ConfigurationScope.WINDOW]);

		testObject.parseContent(JSON.stringify({ 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.anotherApplicationSetting': 'executable' }));

		assert.deepEqual(testObject.configurationModel.contents, { 'FolderSettingsModelParser': { 'resource': 'resource', 'anotherApplicationSetting': 'executable' } });

		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': 'FolderSettingsModelParser_2',
			'type': 'object',
			'properties': {
				'FolderSettingsModelParser.anotherApplicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'FolderSettingsModelParser.anotherMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});

		testObject.parse();
		assert.deepEqual(testObject.configurationModel.contents, { 'FolderSettingsModelParser': { 'resource': 'resource' } });
	});

});

suite('StandaloneConfigurationModelParser', () => {

	test('parse tasks stand alone configuration model', () => {
		const testObject = new StandaloneConfigurationModelParser('tasks', 'tasks');

		testObject.parseContent(JSON.stringify({ 'version': '1.1.1', 'tasks': [] }));

		assert.deepEqual(testObject.configurationModel.contents, { 'tasks': { 'version': '1.1.1', 'tasks': [] } });
	});

});

suite('WorkspaceConfigurationChangeEvent', () => {

	test('changeEvent affecting workspace folders', () => {
		let configurationChangeEvent = new ConfigurationChangeEvent();
		configurationChangeEvent.change(['window.title']);
		configurationChangeEvent.change(['window.zoomLevel'], URI.file('folder1'));
		configurationChangeEvent.change(['workbench.editor.enablePreview'], URI.file('folder2'));
		configurationChangeEvent.change(['window.restoreFullscreen'], URI.file('folder1'));
		configurationChangeEvent.change(['window.restoreWindows'], URI.file('folder2'));
		configurationChangeEvent.telemetryData(ConfigurationTarget.WORKSPACE, {});

		let testObject = new WorkspaceConfigurationChangeEvent(configurationChangeEvent, new Workspace('id',
			[new WorkspaceFolder({ index: 0, name: '1', uri: URI.file('folder1') }),
			new WorkspaceFolder({ index: 1, name: '2', uri: URI.file('folder2') }),
			new WorkspaceFolder({ index: 2, name: '3', uri: URI.file('folder3') })]));

		assert.deepEqual(testObject.affectedKeys, ['window.title', 'window.zoomLevel', 'window.restoreFullscreen', 'workbench.editor.enablePreview', 'window.restoreWindows']);
		assert.equal(testObject.source, ConfigurationTarget.WORKSPACE);

		assert.ok(testObject.affectsConfiguration('window.zoomLevel'));
		assert.ok(testObject.affectsConfiguration('window.zoomLevel', URI.file('folder1')));
		assert.ok(testObject.affectsConfiguration('window.zoomLevel', URI.file(join('folder1', 'file1'))));
		assert.ok(!testObject.affectsConfiguration('window.zoomLevel', URI.file('file1')));
		assert.ok(!testObject.affectsConfiguration('window.zoomLevel', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('window.zoomLevel', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('window.zoomLevel', URI.file(join('folder3', 'file3'))));

		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen'));
		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen', URI.file(join('folder1', 'file1'))));
		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen', URI.file('folder1')));
		assert.ok(!testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file1')));
		assert.ok(!testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('window.restoreFullscreen', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('window.restoreFullscreen', URI.file(join('folder3', 'file3'))));

		assert.ok(testObject.affectsConfiguration('window.restoreWindows'));
		assert.ok(testObject.affectsConfiguration('window.restoreWindows', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('window.restoreWindows', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('window.restoreWindows', URI.file('file2')));
		assert.ok(!testObject.affectsConfiguration('window.restoreWindows', URI.file(join('folder1', 'file1'))));
		assert.ok(!testObject.affectsConfiguration('window.restoreWindows', URI.file(join('folder3', 'file3'))));

		assert.ok(testObject.affectsConfiguration('window.title'));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('folder1')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file(join('folder1', 'file1'))));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file(join('folder2', 'file2'))));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('folder3')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file(join('folder3', 'file3'))));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file3')));

		assert.ok(testObject.affectsConfiguration('window'));
		assert.ok(testObject.affectsConfiguration('window', URI.file('folder1')));
		assert.ok(testObject.affectsConfiguration('window', URI.file(join('folder1', 'file1'))));
		assert.ok(testObject.affectsConfiguration('window', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('window', URI.file(join('folder2', 'file2'))));
		assert.ok(testObject.affectsConfiguration('window', URI.file('folder3')));
		assert.ok(testObject.affectsConfiguration('window', URI.file(join('folder3', 'file3'))));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file3')));

		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview'));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('folder1')));
		assert.ok(!testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file(join('folder1', 'file1'))));
		assert.ok(!testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('folder3')));

		assert.ok(testObject.affectsConfiguration('workbench.editor'));
		assert.ok(testObject.affectsConfiguration('workbench.editor', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('workbench.editor', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('workbench.editor', URI.file('folder1')));
		assert.ok(!testObject.affectsConfiguration('workbench.editor', URI.file(join('folder1', 'file1'))));
		assert.ok(!testObject.affectsConfiguration('workbench.editor', URI.file('folder3')));

		assert.ok(testObject.affectsConfiguration('workbench'));
		assert.ok(testObject.affectsConfiguration('workbench', URI.file('folder2')));
		assert.ok(testObject.affectsConfiguration('workbench', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('workbench', URI.file('folder1')));
		assert.ok(!testObject.affectsConfiguration('workbench', URI.file('folder3')));

		assert.ok(!testObject.affectsConfiguration('files'));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('folder1')));
		assert.ok(!testObject.affectsConfiguration('files', URI.file(join('folder1', 'file1'))));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('folder2')));
		assert.ok(!testObject.affectsConfiguration('files', URI.file(join('folder2', 'file2'))));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('folder3')));
		assert.ok(!testObject.affectsConfiguration('files', URI.file(join('folder3', 'file3'))));
	});

});

suite('AllKeysConfigurationChangeEvent', () => {

	test('changeEvent affects keys for any resource', () => {
		const configuraiton = new Configuration(new ConfigurationModel({}, ['window.title', 'window.zoomLevel', 'window.restoreFullscreen', 'workbench.editor.enablePreview', 'window.restoreWindows']),
			new ConfigurationModel(), new ConfigurationModel(), new ConfigurationModel(), new ResourceMap(), new ConfigurationModel(), new ResourceMap(), null!);
		let testObject = new AllKeysConfigurationChangeEvent(configuraiton, ConfigurationTarget.USER, null);

		assert.deepEqual(testObject.affectedKeys, ['window.title', 'window.zoomLevel', 'window.restoreFullscreen', 'workbench.editor.enablePreview', 'window.restoreWindows']);

		assert.ok(testObject.affectsConfiguration('window.zoomLevel'));
		assert.ok(testObject.affectsConfiguration('window.zoomLevel', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window.zoomLevel', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen'));
		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window.restoreFullscreen', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window.restoreWindows'));
		assert.ok(testObject.affectsConfiguration('window.restoreWindows', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('window.restoreWindows', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('window.title'));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window.title', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('window'));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file1')));
		assert.ok(testObject.affectsConfiguration('window', URI.file('file2')));

		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview'));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('workbench.editor.enablePreview', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('workbench.editor'));
		assert.ok(testObject.affectsConfiguration('workbench.editor', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('workbench.editor', URI.file('file1')));

		assert.ok(testObject.affectsConfiguration('workbench'));
		assert.ok(testObject.affectsConfiguration('workbench', URI.file('file2')));
		assert.ok(testObject.affectsConfiguration('workbench', URI.file('file1')));

		assert.ok(!testObject.affectsConfiguration('files'));
		assert.ok(!testObject.affectsConfiguration('files', URI.file('file1')));
	});
});
