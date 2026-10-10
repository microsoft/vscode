/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { ConfigurationTarget, IConfigurationValue } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../platform/workspace/common/workspace.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConfigurationMigration, ConfigurationMigrationWorkbenchContribution, Extensions, IConfigurationMigrationRegistry } from '../../common/configuration.js';

suite('ConfigurationMigrationWorkbenchContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function migrate(includeApplication: boolean | undefined): Promise<ConfigurationTarget[]> {
		const key = includeApplication ? 'agents.voice.voice' : 'configurationMigration.test.default';
		const migration = {
			key,
			includeApplication,
			migrateFn: value => ({ value }),
		} satisfies ConfigurationMigration;
		Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([migration]);

		const targets: ConfigurationTarget[] = [];
		const completed = new DeferredPromise<void>();
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(inspectKey: string): IConfigurationValue<T> {
				return inspectKey === key ? {
					application: { value: 'application' as T },
					user: { value: 'user' as T },
				} : {};
			}

			override updateValue(_key: string, _value: unknown, _overrides?: unknown, target?: ConfigurationTarget): Promise<void> {
				assert.notStrictEqual(target, undefined, 'expected updateValue to be called with a target');
				targets.push(target!);
				if (targets.length === (includeApplication ? 2 : 1)) {
					completed.complete();
				}
				return Promise.resolve();
			}
		}();
		const workspaceService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkbenchState(): WorkbenchState { return WorkbenchState.EMPTY; }
			override getWorkspace() { return { id: 'test', folders: [] }; }
		}();

		disposables.add(new ConfigurationMigrationWorkbenchContribution(configurationService, workspaceService));
		await completed.p;
		return targets;
	}

	test('excludes application configuration by default', async () => {
		assert.deepStrictEqual(await migrate(undefined), [ConfigurationTarget.USER]);
	});

	test('includes application configuration for the opted-in voice migration', async () => {
		assert.deepStrictEqual(await migrate(true), [ConfigurationTarget.APPLICATION, ConfigurationTarget.USER]);
	});
});
