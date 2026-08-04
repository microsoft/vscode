/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { isDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { mergeInstalledPluginEnablementActions } from '../../../browser/aiCustomization/pluginListWidget.js';

const sessionResource = URI.parse('agent-host-copilotcli:/session-1');

class TestFileService extends mock<IFileService>() {
	override async canHandleResource(): Promise<boolean> {
		return false;
	}

	override async resolveAll() {
		return [];
	}
}

class TestAgentHostCustomizationService extends NullAgentHostCustomizationService {
	readonly calls: { readonly rawId: string; readonly enablement: readonly CustomizationEnablement[] }[] = [];

	constructor(
		private customizations: readonly PluginCustomization[],
		private readonly workingDirectories: readonly string[],
	) {
		super();
	}

	override readonly onDidChangeCustomizations = Event.None;

	override getCustomizations(): readonly PluginCustomization[] {
		return this.customizations;
	}

	override getWorkingDirectories(): readonly string[] {
		return this.workingDirectories;
	}

	setCustomizations(customizations: readonly PluginCustomization[]): void {
		this.customizations = customizations;
	}

	override setCustomizationEnablement(_sessionResource: URI, rawId: string, enablement: CustomizationEnablement[]): void {
		this.calls.push({ rawId, enablement });
	}
}

function plugin(enablement?: CustomizationEnablement[]): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: 'file:///plugin-1',
		uri: 'file:///plugin-1',
		name: 'Plugin One',
		enabled: true,
		enablement,
	};
}

suite('pluginListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider(service: IAgentHostCustomizationService): AgentCustomizationItemProvider {
		return disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			new TestFileService(),
			new NullLogService(),
			service,
		));
	}

	test('offers scoped enablement actions and dispatches the selected scope', async () => {
		const service = new TestAgentHostCustomizationService([plugin([
			{ kind: CustomizationEnablementKind.Session, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
			{ kind: CustomizationEnablementKind.Global, enabled: false },
		])], ['file:///repo']);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const actions = items[0].actions ?? [];

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Enable',
			'Disable (Workspace)',
			'Enable (Session)',
		]);

		await actions[2].run();

		assert.deepStrictEqual(service.calls, [{
			rawId: 'file:///plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: true },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('uses the latest enablement when running an action', async () => {
		const service = new TestAgentHostCustomizationService([plugin()], ['file:///repo']);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		service.setCustomizations([plugin([{ kind: CustomizationEnablementKind.Session, enabled: false }])]);

		await (items[0].actions ?? [])[0].run();

		assert.deepStrictEqual(service.calls, [{
			rawId: 'file:///plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('omits workspace enablement actions without an active project root', async () => {
		const service = new TestAgentHostCustomizationService([plugin()], []);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);

		assert.deepStrictEqual((items[0].actions ?? []).map(action => action.label), [
			'Disable',
			'Disable (Session)',
		]);
	});

	test('merges local and agent-host plugin enablement actions using the customization id', async () => {
		const service = new TestAgentHostCustomizationService([plugin([
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		])], ['file:///repo']);
		const [remoteItem] = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const localWrites: string[] = [];
		const localAction = new Action(
			'agentPlugin.disableForWorkspace',
			'Disable (Workspace)',
			undefined,
			true,
			() => {
				localWrites.push('workspace');
				return Promise.resolve();
			},
		);
		disposables.add(localAction);

		const [[workspaceAction, sessionAction]] = mergeInstalledPluginEnablementActions(
			URI.parse('file:///plugin-1'),
			'Plugin One',
			[[localAction]],
			[remoteItem],
		);
		if (isDisposable(workspaceAction)) {
			disposables.add(workspaceAction);
		}
		if (isDisposable(sessionAction)) {
			disposables.add(sessionAction);
		}

		await workspaceAction.run();

		assert.deepStrictEqual({
			labels: [workspaceAction.label, sessionAction.label],
			localWrites,
			hostWrites: service.calls,
		}, {
			labels: ['Disable (Workspace)', 'Disable (Session)'],
			localWrites: ['workspace'],
			hostWrites: [{
				rawId: 'file:///plugin-1',
				enablement: [
					{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: false },
					{ kind: CustomizationEnablementKind.Global, enabled: true },
				],
			}],
		});
	});

	// Regression: the host publishes only the inverse action for each scope, so
	// keying the workspace filter on one specific id removed the local workspace
	// action whenever local and host workspace states disagreed.
	test('keeps the local workspace action when the host workspace state differs', async () => {
		const service = new TestAgentHostCustomizationService([plugin([
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		])], ['file:///repo']);
		const [remoteItem] = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const localWrites: string[] = [];
		// Locally disabled, so the local menu offers "Enable (Workspace)" while the
		// host - being workspace-enabled - offers "Disable (Workspace)".
		const localAction = new Action('agentPlugin.enableForWorkspace', 'Enable (Workspace)', undefined, true, () => {
			localWrites.push('workspace');
			return Promise.resolve();
		});
		disposables.add(localAction);

		const [group] = mergeInstalledPluginEnablementActions(
			URI.parse('file:///plugin-1'),
			'Plugin One',
			[[localAction]],
			[remoteItem],
		);
		for (const action of group) {
			if (isDisposable(action)) {
				disposables.add(action);
			}
		}
		const [workspaceAction] = group;

		await workspaceAction.run();

		// The host is workspace-enabled and so publishes only "Disable (Workspace)".
		// The merged action must still be offered AND must still write the decision
		// its own label promises, rather than being skipped for lack of a matching
		// host action.
		assert.deepStrictEqual({
			label: workspaceAction.label,
			localWrites,
			hostWrites: service.calls,
		}, {
			label: 'Enable (Workspace)',
			localWrites: ['workspace'],
			hostWrites: [{
				rawId: 'file:///plugin-1',
				enablement: [
					{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: true },
				],
			}],
		});
	});

	test('leaves local plugin actions unchanged without an agent-host customization', async () => {
		const localWrites: string[] = [];
		const localAction = new Action(
			'agentPlugin.disable',
			'Disable',
			undefined,
			true,
			() => {
				localWrites.push('profile');
				return Promise.resolve();
			},
		);
		disposables.add(localAction);

		const [[action]] = mergeInstalledPluginEnablementActions(
			URI.parse('file:///plugin-1'),
			'Plugin One',
			[[localAction]],
			[],
		);

		await action.run();

		assert.deepStrictEqual({
			action,
			localWrites,
		}, {
			action: localAction,
			localWrites: ['profile'],
		});
	});

	test('hides workspace enablement when the matching agent-host customization has no working directory', async () => {
		const service = new TestAgentHostCustomizationService([plugin()], []);
		const [remoteItem] = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const profileAction = new Action('agentPlugin.disable', 'Disable', undefined, true, () => Promise.resolve());
		const workspaceAction = new Action('agentPlugin.disableForWorkspace', 'Disable (Workspace)', undefined, true, () => Promise.resolve());
		disposables.add(profileAction);
		disposables.add(workspaceAction);

		const groups = mergeInstalledPluginEnablementActions(
			URI.parse('file:///plugin-1'),
			'Plugin One',
			[[profileAction, workspaceAction]],
			[remoteItem],
		);
		for (const action of groups.flat()) {
			if (isDisposable(action)) {
				disposables.add(action);
			}
		}

		assert.deepStrictEqual(groups.flat().map(action => action.label), [
			'Disable',
			'Disable (Session)',
		]);
	});
});
