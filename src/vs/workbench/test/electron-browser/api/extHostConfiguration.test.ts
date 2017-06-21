/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { MainThreadConfigurationShape } from 'vs/workbench/api/node/extHost.protocol';
import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigurationTarget, ConfigurationEditingErrorCode, IConfigurationEditingError } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ConfigurationModel } from 'vs/platform/configuration/common/configuration';
import { TestThreadService } from './testThreadService';

suite('ExtHostConfiguration', function () {

	class RecordingShape extends MainThreadConfigurationShape {
		lastArgs: [ConfigurationTarget, string, any];
		$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> {
			this.lastArgs = [target, key, value];
			return TPromise.as(void 0);
		}
	};

	function createExtHostConfiguration(contents: any = Object.create(null), shape?: MainThreadConfigurationShape) {
		if (!shape) {
			shape = new class extends MainThreadConfigurationShape { };
		}
		return new ExtHostConfiguration(shape, {
			defaults: new ConfigurationModel(contents),
			user: new ConfigurationModel(contents),
			folders: Object.create(null)
		}, new ExtHostWorkspace(new TestThreadService(), null));
	}

	test('getConfiguration fails regression test 1.7.1 -> 1.8 #15552', function () {
		const extHostConfig = createExtHostConfiguration({
			'search': {
				'exclude': {
					'**/node_modules': true
				}
			}
		});

		assert.equal(extHostConfig.getConfiguration('search.exclude')['**/node_modules'], true);
		assert.equal(extHostConfig.getConfiguration('search.exclude').get('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').get('exclude')['**/node_modules'], true);

		assert.equal(extHostConfig.getConfiguration('search.exclude').has('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').has('exclude.**/node_modules'), true);
	});

	test('has/get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'nested': {
					'config1': 42,
					'config2': 'Das Pferd frisst kein Reis.'
				},
				'config4': ''
			}
		});

		const config = all.getConfiguration('farboo');

		assert.ok(config.has('config0'));
		assert.equal(config.get('config0'), true);
		assert.equal(config.get('config4'), '');
		assert.equal(config['config0'], true);
		assert.equal(config['config4'], '');

		assert.ok(config.has('nested.config1'));
		assert.equal(config.get('nested.config1'), 42);
		assert.ok(config.has('nested.config2'));
		assert.equal(config.get('nested.config2'), 'Das Pferd frisst kein Reis.');

		assert.ok(config.has('nested'));
		assert.deepEqual(config.get('nested'), { config1: 42, config2: 'Das Pferd frisst kein Reis.' });
	});

	test('inspect', function () {
		const workspaceUri = URI.file('foo');
		const folders = Object.create(null);
		folders[workspaceUri.toString()] = new ConfigurationModel({
			'editor': {
				'wordWrap': 'bounded'
			}
		}, ['editor.wordWrap']);
		const testObject = new ExtHostConfiguration(new class extends MainThreadConfigurationShape { }, {
			defaults: new ConfigurationModel({
				'editor': {
					'wordWrap': 'off'
				}
			}, ['editor.wordWrap']),
			user: new ConfigurationModel({
				'editor': {
					'wordWrap': 'on'
				}
			}, ['editor.wordWrap']),
			folders
		}, new ExtHostWorkspace(new TestThreadService(), {
			'id': 'foo',
			'roots': [URI.file('foo')],
			'name': 'foo'
		}));

		const actual = testObject.getConfiguration().inspect('editor.wordWrap');
		assert.equal(actual.defaultValue, 'off');
		assert.equal(actual.globalValue, 'on');
		assert.equal(actual.workspaceValue, 'bounded');
	});

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'config4': 38
			}
		});

		let config = all.getConfiguration('farboo.config0');
		assert.equal(config.get(''), undefined);
		assert.equal(config.has(''), false);

		config = all.getConfiguration('farboo');
		assert.equal(config.get('config0'), true);
		assert.equal(config.has('config0'), true);
	});

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'config4': 38
			}
		});

		let config = all.getConfiguration('farboo.config0');
		assert.equal(config.get(''), undefined);
		assert.equal(config.has(''), false);

		config = all.getConfiguration('farboo');
		assert.equal(config.get('config0'), true);
		assert.equal(config.has('config0'), true);
	});

	test('name vs property', function () {
		const all = createExtHostConfiguration({
			'farboo': {
				'get': 'get-prop'
			}
		});
		const config = all.getConfiguration('farboo');

		assert.ok(config.has('get'));
		assert.equal(config.get('get'), 'get-prop');
		assert.deepEqual(config['get'], config.get);
		assert.throws(() => config['get'] = <any>'get-prop');
	});

	test('update/section to key', function () {

		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'foo': {
				'bar': 1,
				'far': 1
			}
		}, shape);

		let config = allConfig.getConfiguration('foo');
		config.update('bar', 42, true);

		assert.equal(shape.lastArgs[1], 'foo.bar');
		assert.equal(shape.lastArgs[2], 42);

		config = allConfig.getConfiguration('');
		config.update('bar', 42, true);
		assert.equal(shape.lastArgs[1], 'bar');

		config.update('foo.bar', 42, true);
		assert.equal(shape.lastArgs[1], 'foo.bar');
	});

	test('update, what is #15834', function () {
		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'editor': {
				'formatOnSave': true
			}
		}, shape);

		allConfig.getConfiguration('editor').update('formatOnSave', { extensions: ['ts'] });
		assert.equal(shape.lastArgs[1], 'editor.formatOnSave');
		assert.deepEqual(shape.lastArgs[2], { extensions: ['ts'] });
	});

	test('update/error-state not OK', function () {

		const shape = new class extends MainThreadConfigurationShape {
			$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<any> {
				return TPromise.wrapError(<IConfigurationEditingError>{ code: ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, message: 'Unknown Key' }); // something !== OK
			}
		};

		return createExtHostConfiguration({}, shape)
			.getConfiguration('')
			.update('', true, false)
			.then(() => assert.ok(false), err => { /* expecting rejection */ });
	});
});
