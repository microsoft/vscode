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
import { getInstalledPluginMetadata, getRemotePluginDisabledLabel, getToggledPluginEnablementState, isCurrentPluginMarketplaceRequest, PluginMarketplaceSnapshotModel, shouldLoadPluginMarketplaceSnapshot } from '../../../browser/aiCustomization/pluginListWidget.js';
import { AgentPluginItemKind, IInstalledPluginItem } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentPlugin } from '../../../common/plugins/agentPluginService.js';

suite('pluginListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('accepts marketplace results only for the initiating search', () => {
		assert.deepStrictEqual([
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, true, false),
			isCurrentPluginMarketplaceRequest('agent', '', false, false, true, false),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, true, true, false),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, false, false),
			isCurrentPluginMarketplaceRequest('agent', 'agent', false, false, true, true),
		], [true, false, false, false, false]);
	});
});
