/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { withRuntimePluginEnablement } from '../../../../../platform/agentHost/common/meta/pluginEnablementMeta.js';
import { getCustomizationDisabledReason } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { agentHostConnectionKinds } from '../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { Event } from '../../../../../base/common/event.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { CustomizationEnablementKind, CustomizationType, type PluginCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { createAgentHostEnablePluginAction, createPolicyManagedEnablementAction, createUninstallPluginAction, OrganizationRequiredUninstallActionViewItem, getAgentHostPluginEnablementActions, getPluginPolicyEnablement, isPluginPolicyBlocked, removePluginWithMarketplaceOwnership } from '../../browser/agentPluginActions.js';
import { IAgentHostCustomizationService } from '../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { createCustomizationMarketplaceInstallationSnapshot, emptyCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { getAgentHostCustomizationUri } from '../../common/agentHostSessionCustomizations.js';
import { identityAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';

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

	function createAgentPluginService(calls: unknown[][], pluginUri = URI.file('/plugins/client-plugin')): IAgentPluginService {
		return {
			plugins: constObservable([{ ...createPlugin(), uri: pluginUri }]),
			enablementModel: {
				setEnabled: (...args: unknown[]) => calls.push(args),
			},
		} as unknown as IAgentPluginService;
	}

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

	test('creates a disabled uninstall action that explains organization control for a required plugin', async () => {
		let removeCount = 0;
		const action = createUninstallPluginAction(createPlugin(async () => {
			removeCount++;
			return true;
		}, true));

		assert.ok(action);
		store.add(action);
		const removed = await action.runAndGetResult();
		assert.deepStrictEqual({ enabled: action.enabled, label: action.label, tooltip: action.tooltip, removed, removeCount }, {
			enabled: false,
			label: 'Uninstall',
			tooltip: 'This plugin is managed by your organization.',
			removed: false,
			removeCount: 0,
		});
	});

	test('keeps a required plugin\'s Uninstall keyboard-reachable and explained in an action bar that skips disabled items', async () => {
		let removeCount = 0;
		const action = createUninstallPluginAction(createPlugin(async () => {
			removeCount++;
			return true;
		}, true))!;
		const otherDisabled = store.add(new Action('test.disabled', 'Other', undefined, false));
		store.add(action);
		const hovers: { content: unknown; keyboard: boolean | undefined }[] = [];
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover(_target: HTMLElement, options: Parameters<IHoverService['setupDelayedHover']>[1], lifecycle?: IHoverLifecycleOptions): IDisposable {
				hovers.push({ content: typeof options === 'function' ? options().content : options.content, keyboard: lifecycle?.setupKeyboardEvents });
				return Disposable.None;
			}
		}();
		const actionBar = store.add(new ActionBar(mainWindow.document.createElement('div'), {
			actionViewItemProvider: (candidate, options) => candidate === action ? new OrganizationRequiredUninstallActionViewItem(action, options, hoverService) : undefined,
			focusOnlyEnabledItems: true,
		}));
		actionBar.push([otherDisabled, action], { icon: true, label: true });
		actionBar.setFocusable(true);
		await actionBar.run(action);
		const labels = [...actionBar.getContainer().querySelectorAll<HTMLElement>('.action-label')];

		assert.deepStrictEqual({
			labels: labels.map(label => ({ text: label.textContent, tabIndex: label.tabIndex, disabled: label.getAttribute('aria-disabled'), ariaLabel: label.getAttribute('aria-label') })),
			hovers,
			removeCount,
		}, {
			labels: [
				{ text: 'Other', tabIndex: -1, disabled: 'true', ariaLabel: 'Other' },
				{ text: 'Uninstall', tabIndex: 0, disabled: 'true', ariaLabel: 'Uninstall. This plugin is managed by your organization.' },
			],
			hovers: [{ content: 'This plugin is managed by your organization.', keyboard: true }],
			removeCount: 0,
		});
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
			getClientPluginUri: (_session: URI, plugin: PluginCustomization) => getAgentHostCustomizationUri(URI.parse(plugin.uri), { clientId: 'client-1', resourceUris: identityAgentHostResourceUriMapper }, plugin),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), URI.parse('vscode-agent-session:///session-1'), customization, true);

		await actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [[customization.uri.toString(), ContributionEnablementState.EnabledProfile]],
			hostCalls: [],
		});
	});

	for (const kind of agentHostConnectionKinds) {
		test(`routes same-host plugin global enablement through its decoded client identity (${kind.name})`, async () => {
			const clientUri = kind.toClient(URI.file('/plugins/client-plugin')).toString();
			const plugin: PluginCustomization = {
				type: CustomizationType.Plugin, id: 'stable-client-id', name: 'Client Plugin',
				uri: 'vscode-agent-host-file:///plugins/client-plugin', clientId: 'client-1',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			};
			const hostCalls: unknown[][] = [];
			const clientCalls: unknown[][] = [];
			const actions = getAgentHostPluginEnablementActions({
				setCustomizationEnablement: (...args: unknown[]) => hostCalls.push(args),
				getClientPluginUri: (_session: URI, plugin: PluginCustomization) => getAgentHostCustomizationUri(URI.parse(plugin.uri), { clientId: 'client-1', resourceUris: kind.resourceUris }, plugin),
			} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls, URI.parse(clientUri)), URI.parse('vscode-agent-session:///session-1'), plugin, true);
			await actions[0].run();
			assert.deepStrictEqual({ clientCalls, hostCalls }, {
				clientCalls: [[clientUri, ContributionEnablementState.EnabledProfile]], hostCalls: [],
			});
		});
	}

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
			getClientPluginUri: (_session: URI, plugin: PluginCustomization) => getAgentHostCustomizationUri(URI.parse(plugin.uri), { clientId: 'client-1', resourceUris: identityAgentHostResourceUriMapper }, plugin),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), sessionResource, customization, true);

		actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [],
			hostCalls: [[sessionResource, 'host-plugin', customization.enablement, CustomizationEnablementKind.Global, true]],
		});
	});

	test('runtime-owned plugin actions offer global and repository scopes without local or session writes', async () => {
		const calls: unknown[][] = [];
		const session = URI.parse('other-session://opaque/conversation');
		const customization: PluginCustomization = {
			type: CustomizationType.Plugin, id: 'opaque-plugin', name: 'Native', uri: 'file:///plugins/native',
			_meta: withRuntimePluginEnablement(undefined, { provider: 'custom-provider', plugin: 'native@marketplace', globalEnabled: false, effectiveEnabled: true, repositorySupported: true, repositoryEnabled: true }),
		};
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override canSetRuntimePluginEnablement(): boolean { return true; }
			override async setRuntimePluginEnablement(...args: [URI, string, 'global' | 'repository', boolean | null]): Promise<void> { calls.push(args); }
		}();
		const actions = getAgentHostPluginEnablementActions(service, undefined, session, customization, true);
		await actions[0].run();
		await actions[1].run();
		assert.deepStrictEqual({ actions: actions.map(action => [action.label, action.enabled]), calls }, {
			actions: [['Disable for Workspace', true], ['Use Global Enablement', true]],
			calls: [[session, 'opaque-plugin', 'repository', false], [session, 'opaque-plugin', 'repository', null]],
		});
	});

	test('child Enable Plugin actions retain runtime ownership from their disabled parent', async () => {
		const calls: unknown[][] = [];
		const session = URI.parse('other-session://opaque/conversation');
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin, id: 'opaque-parent', name: 'Native', uri: 'other-host:/plugins/native',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			_meta: withRuntimePluginEnablement(undefined, { provider: 'custom-provider', plugin: 'opaque-source', globalEnabled: false, effectiveEnabled: false, repositorySupported: false }),
		};
		const reason = getCustomizationDisabledReason({}, plugin);
		assert.ok(reason?.source === 'plugin');
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override async setRuntimePluginEnablement(...args: [URI, string, 'global' | 'repository', boolean]): Promise<void> { calls.push(args); }
			override setCustomizationEnablement(): void { throw new Error('Legacy enablement must not be used'); }
		}();
		await createAgentHostEnablePluginAction(service, undefined, session, reason.plugin, CustomizationEnablementKind.Global).run();
		assert.deepStrictEqual(calls, [[session, plugin.id, 'global', true]]);
	});

	for (const [globalEnabled, effectiveEnabled] of [[false, true], [true, false]] as const) {
		test(`runtime plugin switch reflects session activation ${effectiveEnabled} instead of global ${globalEnabled}`, async () => {
			const calls: [URI, string, 'global' | 'repository', boolean | null][] = [];
			const session = URI.parse('other-session:/opaque');
			const plugin: PluginCustomization = {
				type: CustomizationType.Plugin, id: 'native', name: 'Native', uri: 'other-host:/plugin',
				_meta: withRuntimePluginEnablement(undefined, {
					provider: 'other', plugin: 'native@marketplace', globalEnabled,
					effectiveEnabled, repositorySupported: true, repositoryEnabled: null,
				}),
			};
			const service = new class extends mock<IAgentHostCustomizationService>() {
				override canSetRuntimePluginEnablement(): boolean { return true; }
				override async setRuntimePluginEnablement(...args: [URI, string, 'global' | 'repository', boolean | null]): Promise<void> { calls.push(args); }
			}();
			const [toggle] = getAgentHostPluginEnablementActions(service, undefined, session, plugin, true);
			const writesBeforeToggle = calls.length;
			await toggle.run();
			assert.deepStrictEqual({
				checked: toggle.checked, label: toggle.label, scope: toggle.scope, enabled: toggle.enabled,
				writesBeforeToggle, calls,
			}, {
				checked: effectiveEnabled, label: effectiveEnabled ? 'Disable Globally' : 'Enable Globally', scope: 'global', enabled: true,
				writesBeforeToggle: 0, calls: [[session, plugin.id, 'global', !effectiveEnabled]],
			});
		});
	}

	test('runtime-owned plugins remain read-only on hosts without the management capability', async () => {
		const customization: PluginCustomization = {
			type: CustomizationType.Plugin, id: 'opaque-plugin', name: 'Native', uri: 'file:///plugins/native',
			_meta: withRuntimePluginEnablement(undefined, { provider: 'custom-provider', plugin: 'native@marketplace', globalEnabled: false, repositorySupported: true }),
		};
		const actions = getAgentHostPluginEnablementActions(new class extends mock<IAgentHostCustomizationService>() { }(), undefined, URI.parse('other-session://opaque/conversation'), customization, true);
		await assert.rejects(() => Promise.resolve(actions[0].run()), /unavailable/);
		assert.deepStrictEqual(actions.map(action => action.enabled), [false, false]);
	});

	test('runtime plugin controls wait for enablement and reject unsupported workspace scope', async () => {
		const session = URI.parse('other-session://opaque/conversation');
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin, id: 'native', name: 'Native', uri: 'file:///plugins/native',
			_meta: withRuntimePluginEnablement(undefined, { provider: 'custom-provider', plugin: 'direct-source', globalEnabled: false, repositorySupported: false }),
		};
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override canSetRuntimePluginEnablement(): boolean { return true; }
		}();
		const pending = getAgentHostPluginEnablementActions(service, undefined, session, plugin, true);
		const ready = getAgentHostPluginEnablementActions(service, undefined, session, {
			...plugin,
			_meta: withRuntimePluginEnablement(plugin._meta, { provider: 'custom-provider', plugin: 'direct-source', globalEnabled: false, effectiveEnabled: false, repositorySupported: false }),
		}, true);
		await assert.rejects(() => Promise.resolve(pending[0].run()), /unavailable/);
		await assert.rejects(() => Promise.resolve(ready[1].run()), /unavailable/);
		assert.deepStrictEqual({
			pending: pending.map(action => ({ enabled: action.enabled, checked: action.checked, tooltip: action.tooltip })),
			ready: ready.map(action => ({ enabled: action.enabled, checked: action.checked, tooltip: action.tooltip })),
		}, {
			pending: [
				{ enabled: false, checked: false, tooltip: 'Plugin enablement is unavailable until this chat\'s session is ready.' },
				{ enabled: false, checked: undefined, tooltip: 'This plugin does not support workspace enablement. You can change global enablement.' },
			],
			ready: [
				{ enabled: true, checked: false, tooltip: undefined },
				{ enabled: false, checked: undefined, tooltip: 'This plugin does not support workspace enablement. You can change global enablement.' },
			],
		});
	});

	test('plugin switches follow explicit scope and preserve activation when selecting workspace scope', async () => {
		const session = URI.parse('other-session:/opaque');
		const calls: unknown[][] = [];
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override canSetRuntimePluginEnablement(): boolean { return true; }
			override async setRuntimePluginEnablement(...args: [URI, string, 'global' | 'repository', boolean | null]): Promise<void> { calls.push(args); }
		}();
		const results = [];
		for (const [repositoryEnabled, effectiveEnabled] of [[null, true], [null, false], [true, true], [false, false], [undefined, true]] as const) {
			const plugin: PluginCustomization = {
				type: CustomizationType.Plugin, id: 'native', name: 'Native', uri: 'other-host:/plugin',
				_meta: withRuntimePluginEnablement(undefined, {
					provider: 'other', plugin: 'native@marketplace', globalEnabled: true,
					effectiveEnabled, repositorySupported: true, repositoryEnabled,
				}),
			};
			const [toggle, scope] = getAgentHostPluginEnablementActions(service, undefined, session, plugin, true);
			results.push({ checked: toggle.checked, scope: toggle.scope, label: scope.label, available: scope.enabled });
			if (scope.enabled) {
				await scope.run();
			}
			await toggle.run();
		}
		assert.deepStrictEqual({ results, calls: calls.map(call => call.slice(2)) }, {
			results: [
				{ checked: true, scope: 'global', label: 'Manage Enablement for This Workspace', available: true },
				{ checked: false, scope: 'global', label: 'Manage Enablement for This Workspace', available: true },
				{ checked: true, scope: 'workspace', label: 'Use Global Enablement', available: true },
				{ checked: false, scope: 'workspace', label: 'Use Global Enablement', available: true },
				{ checked: true, scope: 'global', label: 'Manage Enablement for This Workspace', available: false },
			],
			calls: [
				['repository', true], ['global', false],
				['repository', false], ['global', true],
				['repository', null], ['repository', false],
				['repository', null], ['repository', true],
				['global', false],
			],
		});
	});
});
