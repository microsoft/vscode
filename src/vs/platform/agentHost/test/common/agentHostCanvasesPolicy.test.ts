/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { ConfigurationService } from '../../../configuration/common/configurationService.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { FilePolicyService } from '../../../policy/common/filePolicyService.js';
import { Registry } from '../../../registry/common/platform.js';
import { CanvasesEnabledSettingId } from '../../common/agentService.js';
import { AgentHostConfigurationSyncTarget, resolveAgentHostConfigurationSyncPatch } from '../../common/agentHostConfigurationSync.js';
import { AgentHostCanvasesEnabledConfigKey } from '../../common/agentHostSchema.js';
import '../../common/agentHostStarter.config.contribution.js';

suite('AgentHostCanvasesPolicy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createConfiguration(userValue?: boolean, policyValue?: boolean) {
		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider('vscode-tests', store.add(new InMemoryFileSystemProvider())));
		const settingsFile = URI.from({ scheme: 'vscode-tests', path: '/settings.json' });
		const policyFile = URI.from({ scheme: 'vscode-tests', path: '/policies.json' });
		await fileService.writeFile(settingsFile, VSBuffer.fromString(JSON.stringify({ [CanvasesEnabledSettingId]: userValue })));
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ ChatCanvasesEnabled: policyValue })));
		const policyService = store.add(new FilePolicyService(policyFile, fileService, logService));
		const configurationService = store.add(new ConfigurationService(settingsFile, fileService, policyService, logService));
		await configurationService.initialize();
		return { configurationService, fileService, policyFile };
	}

	function readEnablement(configurationService: ConfigurationService) {
		return {
			enabled: configurationService.getValue<boolean>(CanvasesEnabledSettingId),
			mirrored: [
				AgentHostConfigurationSyncTarget.Local,
				AgentHostConfigurationSyncTarget.RemoteExtensionHost,
				AgentHostConfigurationSyncTarget.Remote,
			].map(target => resolveAgentHostConfigurationSyncPatch(configurationService, target)[AgentHostCanvasesEnabledConfigKey]),
		};
	}

	test('registers an application-scoped Canvas policy', () => {
		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const property = registry.getConfigurationProperties()[CanvasesEnabledSettingId];

		assert.deepStrictEqual({
			setting: registry.getPolicyConfigurations().get('ChatCanvasesEnabled'),
			type: property.type,
			scope: property.scope,
			default: property.default,
			minimumVersion: property.policy?.minimumVersion,
		}, {
			setting: CanvasesEnabledSettingId,
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			default: false,
			minimumVersion: '1.142',
		});
	});

	for (const { name, userValue, policyValue, expected } of [
		{ name: 'disabled by default', userValue: undefined, policyValue: undefined, expected: false },
		{ name: 'user enablement without policy', userValue: true, policyValue: undefined, expected: true },
		{ name: 'policy disablement overrides user enablement', userValue: true, policyValue: false, expected: false },
		{ name: 'policy enablement overrides user disablement', userValue: false, policyValue: true, expected: true },
	]) {
		test(name, async () => {
			const { configurationService } = await createConfiguration(userValue, policyValue);

			assert.deepStrictEqual(readEnablement(configurationService), {
				enabled: expected,
				mirrored: [expected, expected, expected],
			});
		});
	}

	test('prevents re-enabling Canvases while policy disables them', async () => {
		const { configurationService } = await createConfiguration(true, false);

		await assert.rejects(configurationService.updateValue(CanvasesEnabledSettingId, true), /configured in system policy/);
	});

	test('applies policy changes and restores the user preference on policy removal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { configurationService, fileService, policyFile } = await createConfiguration(true);
		const states = [readEnablement(configurationService)];

		for (const value of [false, true, false, undefined]) {
			const changed = Event.toPromise(Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)), store);
			await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ ChatCanvasesEnabled: value })));
			await changed;
			states.push(readEnablement(configurationService));
		}

		assert.deepStrictEqual(states, [true, false, true, false, true].map(enabled => ({
			enabled,
			mirrored: [enabled, enabled, enabled],
		})));
	}));
});
