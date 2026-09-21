/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationDefaults, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationService } from '../../../../../platform/configuration/common/configurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { areRemoteSessionToolsEnabled, RemoteSessionToolsEnabledSettingId, remoteSessionToolsWhen } from '../../common/remoteSessions.js';
import '../../browser/remoteSessions.contribution.js';

suite('Remote Sessions Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	test('registers an application-scoped default-off setting with automatic experiments', () => {
		const property = configurationRegistry.getConfigurationProperties()[RemoteSessionToolsEnabledSettingId];
		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope,
			experiment: property.experiment,
		}, {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
		});
	});

	test('runtime and global tool visibility follow live experiment defaults while respecting explicit user settings', async () => {
		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const settings = URI.from({ scheme: Schemas.inMemory, path: '/settings.json' });
		await fileService.writeFile(settings, VSBuffer.fromString('{}'));
		const configuration = store.add(new ConfigurationService(settings, fileService, new NullPolicyService(), logService));
		await configuration.initialize();
		const context = store.add(new ContextKeyService(configuration));
		ChatContextKeys.enabled.bindTo(context).set(true);
		let experimentDefault: IConfigurationDefaults | undefined;
		store.add(toDisposable(() => {
			if (experimentDefault) {
				configurationRegistry.deregisterDefaultConfigurations([experimentDefault]);
			}
		}));
		const scenarios = [
			{ experiment: undefined, user: undefined, enabled: false },
			{ experiment: true, user: undefined, enabled: true },
			{ experiment: true, user: false, enabled: false },
			{ experiment: false, user: true, enabled: true },
			{ experiment: false, user: undefined, enabled: false },
			{ experiment: undefined, user: true, enabled: true },
			{ experiment: undefined, user: undefined, enabled: false },
		];
		const availability: { runtime: boolean; visible: boolean }[] = [];
		for (const scenario of scenarios) {
			const nextDefault = scenario.experiment === undefined ? undefined : {
				overrides: { [RemoteSessionToolsEnabledSettingId]: scenario.experiment },
				source: 'experiments',
			};
			configurationRegistry.deltaConfiguration({
				removedDefaults: experimentDefault ? [experimentDefault] : undefined,
				addedDefaults: nextDefault ? [nextDefault] : undefined,
			});
			experimentDefault = nextDefault;
			await fileService.writeFile(settings, VSBuffer.fromString(JSON.stringify({
				[RemoteAgentHostsEnabledSettingId]: true,
				[RemoteSessionToolsEnabledSettingId]: scenario.user,
			})));
			await configuration.reloadConfiguration();
			availability.push({
				runtime: areRemoteSessionToolsEnabled(configuration),
				visible: context.contextMatchesRules(remoteSessionToolsWhen),
			});
		}
		assert.deepStrictEqual(availability, scenarios.map(scenario => ({ runtime: scenario.enabled, visible: scenario.enabled })));
	});
});
