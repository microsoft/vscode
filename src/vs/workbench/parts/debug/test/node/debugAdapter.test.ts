/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import paths = require('vs/base/common/paths');
import platform = require('vs/base/common/platform');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';

suite('Debug - Adapter', () => {
	var adapter: Adapter;
	var extensionFolderPath = 'a/b/c/';
	var rawAdapter = {
		type: 'mock',
		label: 'Mock Debug',
		enableBreakpointsFor: { 'languageIds': [ 'markdown' ] },
		program: './out/mock/mockDebug.js',
		win: {
			runtime: 'winRuntime'
		},
		linux: {
			runtime: 'linuxRuntime'
		},
		osx: {
			runtime: 'osxRuntime'
		},
		configurationAttributes: {
			launch: {
				required: [ 'program' ],
				properties: {
					program: {
						'type': 'string',
						'description': 'Workspace relative path to a text file.',
						'default': 'readme.md'
					}
				}
			}
		},

		initialConfigurations: [
			{
				name: 'Mock-Debug',
				type: 'mock',
				request: 'launch',
				program: 'readme.md'
			}
		]
	}

	setup(() => {
		adapter = new Adapter(rawAdapter, null, extensionFolderPath);
	});

	teardown(() => {
		adapter = null;
	});

	test('adapter attributes', () => {
		assert.equal(adapter.type, rawAdapter.type);
		assert.equal(adapter.label, rawAdapter.label);
		assert.equal(adapter.program, paths.join(extensionFolderPath, rawAdapter.program));
		assert.equal(adapter.runtime, platform.isLinux ? rawAdapter.linux.runtime : platform.isMacintosh ? rawAdapter.osx.runtime : rawAdapter.win.runtime);
		assert.deepEqual(adapter.initialConfigurations, rawAdapter.initialConfigurations);
	});

	test('schema attributes', () => {
		const schemaAttribute = adapter.getSchemaAttributes()[0];
		assert.notDeepEqual(schemaAttribute, rawAdapter.configurationAttributes);
		Object.keys(rawAdapter.configurationAttributes.launch).forEach(key => {
			assert.deepEqual(schemaAttribute[key], rawAdapter.configurationAttributes.launch[key]);
		});

		assert.equal(schemaAttribute['additionalProperties'], false);
		assert.equal(!!schemaAttribute['properties']['request'], true);
		assert.equal(!!schemaAttribute['properties']['name'], true);
		assert.equal(!!schemaAttribute['properties']['type'], true);
		assert.equal(!!schemaAttribute['properties']['preLaunchTask'], true);
	});
});