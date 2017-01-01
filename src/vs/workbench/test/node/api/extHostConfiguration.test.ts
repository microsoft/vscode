/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { MainThreadConfigurationShape } from 'vs/workbench/api/node/extHost.protocol';
import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigurationTarget, ConfigurationEditingErrorCode, IConfigurationEditingError } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceConfigurationValues, IWorkspaceConfigurationValue } from 'vs/workbench/services/configuration/common/configuration';

suite('ExtHostConfiguration', function () {

	class RecordingShape extends MainThreadConfigurationShape {
		lastArgs: [ConfigurationTarget, string, any];
		$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> {
			this.lastArgs = [target, key, value];
			return TPromise.as(void 0);
		}
	};

	function createExtHostConfiguration(data: IWorkspaceConfigurationValues = Object.create(null), shape?: MainThreadConfigurationShape) {
		if (!shape) {
			shape = new class extends MainThreadConfigurationShape { };
		}
		return new ExtHostConfiguration(shape, data);
	}

	function createConfigurationValue<T>(value: T): IWorkspaceConfigurationValue<T> {
		return {
			value,
			default: value,
			user: undefined,
			workspace: undefined
		};
	}

	test('getConfiguration fails regression test 1.7.1 -> 1.8 #15552', function () {
		const extHostConfig = createExtHostConfiguration({
			['search.exclude']: createConfigurationValue({ '**/node_modules': true })
		});

		assert.equal(extHostConfig.getConfiguration('search.exclude')['**/node_modules'], true);
		assert.equal(extHostConfig.getConfiguration('search.exclude').get('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').get('exclude')['**/node_modules'], true);

		assert.equal(extHostConfig.getConfiguration('search.exclude').has('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').has('exclude.**/node_modules'), true);
	});

	test('has/get', function () {

		const all = createExtHostConfiguration({
			['farboo.config0']: createConfigurationValue(true),
			['farboo.nested.config1']: createConfigurationValue(42),
			['farboo.nested.config2']: createConfigurationValue('Das Pferd frisst kein Reis.'),
			['farboo.config4']: createConfigurationValue('')
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

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			['farboo.config0']: createConfigurationValue(true),
			['farboo.config4']: createConfigurationValue(38)
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
			['farboo.config0']: createConfigurationValue(true),
			['farboo.config4']: createConfigurationValue(38)
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
			['farboo.get']: createConfigurationValue('get-prop')
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
			['foo.bar']: createConfigurationValue(1),
			['foo.far']: createConfigurationValue(1)
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
			['editor.formatOnSave']: createConfigurationValue(true)
		}, shape);

		allConfig.getConfiguration('editor').update('formatOnSave', { extensions: ['ts'] });
		assert.equal(shape.lastArgs[1], 'editor.formatOnSave');
		assert.deepEqual(shape.lastArgs[2], { extensions: ['ts'] });
	});

	test('bogous data, #15834', function () {
		let oldLogger = console.error;
		let errorLogged = false;

		// workaround until we have a proper logging story
		console.error = (message, args) => {
			errorLogged = true;
		};
		let allConfig;
		try {
			const shape = new RecordingShape();
			allConfig = createExtHostConfiguration({
				['editor.formatOnSave']: createConfigurationValue(true),
				['editor.formatOnSave.extensions']: createConfigurationValue(['ts'])
			}, shape);
		} finally {
			console.error = oldLogger;
		}
		assert.ok(errorLogged);
		assert.ok(allConfig.getConfiguration('').has('editor.formatOnSave'));
		assert.ok(!allConfig.getConfiguration('').has('editor.formatOnSave.extensions'));
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
