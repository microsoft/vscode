/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');
import path = require('path');
import fs = require('fs');

import { Registry } from 'vs/platform/platform';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import extfs = require('vs/base/node/extfs');
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

suite('ConfigurationService - Node', () => {

	function testFile(callback: (path: string, cleanUp: (callback: () => void) => void) => void): void {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		extfs.mkdirp(newDir, 493, (error) => {
			callback(testFile, (callback) => extfs.del(parentDir, os.tmpdir(), () => { }, callback));
		});
	}

	test('simple', (done: () => void) => {
		testFile((testFile, cleanUp) => {
			fs.writeFileSync(testFile, '{ "foo": "bar" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');

			service.dispose();

			cleanUp(done);
		});
	});

	test('config gets flattened', (done: () => void) => {
		testFile((testFile, cleanUp) => {
			fs.writeFileSync(testFile, '{ "testworkbench.editor.tabs": true }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			const config = service.getConfiguration<{ testworkbench: { editor: { tabs: boolean } } }>();
			assert.ok(config);
			assert.ok(config.testworkbench);
			assert.ok(config.testworkbench.editor);
			assert.equal(config.testworkbench.editor.tabs, true);

			service.dispose();

			cleanUp(done);
		});
	});

	test('error case does not explode', (done: () => void) => {
		testFile((testFile, cleanUp) => {
			fs.writeFileSync(testFile, ',,,,');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);

			service.dispose();

			cleanUp(done);
		});
	});

	test('missing file does not explode', () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

		const config = service.getConfiguration<{ foo: string }>();
		assert.ok(config);

		service.dispose();
	});

	test('reloadConfiguration', (done: () => void) => {
		testFile((testFile, cleanUp) => {
			fs.writeFileSync(testFile, '{ "foo": "bar" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			let config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');

			fs.writeFileSync(testFile, '{ "foo": "changed" }');

			// still outdated
			config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');

			// force a reload to get latest
			service.reloadConfiguration<{ foo: string }>().then(config => {
				assert.ok(config);
				assert.equal(config.foo, 'changed');

				service.dispose();

				cleanUp(done);
			});
		});
	});

	test('model defaults', (done: () => void) => {
		interface ITestSetting {
			configuration: {
				service: {
					testSetting: string;
				}
			};
		}

		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configuration.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		let serviceWithoutFile = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, '__testFile'));
		let setting = serviceWithoutFile.getConfiguration<ITestSetting>();

		assert.ok(setting);
		assert.equal(setting.configuration.service.testSetting, 'isSet');

		testFile((testFile, cleanUp) => {
			fs.writeFileSync(testFile, '{ "testworkbench.editor.tabs": true }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			let setting = service.getConfiguration<ITestSetting>();

			assert.ok(setting);
			assert.equal(setting.configuration.service.testSetting, 'isSet');

			fs.writeFileSync(testFile, '{ "configuration.service.testSetting": "isChanged" }');

			service.reloadConfiguration().then(() => {
				let setting = service.getConfiguration<ITestSetting>();

				assert.ok(setting);
				assert.equal(setting.configuration.service.testSetting, 'isChanged');

				service.dispose();
				serviceWithoutFile.dispose();

				cleanUp(done);
			});
		});
	});

	test('lookup', (done: () => void) => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'lookup.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		testFile((testFile, cleanUp) => {
			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			let res = service.lookup('something.missing');
			assert.strictEqual(res.value, void 0);
			assert.strictEqual(res.default, void 0);
			assert.strictEqual(res.user, void 0);

			res = service.lookup('lookup.service.testSetting');
			assert.strictEqual(res.default, 'isSet');
			assert.strictEqual(res.value, 'isSet');
			assert.strictEqual(res.user, void 0);

			fs.writeFileSync(testFile, '{ "lookup.service.testSetting": "bar" }');

			return service.reloadConfiguration().then(() => {
				res = service.lookup('lookup.service.testSetting');
				assert.strictEqual(res.default, 'isSet');
				assert.strictEqual(res.user, 'bar');
				assert.strictEqual(res.value, 'bar');

				service.dispose();

				cleanUp(done);
			});
		});
	});

	test('lookup with null', (done: () => void) => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_testNull',
			'type': 'object',
			'properties': {
				'lookup.service.testNullSetting': {
					'type': 'null',
				}
			}
		});

		testFile((testFile, cleanUp) => {
			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, testFile));

			let res = service.lookup('lookup.service.testNullSetting');
			assert.strictEqual(res.default, null);
			assert.strictEqual(res.value, null);
			assert.strictEqual(res.user, void 0);

			fs.writeFileSync(testFile, '{ "lookup.service.testNullSetting": null }');

			return service.reloadConfiguration().then(() => {
				res = service.lookup('lookup.service.testNullSetting');
				assert.strictEqual(res.default, null);
				assert.strictEqual(res.value, null);
				assert.strictEqual(res.user, null);

				service.dispose();

				cleanUp(done);
			});
		});
	});
});
