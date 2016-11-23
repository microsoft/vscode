/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

suite('Debug - Adapter', () => {
	let adapter: Adapter;
	const extensionFolderPath = 'a/b/c/';
	const rawAdapter = {
		type: 'mock',
		label: 'Mock Debug',
		enableBreakpointsFor: { 'languageIds': ['markdown'] },
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
				required: ['program'],
				properties: {
					program: {
						'type': 'string',
						'description': 'Workspace relative path to a text file.',
						'default': 'readme.md'
					}
				}
			}
		},
		variables: null,
		initialConfigurations: [
			{
				name: 'Mock-Debug',
				type: 'mock',
				request: 'launch',
				program: 'readme.md'
			}
		]
	};

	setup(() => {
		adapter = new Adapter(rawAdapter, { extensionFolderPath, id: 'adapter', name: 'myAdapter', version: '1.0.0', publisher: 'vscode', isBuiltin: false, engines: null },
			null, new TestConfigurationService(), null);
	});

	teardown(() => {
		adapter = null;
	});

	test('attributes', () => {
		assert.equal(adapter.type, rawAdapter.type);
		assert.equal(adapter.label, rawAdapter.label);
		assert.equal(adapter.program, paths.join(extensionFolderPath, rawAdapter.program));
		assert.equal(adapter.runtime, platform.isLinux ? rawAdapter.linux.runtime : platform.isMacintosh ? rawAdapter.osx.runtime : rawAdapter.win.runtime);
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

	test('merge', () => {
		const runtimeArgs = ['first arg'];
		adapter.merge({
			type: 'mock',
			runtimeArgs,
			program: 'mockprogram'
		}, {
				name: 'my name',
				id: 'my_id',
				version: '1.0',
				publisher: 'mockPublisher',
				isBuiltin: true,
				extensionFolderPath: 'a/b/c/d',
				engines: null
			});

		assert.deepEqual(adapter.runtimeArgs, runtimeArgs);
		assert.equal(adapter.program, 'a/b/c/d/mockprogram');
	});

	test('initial config file content', () => {
		adapter.getInitialConfigurationContent().then(content => {
			const expected = ['{',
				'	"version": "0.2.0",',
				'	"configurations": [',
				'		{',
				'			"name": "Mock-Debug",',
				'			"type": "mock",',
				'			"request": "launch",',
				'			"program": "readme.md"',
				'		}',
				'	]',
				'}'].join('\n');
			assert.equal(content, expected);
		}, err => assert.fail());
	});
});