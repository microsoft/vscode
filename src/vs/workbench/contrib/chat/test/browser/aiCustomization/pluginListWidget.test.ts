/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getInstalledPluginMetadata, getRemotePluginDisabledLabel, getToggledPluginEnablementState, isCurrentPluginMarketplaceRequest, isLegacyPluginMarketplaceAvailable, LegacyPluginMarketplaceAvailability, partitionInstalledPluginItemsByScope, PluginMarketplaceSnapshotModel, setPluginEnablementAndReadEffective, shouldLoadPluginMarketplaceSnapshot } from '../../../browser/aiCustomization/pluginListWidget.js';
import { AgentPluginItemKind, IInstalledPluginItem } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { IAgentPlugin } from '../../../common/plugins/agentPluginService.js';

suite('pluginListWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders host-published disabled reasons', () => {
		assert.deepStrictEqual([
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Global } }),
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Workspace } }),
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session } }),
		], [
			'Disabled',
			'Disabled (Workspace)',
			'Disabled (Session)',
		]);
	});

	test('toggles plugin enablement without changing scope', () => {
		assert.deepStrictEqual([
			getToggledPluginEnablementState(ContributionEnablementState.EnabledProfile),
			getToggledPluginEnablementState(ContributionEnablementState.DisabledProfile),
			getToggledPluginEnablementState(ContributionEnablementState.EnabledWorkspace),
			getToggledPluginEnablementState(ContributionEnablementState.DisabledWorkspace),
		], [
			ContributionEnablementState.DisabledProfile,
			ContributionEnablementState.EnabledProfile,
			ContributionEnablementState.DisabledWorkspace,
			ContributionEnablementState.EnabledWorkspace,
		]);
	});

	test('renders the effective state when an enablement write is rejected', () => {
		const model: IEnablementModel = {
			readEnabled: () => ContributionEnablementState.DisabledProfile,
			readProfileEnabled: () => false,
			setEnabled: () => { },
			remove: () => { },
		};

		assert.strictEqual(
			setPluginEnablementAndReadEffective(model, 'plugin', ContributionEnablementState.EnabledProfile),
			ContributionEnablementState.DisabledProfile,
		);
	});

	test('partitions installed plugins by enablement scope', () => {
		const createItem = (name: string, state: ContributionEnablementState): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${name}`);
				override readonly label = name;
				override readonly enablement = constObservable(state);
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		const profile = createItem('profile', ContributionEnablementState.EnabledProfile);
		const workspace = createItem('workspace', ContributionEnablementState.DisabledWorkspace);

		const result = partitionInstalledPluginItemsByScope([profile, workspace]);

		assert.deepStrictEqual({
			user: result.user.map(item => item.name),
			workspace: result.workspace.map(item => item.name),
		}, {
			user: ['profile'],
			workspace: ['workspace'],
		});
	});

	test('installed metadata contains contribution counts without enablement copy', () => {
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/example');
			override readonly format = PluginFormat.Copilot;
			override readonly label = 'Example';
			override readonly enablement = constObservable(ContributionEnablementState.EnabledProfile);
			override readonly hooks = constObservable([]);
			override readonly commands = constObservable([{ uri: URI.file('/plugins/example/commands/test.md'), name: 'test' }]);
			override readonly skills = constObservable([
				{ uri: URI.file('/plugins/example/skills/one/SKILL.md'), name: 'one' },
				{ uri: URI.file('/plugins/example/skills/two/SKILL.md'), name: 'two' },
			]);
			override readonly agents = constObservable([]);
			override readonly instructions = constObservable([]);
			override readonly mcpServerDefinitions = constObservable([]);
		}();
		const item: IInstalledPluginItem = {
			kind: AgentPluginItemKind.Installed,
			name: plugin.label,
			description: 'Example plugin',
			plugin,
		};

		assert.strictEqual(getInstalledPluginMetadata(item), '2 skills • 1 command');
	});

	test('treats an empty marketplace snapshot as loaded', () => {
		const snapshot = new PluginMarketplaceSnapshotModel();

		const firstLoadStarted = snapshot.beginLoading();
		snapshot.complete([]);
		const duplicateLoadStarted = snapshot.beginLoading();

		assert.deepStrictEqual({
			firstLoadStarted,
			state: snapshot.state,
			items: snapshot.items,
			duplicateLoadStarted,
		}, {
			firstLoadStarted: true,
			state: 'loaded',
			items: [],
			duplicateLoadStarted: false,
		});
	});

	test('loads marketplace snapshots only for visible plugin sections', () => {
		assert.deepStrictEqual([
			shouldLoadPluginMarketplaceSnapshot(false, 'uninitialized', true),
			shouldLoadPluginMarketplaceSnapshot(true, 'uninitialized', true),
			shouldLoadPluginMarketplaceSnapshot(true, 'loaded', true),
			shouldLoadPluginMarketplaceSnapshot(true, 'uninitialized', false),
		], [false, true, false, false]);
	});

	test('shows the legacy marketplace only when unified sources are disabled', () => {
		assert.deepStrictEqual([
			isLegacyPluginMarketplaceAvailable(true, 0),
			isLegacyPluginMarketplaceAvailable(true, 1),
			isLegacyPluginMarketplaceAvailable(true, 2),
			isLegacyPluginMarketplaceAvailable(false, 0),
		], [true, false, false, false]);
	});

	test('updates legacy marketplace availability for every registered source', async () => {
		const sources = [
			{ id: 'first', enablementSetting: 'test.first.enabled' },
			{ id: 'second', enablementSetting: 'test.second.enabled' },
		];
		const configuration = new TestConfigurationService({
			[sources[0].enablementSetting]: false,
			[sources[1].enablementSetting]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const availability = store.add(new LegacyPluginMarketplaceAvailability(true, sources, configuration));
		const changes: boolean[] = [];
		store.add(availability.onDidChange(available => changes.push(available)));
		const setEnabled = async (setting: string, enabled: boolean) => {
			await configuration.setUserConfiguration(setting, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean { return section === setting; }
			}());
		};

		const states = [availability.available];
		await setEnabled(sources[1].enablementSetting, true);
		states.push(availability.available);
		await setEnabled(sources[0].enablementSetting, true);
		states.push(availability.available);
		await setEnabled(sources[1].enablementSetting, false);
		states.push(availability.available);
		await setEnabled(sources[0].enablementSetting, false);
		states.push(availability.available);

		assert.deepStrictEqual({ states, changes }, {
			states: [true, false, false, false, true],
			changes: [false, true],
		});
	});

	test('accepts marketplace results only for the initiating search', () => {
		assert.deepStrictEqual([
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, true, false, true),
			isCurrentPluginMarketplaceRequest('agent', '', false, false, true, false, true),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, true, true, false, true),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, false, false, true),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, true, true, true),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, true, false, false),
		], [true, false, false, false, false, false]);
	});
});
