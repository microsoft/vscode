/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { join } from 'vs/base/common/paths';
import { FolderConfigurationModel, ScopedConfigurationModel, FolderSettingsModel, WorkspaceConfigurationChangeEvent } from 'vs/workbench/services/configuration/common/configurationModels';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

suite('ConfigurationService - Model', () => {

	test('Test scoped configs are undefined', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const testObject = new FolderConfigurationModel(settingsConfig, [], ConfigurationScope.WINDOW);

		assert.equal(testObject.getSectionContents('task'), undefined);
	});

	test('Test consolidate (settings and tasks)', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const tasksConfig = new ScopedConfigurationModel(JSON.stringify({
			awesome: false
		}), '', 'tasks');

		const expected = {
			awesome: true,
			tasks: {
				awesome: false
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [tasksConfig], ConfigurationScope.WINDOW).contents, expected);
	});

	test('Test consolidate (settings and launch)', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const launchConfig = new ScopedConfigurationModel(JSON.stringify({
			awesome: false
		}), '', 'launch');

		const expected = {
			awesome: true,
			launch: {
				awesome: false
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [launchConfig], ConfigurationScope.WINDOW).contents, expected);
	});

	test('Test consolidate (settings and launch and tasks) - launch/tasks wins over settings file', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true,
			launch: {
				launchConfig: 'defined',
				otherLaunchConfig: 'alsoDefined'
			},
			tasks: {
				taskConfig: 'defined',
				otherTaskConfig: 'alsoDefined'
			}
		}));

		const tasksConfig = new ScopedConfigurationModel(JSON.stringify({
			taskConfig: 'overwritten',
		}), '', 'tasks');

		const launchConfig = new ScopedConfigurationModel(JSON.stringify({
			launchConfig: 'overwritten',
		}), '', 'launch');

		const expected = {
			awesome: true,
			launch: {
				launchConfig: 'overwritten',
				otherLaunchConfig: 'alsoDefined'
			},
			tasks: {
				taskConfig: 'overwritten',
				otherTaskConfig: 'alsoDefined'
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [launchConfig, tasksConfig], ConfigurationScope.WINDOW).contents, expected);
		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [tasksConfig, launchConfig], ConfigurationScope.WINDOW).contents, expected);
	});
});

suite('WorkspaceConfigurationChangeEvent', () => {

	test('changeEvent affecting workspace folders', () => {
		let testObject = new WorkspaceConfigurationChangeEvent(new Workspace('id', 'name',
			[new WorkspaceFolder({ index: 0, name: '1', uri: URI.file('folder1') }),
			new WorkspaceFolder({ index: 1, name: '2', uri: URI.file('folder2') }),
			new WorkspaceFolder({ index: 2, name: '3', uri: URI.file('folder3') })]));

		testObject.change(['window.title']);
		testObject.change(['window.zoomLevel'], URI.file('folder1'));
		testObject.change(['workbench.editor.enablePreview'], URI.file('folder2'));
		testObject.change(['window.restoreFullscreen'], URI.file('folder1'));
		testObject.change(['window.restoreWindows'], URI.file('folder2'));

		assert.deepEqual(testObject.affectedKeys, ['window.title', 'window.zoomLevel', 'window.restoreFullscreen', 'workbench.editor.enablePreview', 'window.restoreWindows']);

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