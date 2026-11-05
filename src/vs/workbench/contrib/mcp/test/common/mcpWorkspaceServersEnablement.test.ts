/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ContributionEnablementState, EnablementModel } from '../../../chat/common/enablement.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerTransportType, McpServerTrust } from '../../common/mcpTypes.js';
import { WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY, WorkspaceMcpServersEnablementModel } from '../../common/mcpWorkspaceServersEnablement.js';

suite('MCP - WorkspaceMcpServersEnablementModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceServer = 'workspace-dot-mcp.0.alpha';
	const userServer = 'mcp.config.usr.alpha';

	function createCollection(id: string, configTarget: ConfigurationTarget, serverIds: readonly string[]): McpCollectionDefinition {
		return {
			id,
			label: id,
			remoteAuthority: null,
			order: 0,
			serverDefinitions: observableValue(id, serverIds.map((serverId): McpServerDefinition => ({
				id: serverId,
				label: serverId,
				cacheNonce: 'nonce',
				launch: { type: McpServerTransportType.Stdio, command: 'node', args: [], env: {}, envFile: undefined, cwd: undefined, sandbox: undefined },
			}))),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.WORKSPACE,
			configTarget,
		};
	}

	function createModel(workspaceServersEnabledSetting: boolean) {
		const setting = observableValue('setting', workspaceServersEnabledSetting);
		const base = store.add(new EnablementModel('mcp.enablement.test', store.add(new TestStorageService())));
		const registry = upcastPartial<IMcpRegistry>({
			collections: observableValue('collections', [
				createCollection('workspace-dot-mcp.0', ConfigurationTarget.WORKSPACE_FOLDER, [workspaceServer]),
				createCollection('mcp.config.usr', ConfigurationTarget.USER, [userServer]),
			]),
		});
		const model = new WorkspaceMcpServersEnablementModel(base, registry, setting);
		return { model, base, setting };
	}

	function snapshot(model: WorkspaceMcpServersEnablementModel) {
		return {
			workspaceServer: model.readEnabled(workspaceServer),
			userServer: model.readEnabled(userServer),
			classState: model.readWorkspaceServersEnabled(),
			canEnableWorkspaceServerProfile: model.canSetEnabled(workspaceServer, ContributionEnablementState.EnabledProfile),
		};
	}

	test('passes every server through while the setting is enabled', () => {
		const { model } = createModel(true);
		assert.deepStrictEqual(snapshot(model), {
			workspaceServer: ContributionEnablementState.EnabledProfile,
			userServer: ContributionEnablementState.EnabledProfile,
			classState: ContributionEnablementState.EnabledProfile,
			canEnableWorkspaceServerProfile: true,
		});
	});

	test('disables only workspace servers while the setting is disabled', () => {
		const { model } = createModel(false);
		assert.deepStrictEqual(snapshot(model), {
			workspaceServer: ContributionEnablementState.DisabledProfile,
			userServer: ContributionEnablementState.EnabledProfile,
			classState: ContributionEnablementState.DisabledProfile,
			canEnableWorkspaceServerProfile: false,
		});
	});

	test('a per-server Profile decision cannot override the gate, a Workspace decision can', () => {
		const { model, base } = createModel(false);
		base.setEnabled(workspaceServer, ContributionEnablementState.EnabledProfile);
		assert.strictEqual(model.readEnabled(workspaceServer), ContributionEnablementState.DisabledProfile);

		base.setEnabled(workspaceServer, ContributionEnablementState.EnabledWorkspace);
		assert.strictEqual(model.readEnabled(workspaceServer), ContributionEnablementState.EnabledWorkspace);
	});

	test('a workspace override of the class wins over the setting in both directions', () => {
		const { model, setting } = createModel(false);
		model.setWorkspaceServersEnabled(true);
		assert.deepStrictEqual(snapshot(model), {
			workspaceServer: ContributionEnablementState.EnabledProfile,
			userServer: ContributionEnablementState.EnabledProfile,
			classState: ContributionEnablementState.EnabledWorkspace,
			canEnableWorkspaceServerProfile: true,
		});

		setting.set(true, undefined);
		model.setWorkspaceServersEnabled(false);
		assert.deepStrictEqual(snapshot(model), {
			workspaceServer: ContributionEnablementState.DisabledWorkspace,
			userServer: ContributionEnablementState.EnabledProfile,
			classState: ContributionEnablementState.DisabledWorkspace,
			canEnableWorkspaceServerProfile: false,
		});

		model.setWorkspaceServersEnabled(undefined);
		assert.strictEqual(model.readWorkspaceServersEnabled(), ContributionEnablementState.EnabledProfile);
	});

	test('a workspace decision that matches the setting restores inheritance instead of pinning it', () => {
		const { model, setting } = createModel(false);
		model.setWorkspaceServersEnabled(false);
		const redundantWhileOff = model.readWorkspaceServersEnabled();
		setting.set(true, undefined);
		const afterSettingOn = model.readWorkspaceServersEnabled();
		model.setWorkspaceServersEnabled(true);

		assert.deepStrictEqual([redundantWhileOff, afterSettingOn, model.readWorkspaceServersEnabled()], [
			ContributionEnablementState.DisabledProfile,
			ContributionEnablementState.EnabledProfile,
			ContributionEnablementState.EnabledProfile,
		]);
	});

	test('an explicit per-server disable is kept while the class is enabled', () => {
		const { model, base } = createModel(true);
		base.setEnabled(workspaceServer, ContributionEnablementState.DisabledWorkspace);
		assert.strictEqual(model.readEnabled(workspaceServer), ContributionEnablementState.DisabledWorkspace);
		base.setEnabled(workspaceServer, ContributionEnablementState.DisabledProfile);
		assert.strictEqual(model.readEnabled(workspaceServer), ContributionEnablementState.DisabledProfile);
	});

	test('the class decision is stored under its reserved key in workspace storage', () => {
		const { model, base } = createModel(true);
		model.setWorkspaceServersEnabled(false);
		assert.strictEqual(base.readEnabled(WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY), ContributionEnablementState.DisabledWorkspace);
		assert.strictEqual(base.readProfileEnabled(WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY), true);
	});
});
