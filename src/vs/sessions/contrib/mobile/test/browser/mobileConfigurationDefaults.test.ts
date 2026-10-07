/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Configuration, ConfigurationModel } from '../../../../../platform/configuration/common/configurationModels.js';
import { DefaultConfiguration } from '../../../../../platform/configuration/common/configurations.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITreatmentWithAssignment, IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { ConfigurationDefaultOverridesContribution, WorkspaceService } from '../../../../../workbench/services/configuration/browser/configurationService.js';
import { ExperimentalSettingsService } from '../../../../../workbench/services/configuration/common/experimentalSettings.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING } from '../../../chat/common/constants.js';
import { mobileConfigurationDefaults } from '../../browser/mobileConfigurationDefaults.js';
import '../../../chat/browser/chat.contribution.js';

suite('Mobile configuration defaults', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const keys = [EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING];
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

	test('entry-owned composer defaults reject experiment reassignment but still allow explicit user choices', async () => {
		const logService = new NullLogService();
		const before = keys.map(key => registry.getConfigurationProperties()[key].default);
		registry.registerDefaultConfigurations([mobileConfigurationDefaults]);
		let contribution: ConfigurationDefaultOverridesContribution | undefined;
		try {
			const requested: string[] = [];
			const processed = new DeferredPromise<void>();
			const assignments = store.add(new ExperimentalSettingsService());
			contribution = store.add(new ConfigurationDefaultOverridesContribution(
				upcastPartial<IWorkbenchAssignmentService>({
					onDidRefetchAssignments: Event.None,
					getTreatmentWithAssignment: async <T extends string | number | boolean>(name: string): Promise<ITreatmentWithAssignment<T>> => {
						requested.push(name);
						const assigned = keys.some(key => name === `config.${key}`);
						return { value: assigned ? true as T : undefined, hasAssignment: Promise.resolve(assigned) };
					},
				}),
				upcastPartial<IExtensionService>({ whenInstalledExtensionsRegistered: async () => true }),
				upcastPartial<WorkspaceService>({ reloadConfiguration: async () => { await processed.complete(); } }),
				upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }),
				logService,
				assignments,
			));
			await processed.p;
			const defaults = await store.add(new DefaultConfiguration(logService)).initialize();
			const empty = ConfigurationModel.createEmptyModel(logService);
			const user = ConfigurationModel.createEmptyModel(logService);
			for (const key of keys) {
				user.setValue(key, true);
			}
			const configuration = new Configuration(defaults, empty, empty, user, empty, empty, new ResourceMap(), empty, new ResourceMap(), logService);
			assert.deepStrictEqual({
				mobileDefaults: keys.map(key => defaults.getValue(key)),
				experimentRequests: requested.filter(name => keys.some(key => name === `config.${key}`)),
				assigned: keys.map(key => assignments.hasAssignment(key)),
				explicitValues: keys.map(key => configuration.getValue(key, {}, undefined)),
				cacheDefaults: mobileConfigurationDefaults.donotCache,
			}, {
				mobileDefaults: [false, false],
				experimentRequests: [],
				assigned: [false, false],
				explicitValues: [true, true],
				cacheDefaults: true,
			});
		} finally {
			contribution?.dispose();
			registry.deregisterDefaultConfigurations([mobileConfigurationDefaults]);
		}
		assert.deepStrictEqual(keys.map(key => registry.getConfigurationProperties()[key].default), before);
	});
});
