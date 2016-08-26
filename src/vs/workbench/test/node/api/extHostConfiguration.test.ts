/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {ExtHostConfiguration} from 'vs/workbench/api/node/extHostConfiguration';
import {MainThreadConfigurationShape} from 'vs/workbench/api/node/extHost.protocol';
import {TPromise} from 'vs/base/common/winjs.base';
import {ConfigurationTarget, ConfigurationEditingErrorCode, IConfigurationEditingError} from 'vs/workbench/services/configuration/common/configurationEditing';

suite('ExtHostConfiguration', function () {

	class RecordingShape extends MainThreadConfigurationShape {
		lastArgs: [ConfigurationTarget, string, any];
		$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> {
			this.lastArgs = [target, key, value];
			return TPromise.as(void 0);
		}
	};

	function createExtHostConfiguration(data: any = {}, shape?: MainThreadConfigurationShape) {
		if (!shape) {
			shape = new class extends MainThreadConfigurationShape { };
		}
		const result = new ExtHostConfiguration(shape);
		result.$acceptConfigurationChanged(data);
		return result;
	}

	test('check illegal state', function () {
		assert.throws(() => new ExtHostConfiguration(new class extends MainThreadConfigurationShape { }).getConfiguration('foo'));
	});

	test('udate / section to key', function () {

		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({ foo: { bar: 1, far: 2 } }, shape);

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

	test('update / error-state not OK', function () {

		const shape = new class extends MainThreadConfigurationShape {
			$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<any> {
				return TPromise.wrapError(<IConfigurationEditingError>{ code: ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, message: 'Unknown Key' }); // something !== OK
			}
		};

		return createExtHostConfiguration({}, shape)
			.getConfiguration('')
			.update('', true, false)
			.then(() => assert.ok(false), err => { /* expecting rejection */});
	});
});
