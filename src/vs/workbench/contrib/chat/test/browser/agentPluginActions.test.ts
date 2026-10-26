/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { CustomizationEnablementKind, CustomizationType, type PluginCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { createDisablePluginDropDown, createPolicyManagedEnablementAction, createUninstallPluginAction, getAgentHostPluginEnablementActions, getPluginPolicyEnablement, isPluginPolicyBlocked, removePluginWithMarketplaceOwnership } from '../../browser/agentPluginActions.js';
import { AgentPluginEditor } from '../../browser/agentPluginEditor/agentPluginEditor.js';
import { IAgentHostCustomizationService } from '../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { createCustomizationMarketplaceInstallationSnapshot, emptyCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(remove?: () => Promise<boolean>, policyEnablement?: boolean): IAgentPlugin {
		return {
			uri: URI.file('/plugins/local-plugin'),
			format: PluginFormat.Copilot,
			label: 'Local Plugin',
			enablement: observableValue('enablement', ContributionEnablementState.EnabledProfile),
			policyEnablement: observableValue('policyEnablement', policyEnablement),
			remove,
			hooks: observableValue('hooks', []),
			commands: observableValue('commands', []),
			skills: observableValue('skills', []),
			agents: observableValue('agents', []),
			instructions: observableValue('instructions', []),
			mcpServerDefinitions: observableValue('mcpServerDefinitions', []),
			automations: observableValue('automations', []),
		};
	}

	function createAgentPluginService(calls: unknown[][]): IAgentPluginService {
		return {
			plugins: constObservable([{ ...createPlugin(), uri: URI.file('/plugins/client-plugin') }]),
			enablementModel: {
				setEnabled: (...args: unknown[]) => calls.push(args),
			},
		} as unknown as IAgentPluginService;
	}

	test('plugin editor reports rejected enablement button actions', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const error = new Error('runtime refused');
		const reported = new DeferredPromise<unknown>();
		instantiationService.stub(INotificationService, { error: value => { reported.complete(value); } });
		instantiationService.stub(IAgentPluginService, {});
		instantiationService.stub(IPluginInstallService, {});
		instantiationService.stub(IPluginMarketplaceService, {});
		instantiationService.stub(IWebviewService, {});
		const editor = store.add(instantiationService.createInstance(AgentPluginEditor, new class extends mock<IEditorGroup>() { }()));
		const parent = mainWindow.document.createElement('div');
		editor.create(parent);
		const plugin = createPlugin();
		plugin.setEnabled = async () => { throw error; };
		const action = store.add(createDisablePluginDropDown(plugin, {
			readEnabled: () => ContributionEnablementState.EnabledProfile,
			readProfileEnabled: () => true,
			setEnabled: () => assert.fail('Failed runtime mutation must not be published'),
			remove: () => { },
		}, new TestContextService()));
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Exercise the editor-owned action bar without exposing it as public API.
		const actionBar = editor['template']!.actionBar;
		actionBar.push(action, { icon: true, label: true });
		const button = parent.querySelector<HTMLElement>('.action-label');
		assert.ok(button);
		button.click();
		assert.strictEqual(await reported.p, error);
	});

	test('creates uninstall action for a removable local plugin', async () => {
		let removeCount = 0;
		const action = createUninstallPluginAction(createPlugin(async () => {
			removeCount++;
			return true;
		}));

		assert.ok(action);
		store.add(action);
		await action.run();

		assert.strictEqual(removeCount, 1);
	});

	test('returns the plugin removal result to direct callers', async () => {
		const action = createUninstallPluginAction(createPlugin(async () => false));

		assert.ok(action);
		store.add(action);
		assert.strictEqual(await action.runAndGetResult(), false);
	});

	test('routes an exactly recorded plugin through marketplace uninstall', async () => {
		let directRemoveCount = 0;
		const plugin = createPlugin(async () => {
			directRemoveCount++;
			return true;
		});
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'testSource',
			identifier: 'local-plugin',
			displayName: 'Local Plugin',
			description: 'Test plugin',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			tags: [],
			capabilities: [],
			representativeQueries: [],
		};
		const uninstallCalls: ICustomizationMarketplaceResource[] = [];
		const marketplaceInstallService = new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override readonly installations = constObservable(createCustomizationMarketplaceInstallationSnapshot([{
				resource,
				state: { kind: 'installed', target: { kind: 'plugin', uri: plugin.uri } },
			}]));
			override async uninstall(candidate: ICustomizationMarketplaceResource): Promise<void> {
				uninstallCalls.push(candidate);
			}
		}();
		const action = createUninstallPluginAction(plugin, () => removePluginWithMarketplaceOwnership(plugin, marketplaceInstallService));

		assert.ok(action);
		store.add(action);
		assert.strictEqual(await action.runAndGetResult(), true);
		assert.deepStrictEqual({ directRemoveCount, uninstallCalls }, { directRemoveCount: 0, uninstallCalls: [resource] });
	});

	test('retains direct removal for an unrecorded plugin', async () => {
		let directRemoveCount = 0;
		const plugin = createPlugin(async () => {
			directRemoveCount++;
			return true;
		});
		const marketplaceInstallService = new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override readonly installations = constObservable(emptyCustomizationMarketplaceInstallationSnapshot);
		}();

		assert.strictEqual(await removePluginWithMarketplaceOwnership(plugin, marketplaceInstallService), true);
		assert.strictEqual(directRemoveCount, 1);
	});

	test('does not create uninstall action for a non-removable plugin', () => {
		assert.strictEqual(createUninstallPluginAction(createPlugin()), undefined);
	});

	test('does not create uninstall action for a force-enabled plugin', () => {
		assert.strictEqual(createUninstallPluginAction(createPlugin(async () => true, true)), undefined);
	});

	test('reads managed plugin enablement in both directions', () => {
		const required = createPlugin(undefined, true);
		const blocked = createPlugin(undefined, false);
		const unmanaged = createPlugin();

		assert.deepStrictEqual({
			required: getPluginPolicyEnablement(required),
			requiredBlocked: isPluginPolicyBlocked(required),
			blocked: getPluginPolicyEnablement(blocked),
			blockedBlocked: isPluginPolicyBlocked(blocked),
			unmanaged: getPluginPolicyEnablement(unmanaged),
			unmanagedBlocked: isPluginPolicyBlocked(unmanaged),
		}, {
			required: true,
			requiredBlocked: false,
			blocked: false,
			blockedBlocked: true,
			unmanaged: undefined,
			unmanagedBlocked: false,
		});
	});

	test('creates managed enablement actions for required and blocked plugins', () => {
		const notificationService = new class extends mock<INotificationService>() {
			override warn(): never {
				throw new Error('Unexpected notification');
			}
		}();
		const required = store.add(createPolicyManagedEnablementAction(createPlugin(undefined, true), notificationService)!);
		const blocked = store.add(createPolicyManagedEnablementAction(createPlugin(undefined, false), notificationService)!);

		assert.deepStrictEqual({
			required: required.label,
			blocked: blocked.label,
			unmanaged: createPolicyManagedEnablementAction(createPlugin(), notificationService)?.label,
		}, {
			required: 'Disable',
			blocked: 'Enable',
			unmanaged: undefined,
		});
	});

	test('offers scoped enablement actions for host-published plugins', () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'host-plugin',
			name: 'Host Plugin',
			uri: 'file:///plugins/host-plugin',
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }],
		} as PluginCustomization;
		const calls: unknown[][] = [];
		const service = {
			setCustomizationEnablement: (...args: unknown[]) => calls.push(args),
		} as unknown as IAgentHostCustomizationService;
		const actions = getAgentHostPluginEnablementActions(service, createAgentPluginService([]), URI.parse('vscode-agent-session:///session-1'), customization, true);

		assert.deepStrictEqual(actions.map(action => action.label), ['Disable', 'Enable (Workspace)', 'Enable (Session)']);
		actions[1].run();
		assert.deepStrictEqual(calls, [[URI.parse('vscode-agent-session:///session-1'), 'host-plugin', customization.enablement, CustomizationEnablementKind.Workspace, true]]);
	});

	test('writes client-published global plugin enablement locally', async () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'client-plugin',
			name: 'Client Plugin',
			uri: URI.file('/plugins/client-plugin').toString(),
			clientId: 'client-1',
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		} as PluginCustomization;
		const hostCalls: unknown[][] = [];
		const clientCalls: unknown[][] = [];
		const actions = getAgentHostPluginEnablementActions({
			setCustomizationEnablement: (...args: unknown[]) => hostCalls.push(args),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), URI.parse('vscode-agent-session:///session-1'), customization, true);

		await actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [[customization.uri.toString(), ContributionEnablementState.EnabledProfile]],
			hostCalls: [],
		});
	});

	test('writes host-discovered global plugin enablement to the host', () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'host-plugin',
			name: 'Host Plugin',
			uri: URI.file('/plugins/host-plugin').toString(),
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		} as PluginCustomization;
		const hostCalls: unknown[][] = [];
		const clientCalls: unknown[][] = [];
		const sessionResource = URI.parse('vscode-agent-session:///session-1');
		const actions = getAgentHostPluginEnablementActions({
			setCustomizationEnablement: (...args: unknown[]) => hostCalls.push(args),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), sessionResource, customization, true);

		actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [],
			hostCalls: [[sessionResource, 'host-plugin', customization.enablement, CustomizationEnablementKind.Global, true]],
		});
	});
});
