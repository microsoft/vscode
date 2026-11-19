/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, type IConfigurationOverrides, type IConfigurationUpdateOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentSandboxSettingId, type IAgentSandboxUserConfiguredPaths } from '../../../../../../platform/sandbox/common/settings.js';
import { saveSandboxPathGrant } from '../../../browser/agentSessions/agentHost/agentHostSandboxPathGrant.js';

suite('Agent host sandbox path grant settings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const key = AgentSandboxSettingId.AgentSandboxUserConfiguredPaths;

	test('serializes concurrent grants and saves the offered scope to local user settings', async () => {
		const targets: (ConfigurationTarget | undefined)[] = [];
		const config = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, target?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				targets.push(typeof target === 'number' ? target : undefined);
				await this.setUserConfiguration(key, value);
			}
		}({ [key]: { readonlyPaths: ['/folder', '/other'], deniedPaths: ['/secret'] } });
		await Promise.all([
			saveSandboxPathGrant(config, { path: '/folder', deniedPath: '/folder/file', access: 'readWrite', removedReadonlyPaths: ['/folder'] }, () => true),
			saveSandboxPathGrant(config, { path: '/read', access: 'read' }, () => true),
		]);
		assert.deepStrictEqual({ paths: config.getValue(key), targets }, {
			paths: { readonlyPaths: ['/other', '/read'], deniedPaths: ['/secret'], readwritePaths: ['/folder'] },
			targets: [ConfigurationTarget.USER_LOCAL, ConfigurationTarget.USER_LOCAL],
		});
	});

	test('does not copy workspace settings into user settings', async () => {
		let saved: unknown;
		const config = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				return { ...super.inspect<T>(key), userLocalValue: undefined };
			}
			override async updateValue(_key: string, value: unknown): Promise<void> {
				saved = value;
			}
		}({ [key]: { readwritePaths: ['/workspace-only'] } });
		await saveSandboxPathGrant(config, { path: '/read', access: 'read' }, () => true);
		assert.deepStrictEqual(saved, { readonlyPaths: ['/read'] });
	});

	test('upgrades user read-only grants while preserving unrelated user settings', async () => {
		let saved: unknown;
		const config = new class extends TestConfigurationService {
			override async updateValue(_key: string, value: unknown): Promise<void> {
				saved = value;
			}
		}({ [key]: { readonlyPaths: ['/upgrade', '/reference'], readwritePaths: ['/existing'], deniedPaths: ['/secret'] } });
		await saveSandboxPathGrant(config, { path: '/upgrade', access: 'readWrite', removedReadonlyPaths: ['/upgrade'] }, () => true);
		assert.deepStrictEqual(saved, { readonlyPaths: ['/reference'], readwritePaths: ['/existing', '/upgrade'], deniedPaths: ['/secret'] });
	});

	test('propagates save failures and does not poison later writes', async () => {
		const config = new class extends TestConfigurationService {
			fail = true;
			override async updateValue(key: string, value: unknown): Promise<void> {
				if (this.fail) {
					throw new Error('settings are read-only');
				}
				await this.setUserConfiguration(key, value);
			}
		}();
		const grant = { path: '/read', access: 'read' } as const;
		await assert.rejects(saveSandboxPathGrant(config, grant, () => true), /settings are read-only/);
		config.fail = false;
		await saveSandboxPathGrant(config, grant, () => true);
		assert.deepStrictEqual(config.getValue<IAgentSandboxUserConfiguredPaths>(key), { readonlyPaths: ['/read'] });
	});

	test('does not save a request that expires while queued', async () => {
		const gate = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const config = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				started.complete();
				await gate.p;
				await this.setUserConfiguration(key, value);
			}
		}();
		const first = saveSandboxPathGrant(config, { path: '/first', access: 'read' }, () => true);
		await started.p;
		let current = true;
		const second = saveSandboxPathGrant(config, { path: '/expired', access: 'read' }, () => current);
		current = false;
		gate.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual(config.getValue(key), { readonlyPaths: ['/first'] });
	});
});
