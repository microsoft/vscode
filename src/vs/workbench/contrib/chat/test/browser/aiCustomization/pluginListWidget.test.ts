/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { type Action } from '../../../../../../base/common/actions.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getInstalledPluginMetadata, getRemotePluginDisabledLabel, getToggledPluginEnablementState, installedPluginMatchesQuery, installedPluginToItem, isCurrentPluginMarketplaceRequest, partitionInstalledPluginItemsByScope, PluginInstalledItemRenderer, PluginListWidget, PluginMarketplaceSnapshotModel, PluginRemoteItemRenderer, setPluginEnablementAndReadEffective, shouldLoadPluginMarketplaceSnapshot, shouldShowLegacyPluginMarketplace, shouldShowPluginTree } from '../../../browser/aiCustomization/pluginListWidget.js';
import { AgentPluginItemKind, IInstalledPluginItem } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin } from '../../../common/plugins/pluginMarketplaceService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem } from '../../../common/customizationHarnessService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { testIWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';

suite('pluginListWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const harnessService = { activeSessionResource: constObservable(URI.parse('test-session:/active')) };

	test('keeps session enablement controls on locally discovered runtime plugin rows', async () => {
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/azure');
			override readonly label = 'azure';
			override readonly enablement = constObservable(ContributionEnablementState.EnabledProfile);
			override readonly copilotCliInstallation = { name: 'azure', marketplace: 'azure-skills' };
		}();
		const item: IInstalledPluginItem = { kind: AgentPluginItemKind.Installed, name: 'azure', description: '', plugin };
		const calls: string[] = [];
		const remote: ICustomizationItem = {
			uri: plugin.uri, type: 'plugin', name: 'azure', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: plugin.uri,
			actions: [
				{ id: 'repository', label: 'Disable for Workspace', checked: true, scope: 'workspace', run: () => { calls.push('repository'); } },
				{ id: 'scope', label: 'Use Global Enablement', scope: 'global', run: () => { calls.push('scope'); } },
			],
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() { }());
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { }());
		instantiationService.stub(INotificationService, new TestNotificationService());
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			sessionPluginItems: observableValue<readonly ICustomizationItem[]>('sessionPluginItems', [remote]), instantiationService,
			marketplaceInstallService: undefined,
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
			cardDisposables: store.add(new DisposableStore()),
		});
		const actions = widget.getInstalledPluginActions(item, store.add(new DisposableStore()));
		await actions.find((action: { id: string }) => action.id === 'repository').run();
		const workspaceActions = $('div');
		const toggle = widget.appendInstalledPluginToggle(workspaceActions, $('div'), $('div'), item).querySelector('button')!;
		const ready = { disabled: toggle.disabled, checked: toggle.getAttribute('aria-checked'), label: toggle.getAttribute('aria-label'), badge: workspaceActions.querySelector('.inline-badge')?.textContent };
		widget.sessionPluginItems.set([{ ...remote, actions: remote.actions!.map(action => ({ ...action, enabled: false })) }], undefined);
		const pendingControls = $('div');
		const pending = widget.appendInstalledPluginToggle(pendingControls, $('div'), $('div'), item).querySelector('button')!;
		const pendingBadgeDisabled = pendingControls.querySelector('.plugin-scope-badge')!.getAttribute('aria-disabled');
		widget.sessionPluginItems.set([{ ...remote, actions: remote.actions!.map(action => ({ ...action, scope: 'global' })) }], undefined);
		const globalActions = $('div');
		widget.appendInstalledPluginToggle(globalActions, $('div'), $('div'), item);
		widget.sessionPluginItems.set([remote], undefined);
		const pendingChanges = widget.getPendingPluginScopeChanges();
		pendingChanges.set(new Set([widget.getPluginScopeChangeKey(remote)]), undefined);
		const busyMenuActions = widget.getInstalledPluginActions(item, store.add(new DisposableStore()));
		pendingChanges.set(new Set(), undefined);
		assert.deepStrictEqual({
			labels: actions.filter((action: { label: string }) => action.label).map((action: { label: string }) => action.label),
			calls, ready, pendingDisabled: pending.disabled,
			globalBadges: globalActions.querySelectorAll('.inline-badge').length,
			pendingBadgeDisabled,
			menuRebuilt: actions[0] !== busyMenuActions[0],
			busyMenuAvailability: busyMenuActions.slice(0, 2).map((action: { enabled: boolean }) => action.enabled),
		}, {
			labels: ['Disable for Workspace', 'Use Global Enablement', 'Open Plugin Folder', 'Open README'],
			calls: ['repository'], ready: { disabled: false, checked: 'true', label: 'Plugin enablement for azure. Workspace scope. Disable for Workspace', badge: 'This Workspace' }, pendingDisabled: true,
			globalBadges: 0,
			pendingBadgeDisabled: 'true', menuRebuilt: true, busyMenuAvailability: [false, false],
		});
	});

	test('a runtime-installed plugin shows the organization requirement of its session plugin on a locked switch', () => {
		const createItem = (name: string, runtimeInstalled: boolean, policyEnablement?: boolean): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${name}`);
				override readonly label = name;
				override readonly enablement = constObservable(ContributionEnablementState.EnabledProfile);
				override readonly policyEnablement = constObservable(policyEnablement);
				override readonly copilotCliInstallation = runtimeInstalled ? { name, marketplace: 'enterprise' } : undefined;
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		const createSessionPlugin = (name: string, requiredEnabled?: boolean): ICustomizationItem => ({
			uri: URI.file(`/plugins/${name}`), type: 'plugin', name, source: AICustomizationSources.plugin, extensionId: undefined, pluginUri: undefined,
			organizationControl: requiredEnabled === undefined ? undefined : { requiredEnabled },
			actions: [{ id: 'toggle', label: 'Disable Globally', checked: true, enabled: requiredEnabled === undefined, scope: 'global', run: () => { } }],
		});
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			sessionPluginItems: observableValue<readonly ICustomizationItem[]>('sessionPluginItems', [createSessionPlugin('required', true), createSessionPlugin('own'), createSessionPlugin('local', true)]),
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
			cardDisposables: store.add(new DisposableStore()),
		});
		const required = createItem('required', true);
		const toggle = widget.appendInstalledPluginToggle($('div'), $('div'), $('div'), required).querySelector('button')!;
		assert.deepStrictEqual({
			required: widget.getInstalledPluginOrganizationControl(required),
			switch: { disabled: toggle.disabled, checked: toggle.getAttribute('aria-checked') },
			own: widget.getInstalledPluginOrganizationControl(createItem('own', true)),
			withoutSessionPlugin: widget.getInstalledPluginOrganizationControl(createItem('unpaired', true)),
			// A plugin the workbench loads itself is governed by the workbench policy alone.
			local: widget.getInstalledPluginOrganizationControl(createItem('local', false)),
			localBlocked: widget.getInstalledPluginOrganizationControl(createItem('local', false, false)),
		}, {
			required: { requiredEnabled: true },
			switch: { disabled: true, checked: 'true' },
			own: undefined, withoutSessionPlugin: undefined, local: undefined,
			localBlocked: { requiredEnabled: false },
		});
	});

	test('installed rows react to session activation and Team or organization metadata arriving after rendering', () => {
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/required');
			override readonly label = 'required';
			override readonly enablement = constObservable(ContributionEnablementState.DisabledProfile);
			override readonly copilotCliInstallation = { name: 'required', marketplace: 'team' };
			override readonly agents = constObservable([]);
			override readonly skills = constObservable([]);
			override readonly commands = constObservable([]);
			override readonly instructions = constObservable([]);
			override readonly mcpServerDefinitions = constObservable([]);
			override readonly hooks = constObservable([]);
		}();
		const item: IInstalledPluginItem = { kind: AgentPluginItemKind.Installed, name: plugin.label, description: '', plugin };
		const sessionPluginItems = observableValue<readonly ICustomizationItem[]>('sessionPluginItems', []);
		const widget = Object.assign(Object.create(PluginListWidget.prototype), { sessionPluginItems });
		const renderer = new PluginInstalledItemRenderer(
			new class extends mock<ICustomizationHarnessService>() { }(),
			new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
				override setupManagedHover() {
					return { show() { }, hide() { }, update() { }, dispose() { } };
				}
			}(),
			() => { },
			(item, reader) => widget.getInstalledPluginOrganizationControl(item, reader),
			(item, reader) => widget.isInstalledPluginTeamProvided(item, reader),
			(item, reader) => widget.isInstalledPluginEnabled(item, reader),
			false,
		);
		const row = $('div');
		const template = renderer.renderTemplate(row);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		renderer.renderElement({ type: 'plugin-item', item }, 0, template);
		const snapshot = () => {
			return {
				disabled: row.classList.contains('disabled'),
				badgeVisible: row.querySelector<HTMLElement>('.organization-managed-tag')!.style.display !== 'none',
				teamBadgeVisible: row.querySelector<HTMLElement>('.team-provided-tag')!.style.display !== 'none',
			};
		};
		const global = snapshot();
		const sessionItem: ICustomizationItem = {
			uri: plugin.uri, type: 'plugin', name: plugin.label, source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: plugin.uri, enabled: true, teamProvided: true,
			actions: [{ id: 'toggle', label: 'Disable Globally', checked: true, scope: 'global', run: () => { } }],
		};
		sessionPluginItems.set([sessionItem], undefined);
		const teamEnabled = snapshot();
		sessionPluginItems.set([{ ...sessionItem, organizationControl: { requiredEnabled: true } }], undefined);
		const organizationEnabled = snapshot();
		sessionPluginItems.set([{ ...sessionItem, enabled: false, organizationControl: { requiredEnabled: false } }], undefined);
		const organizationDisabled = snapshot();
		sessionPluginItems.set([], undefined);
		assert.deepStrictEqual({ global, teamEnabled, organizationEnabled, organizationDisabled, removed: snapshot() }, {
			global: { disabled: true, badgeVisible: false, teamBadgeVisible: false },
			teamEnabled: { disabled: false, badgeVisible: false, teamBadgeVisible: true },
			organizationEnabled: { disabled: false, badgeVisible: true, teamBadgeVisible: false },
			organizationDisabled: { disabled: true, badgeVisible: true, teamBadgeVisible: false },
			removed: { disabled: true, badgeVisible: false, teamBadgeVisible: false },
		});
	});

	test('a search that matches only the location of a runtime-installed row keeps its organization requirement and locked switch', async () => {
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/home/dev/.copilot/installed-plugins/enterprise/required');
			override readonly label = 'required';
			override readonly enablement = constObservable(ContributionEnablementState.EnabledProfile);
			override readonly policyEnablement = constObservable(undefined);
			override readonly copilotCliInstallation = { name: 'required', marketplace: 'enterprise' };
		}();
		const sessionPlugin: ICustomizationItem = {
			uri: plugin.uri, type: 'plugin', name: 'required', description: 'Compliance checks', source: AICustomizationSources.plugin, extensionId: undefined, pluginUri: undefined,
			organizationControl: { requiredEnabled: true },
			actions: [{ id: 'toggle', label: 'Disable Globally', checked: true, enabled: false, scope: 'global', run: () => { } }],
		};
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService: { ...harnessService, getActiveDescriptor: () => ({ itemProvider: {} }) },
			itemsModel: { getActiveItemSource: () => ({ fetchProviderItems: async () => [sessionPlugin] }) },
			sessionPluginItems: observableValue<readonly ICustomizationItem[]>('sessionPluginItems', []),
			agentPluginService: { plugins: constObservable([plugin]) },
			labelService: new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}(),
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
			cardDisposables: store.add(new DisposableStore()),
			_onDidChangeItemCount: { fire: () => { } },
			searchQuery: 'installed-plugins', browseMode: false, filterGeneration: 0,
		});
		await widget.filterPlugins();
		const [row] = widget.installedItems;
		const toggle = widget.appendInstalledPluginToggle($('div'), $('div'), $('div'), row).querySelector('button')!;
		assert.deepStrictEqual({
			rows: widget.installedItems.map((item: IInstalledPluginItem) => item.name),
			// The session plugin does not match the search itself, so it adds no row of its own.
			sessionPluginRows: widget.remoteItems.length,
			organization: widget.getInstalledPluginOrganizationControl(row),
			switch: { disabled: toggle.disabled, checked: toggle.getAttribute('aria-checked') },
		}, {
			rows: ['required'], sessionPluginRows: 0,
			organization: { requiredEnabled: true },
			switch: { disabled: true, checked: 'true' },
		});
	});

	test('shows installed and host plugins as from a GitHub Team unless the organization manages them', () => {
		const createItem = (name: string, teamProvided?: boolean, policyEnablement?: boolean, marketplace = 'team'): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${marketplace}/${name}`);
				override readonly label = name;
				override readonly policyEnablement = constObservable(policyEnablement);
				override readonly teamProvided = teamProvided === undefined ? undefined : constObservable(teamProvided);
				override readonly copilotCliInstallation = { name, marketplace };
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		const createSessionPlugin = (name: string, overrides: Partial<ICustomizationItem>, marketplace = 'team'): ICustomizationItem => ({
			uri: URI.file(`/plugins/${marketplace}/${name}`), type: 'plugin', name, source: AICustomizationSources.plugin, extensionId: undefined, pluginUri: undefined,
			actions: [{ id: 'toggle', label: 'Disable Globally', checked: true, scope: 'global', run: () => { } }],
			...overrides,
		});
		const sessionPluginItems = observableValue<readonly ICustomizationItem[]>('sessionPluginItems', [
			createSessionPlugin('session-assigned', { teamProvided: true }),
			createSessionPlugin('session-required', { teamProvided: true, organizationControl: { requiredEnabled: true } }),
			createSessionPlugin('shared', { teamProvided: true }),
			createSessionPlugin('shared', {}, 'public'),
			createSessionPlugin('shared-one-session-plugin', { teamProvided: true }),
		]);
		const widget = Object.assign(Object.create(PluginListWidget.prototype), { sessionPluginItems });
		const hostPlugin = createSessionPlugin('host-plugin', { teamProvided: true });
		// A session plugin that the runtime reports after its row or detail page is already showing.
		const late = createItem('late');
		const lateStates: boolean[] = [];
		store.add(autorun(reader => lateStates.push(widget.isInstalledPluginTeamProvided(late, reader))));
		sessionPluginItems.set([...sessionPluginItems.get(), createSessionPlugin('late', { teamProvided: true })], undefined);
		assert.deepStrictEqual({
			assigned: widget.isInstalledPluginTeamProvided(createItem('assigned', true)),
			// Team assignment follows the signed-in account, so the plugin's session plugin may be the one reporting it.
			sessionAssigned: widget.isInstalledPluginTeamProvided(createItem('session-assigned')),
			own: widget.isInstalledPluginTeamProvided(createItem('own', false)),
			blocked: widget.isInstalledPluginTeamProvided(createItem('blocked', true, false)),
			sessionRequired: widget.isInstalledPluginTeamProvided(createItem('session-required', true)),
			// Plugins from different marketplaces can share a name, so each takes the provenance of its own session plugin.
			sameName: ['team', 'public'].map(marketplace => widget.isInstalledPluginTeamProvided(createItem('shared', undefined, undefined, marketplace))),
			sameNameOneSessionPlugin: ['team', 'public'].map(marketplace => widget.isInstalledPluginTeamProvided(createItem('shared-one-session-plugin', undefined, undefined, marketplace))),
			lateStates,
			hostLabels: [hostPlugin, { ...hostPlugin, organizationControl: {} }].map(item => widget.getPluginEntryAriaLabel({ type: 'remote-item', item })),
		}, {
			assigned: true, sessionAssigned: true, own: false, blocked: false, sessionRequired: false,
			sameName: [true, false], sameNameOneSessionPlugin: [true, false],
			lateStates: [false, true],
			hostLabels: [
				'host-plugin. Agent host. Assigned by your GitHub Team. You can still enable or disable it.',
				'host-plugin. Agent host. Managed by your organization.',
			],
		});
	});

	test('a runtime-installed plugin is shown as enabled when its session plugin is active, whatever its global setting', () => {
		const createItem = (name: string, globalState: ContributionEnablementState, runtimeInstalled = true): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${name}`);
				override readonly label = name;
				override readonly enablement = constObservable(globalState);
				override readonly copilotCliInstallation = runtimeInstalled ? { name, marketplace: 'team' } : undefined;
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		const createSessionPlugin = (name: string, enabled: boolean | undefined): ICustomizationItem => ({
			uri: URI.file(`/plugins/${name}`), type: 'plugin', name, source: AICustomizationSources.plugin, extensionId: undefined, pluginUri: undefined, enabled,
			actions: [{ id: 'toggle', label: 'Disable Globally', checked: enabled ?? false, scope: 'global', run: () => { } }],
		});
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			sessionPluginItems: observableValue<readonly ICustomizationItem[]>('sessionPluginItems', [
				createSessionPlugin('team-assigned', true), createSessionPlugin('workspace-disabled', false), createSessionPlugin('pending', undefined), createSessionPlugin('local', true),
			]),
		});
		const DisabledProfile = ContributionEnablementState.DisabledProfile;
		const EnabledProfile = ContributionEnablementState.EnabledProfile;
		assert.deepStrictEqual({
			// A GitHub Team assignment turns the plugin on for the session without changing the user's global setting.
			teamAssigned: widget.isInstalledPluginEnabled(createItem('team-assigned', DisabledProfile)),
			workspaceDisabled: widget.isInstalledPluginEnabled(createItem('workspace-disabled', EnabledProfile)),
			// Until the session reports its activation, and for plugins without a session plugin, the global setting applies.
			pending: widget.isInstalledPluginEnabled(createItem('pending', DisabledProfile)),
			withoutSessionPlugin: widget.isInstalledPluginEnabled(createItem('unpaired', DisabledProfile)),
			local: widget.isInstalledPluginEnabled(createItem('local', DisabledProfile, false)),
		}, { teamAssigned: true, workspaceDisabled: false, pending: false, withoutSessionPlugin: false, local: false });
	});

	test('This Workspace badge opens the existing scope action without changing scope until confirmed', async () => {
		let menu: IContextMenuDelegate | undefined;
		let calls = 0;
		const widget: { renderRemotePluginToggle(item: ICustomizationItem, actions: HTMLElement, disposables: DisposableStore): HTMLElement | undefined } = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			filterPlugins: async () => { },
			notificationService: new TestNotificationService(),
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
			contextMenuService: new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void { menu = delegate; }
			}(),
		});
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: undefined,
			actions: [
				{ id: 'toggle', label: 'Disable for Workspace', checked: true, scope: 'workspace', run: () => { throw new Error('Badge must not toggle activation'); } },
				{ id: 'scope', label: 'Use Global Enablement', scope: 'global', run: () => { calls++; } },
			],
		};
		const actions = $('div');
		widget.renderRemotePluginToggle(item, actions, store.add(new DisposableStore()));
		const badge = actions.querySelector<HTMLElement>('.plugin-scope-badge')!;
		badge.click();
		const opened = { calls, expanded: badge.getAttribute('aria-expanded'), choices: menu!.getActions().map(action => action.label) };
		menu!.onHide?.(true);
		const cancelled = { calls, expanded: badge.getAttribute('aria-expanded') };
		badge.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await menu!.getActions()[0].run();
		menu!.onHide?.(false);
		assert.deepStrictEqual({
			role: badge.getAttribute('role'), popup: badge.getAttribute('aria-haspopup'), label: badge.getAttribute('aria-label'),
			opened, cancelled, confirmed: calls,
		}, {
			role: 'button', popup: 'menu', label: 'Manage enablement scope for Native. Current scope: this workspace.',
			opened: { calls: 0, expanded: 'true', choices: ['Use Global Enablement'] },
			cancelled: { calls: 0, expanded: 'false' }, confirmed: 1,
		});
	});

	for (const fail of [false, true]) {
		test(`scope changes show inline progress until ${fail ? 'failure' : 'authoritative refresh completes'}`, async () => {
			const request = new DeferredPromise<void>();
			const refreshStarted = new DeferredPromise<void>();
			const refresh = new DeferredPromise<void>();
			const errors: string[] = [];
			const widget = Object.assign(Object.create(PluginListWidget.prototype), {
				harnessService,
				hoverService: new class extends mock<IHoverService>() {
					override setupDelayedHover() { return toDisposable(() => { }); }
				}(),
				notificationService: new class extends TestNotificationService {
					override error(error: string | Error) { errors.push(String(error)); return super.error(error); }
				}(),
				filterPlugins: () => { refreshStarted.complete(); return refresh.p; },
			});
			const item: ICustomizationItem = {
				uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
				extensionId: undefined, pluginUri: undefined,
				actions: [
					{ id: 'toggle', label: 'Disable for Workspace', checked: true, scope: 'workspace', run: () => { throw new Error('Pending activation must not run'); } },
					{ id: 'scope', label: 'Use Global Enablement', scope: 'global', run: () => request.p },
				],
			};
			const actions = $('div');
			widget.renderRemotePluginToggle(item, actions, store.add(new DisposableStore()));
			const menuActions = store.add(new DisposableStore());
			const [staleToggle, scopeAction] = widget.getRemotePluginActions(item).map((action: Action) => menuActions.add(action));
			const operation = scopeAction.run();
			const snapshot = (container: HTMLElement) => ({
				busy: container.getAttribute('aria-busy'),
				progress: container.querySelector<HTMLElement>('.plugin-scope-progress')!.style.display !== 'none',
				switchDisabled: container.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled,
				badgeDisabled: container.querySelector('.plugin-scope-badge')!.getAttribute('aria-disabled') === 'true',
			});
			const started = snapshot(actions);
			await assert.rejects(() => staleToggle.run(), /cannot be changed right now/);
			const duringRerender = $('div');
			widget.renderRemotePluginToggle({ ...item }, duringRerender, store.add(new DisposableStore()));
			const rerendered = snapshot(duringRerender);
			const disabledActions = widget.getRemotePluginActions(item).map((action: Action) => {
				menuActions.add(action);
				return action.enabled;
			});
			if (fail) {
				request.error(new Error('runtime refused'));
			} else {
				request.complete();
				await refreshStarted.p;
			}
			const untilSettled = snapshot(actions);
			refresh.complete();
			await operation;
			const busy = { busy: 'true', progress: true, switchDisabled: true, badgeDisabled: true };
			assert.deepStrictEqual({
				started, rerendered, disabledActions, untilSettled, completed: snapshot(actions), errors,
			}, {
				started: busy, rerendered: busy, disabledActions: [false, false], untilSettled: busy,
				completed: { busy: 'false', progress: false, switchDisabled: false, badgeDisabled: false },
				errors: fail ? ['Unable to change plugin scope: runtime refused'] : [],
			});
		});
	}

	test('renders unavailable plugin enablement as a disabled switch with an accessible explanation', () => {
		const widget: { renderRemotePluginToggle(item: ICustomizationItem, actions: HTMLElement, disposables: DisposableStore): HTMLElement | undefined } = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
			notificationService: new TestNotificationService(),
		});
		let calls = 0;
		const reason = 'Plugin enablement is unavailable until this chat\'s session is ready.';
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: undefined,
			actions: [{ id: 'toggle', label: 'Enable Globally', enabled: false, checked: false, tooltip: reason, run: () => { calls++; } }],
		};
		const pending = widget.renderRemotePluginToggle(item, $('div'), store.add(new DisposableStore()))!.querySelector('button')!;
		pending.click();
		const pendingCalls = calls;
		const ready = widget.renderRemotePluginToggle({
			...item, actions: [{ ...item.actions![0], enabled: true, tooltip: undefined }],
		}, $('div'), store.add(new DisposableStore()))!.querySelector('button')!;
		ready.click();
		assert.deepStrictEqual({
			pending: { disabled: pending.disabled, label: pending.getAttribute('aria-label'), checked: pending.getAttribute('aria-checked'), calls: pendingCalls },
			ready: { checked: ready.getAttribute('aria-checked'), calls },
		}, {
			pending: { disabled: true, label: `Plugin enablement for Native. ${reason}`, checked: 'false', calls: 0 },
			ready: { checked: 'true', calls: 1 },
		});
	});

	test('plugin activation, organization badges, and enablement locks are independent when rows are reused', () => {
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover() { return toDisposable(() => { }); }
			override setupManagedHover() {
				return { show() { }, hide() { }, update() { }, dispose() { } };
			}
		}();
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService, hoverService,
			notificationService: new TestNotificationService(),
		});
		const renderer = new PluginRemoteItemRenderer(
			(item, actions, disposables) => widget.renderRemoteListActions(item, actions, disposables),
			hoverService,
		);
		const row = $('div');
		const template = renderer.renderTemplate(row);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: undefined,
		};
		const states: readonly Partial<ICustomizationItem>[] = [
			{ enabled: true, teamProvided: true, organizationControl: { requiredEnabled: true } },
			{ enabled: false, teamProvided: true, organizationControl: { requiredEnabled: false } },
			{ enabled: false, organizationControl: { requiredEnabled: true } },
			{ enabled: true, organizationControl: {} },
			{ enabled: false },
			{ enabled: true, organizationControl: {}, actions: [{ id: 'toggle', label: 'Toggle', checked: true, enabled: false, tooltip: 'Not supported', run: () => { } }] },
			{ enabled: true, teamProvided: true },
			{ enabled: false, teamProvided: true },
		];
		assert.deepStrictEqual(states.map(state => {
			renderer.renderElement({
				type: 'remote-item',
				item: {
					...item,
					actions: [{ id: 'toggle', label: 'Toggle', checked: state.enabled !== true, run: () => { } }],
					...state,
				},
			}, 0, template);
			const toggle = row.querySelector<HTMLButtonElement>('[role="switch"]')!;
			return {
				rowDisabled: row.classList.contains('disabled'),
				badgeVisible: row.querySelector<HTMLElement>('.organization-managed-tag')!.style.display !== 'none',
				teamBadgeVisible: row.querySelector<HTMLElement>('.team-provided-tag')!.style.display !== 'none',
				checked: toggle.getAttribute('aria-checked'),
				locked: toggle.disabled,
				label: toggle.getAttribute('aria-label'),
			};
		}), [
			{ rowDisabled: false, badgeVisible: true, teamBadgeVisible: false, checked: 'true', locked: true, label: 'Plugin enablement for Native. Managed by your organization. It is always enabled and can\'t be disabled.' },
			{ rowDisabled: true, badgeVisible: true, teamBadgeVisible: false, checked: 'false', locked: true, label: 'Plugin enablement for Native. Managed by your organization. It is disabled and can\'t be enabled.' },
			{ rowDisabled: true, badgeVisible: true, teamBadgeVisible: false, checked: 'false', locked: true, label: 'Plugin enablement for Native. Managed by your organization. It is always enabled and can\'t be disabled.' },
			{ rowDisabled: false, badgeVisible: true, teamBadgeVisible: false, checked: 'true', locked: false, label: 'Plugin enablement for Native. Toggle' },
			{ rowDisabled: true, badgeVisible: false, teamBadgeVisible: false, checked: 'false', locked: false, label: 'Plugin enablement for Native. Toggle' },
			{ rowDisabled: false, badgeVisible: true, teamBadgeVisible: false, checked: 'true', locked: true, label: 'Plugin enablement for Native. Not supported' },
			{ rowDisabled: false, badgeVisible: false, teamBadgeVisible: true, checked: 'true', locked: false, label: 'Plugin enablement for Native. Toggle' },
			{ rowDisabled: true, badgeVisible: false, teamBadgeVisible: true, checked: 'false', locked: false, label: 'Plugin enablement for Native. Toggle' },
		]);
	});

	test('organization locks prevent switch and scope changes without blocking other actions', async () => {
		const calls: string[] = [];
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
			}(),
		});
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: undefined, enabled: true, organizationControl: { requiredEnabled: true },
			actions: [
				{ id: 'toggle', label: 'Disable for Workspace', checked: true, scope: 'workspace', run: () => { calls.push('toggle'); } },
				{ id: 'scope', label: 'Use Global Enablement', scope: 'global', run: () => { calls.push('scope'); } },
				{ id: 'open', label: 'Open Plugin Folder', run: () => { calls.push('open'); } },
			],
		};
		const controls = $('div');
		widget.renderRemotePluginToggle(item, controls, store.add(new DisposableStore()));
		const toggle = controls.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.click();
		toggle.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const actions: Action[] = widget.getRemotePluginActions(item);
		actions.forEach(action => store.add(action));
		for (const action of actions.slice(0, 2)) {
			await assert.rejects(async () => action.run(), /Managed by your organization/);
		}
		await actions[2].run();
		assert.deepStrictEqual({
			checked: toggle.getAttribute('aria-checked'),
			locked: toggle.disabled,
			scopeLocked: controls.querySelector('.plugin-scope-badge')!.getAttribute('aria-disabled'),
			menuEnabled: actions.map(action => action.enabled),
			calls,
		}, {
			checked: 'true', locked: true, scopeLocked: 'true', menuEnabled: [false, false, true], calls: ['open'],
		});
	});

	test('plugin switches omit routine status but preserve loading and problem icons', () => {
		const widget: { appendRemotePluginRow(parent: HTMLElement, item: ICustomizationItem): void } = Object.assign(Object.create(PluginListWidget.prototype), {
			harnessService,
			hoverService: new class extends mock<IHoverService>() {
				override setupDelayedHover() { return toDisposable(() => { }); }
				override setupManagedHover() {
					return { show() { }, hide() { }, update() { }, dispose() { } };
				}
			}(),
			notificationService: new TestNotificationService(),
			cardDisposables: store.add(new DisposableStore()),
			cardListControllers: new WeakMap(),
			rememberCardFocusElement: () => { },
		});
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/native'), type: 'plugin', name: 'Native', source: AICustomizationSources.plugin,
			extensionId: undefined, pluginUri: undefined,
		};
		const states: readonly Partial<ICustomizationItem>[] = [
			{ enabled: true, status: 'loaded' },
			{ enabled: false, status: 'loaded' },
			{ status: 'loading' },
			{ enabled: false, status: 'degraded' },
			{ enabled: false, status: 'error' },
			{ enabled: false, status: 'error', statusMessage: 'Plugin could not be loaded' },
		];
		assert.deepStrictEqual(states.map(state => {
			const parent = $('div');
			widget.appendRemotePluginRow(parent, {
				...item, ...state,
				actions: [{ id: 'toggle', label: 'Toggle Globally', checked: state.enabled === true, run: () => { } }],
			});
			const status = parent.querySelector<HTMLElement>('.plugin-list-item-status-icon')!;
			return {
				label: parent.firstElementChild!.getAttribute('aria-label'),
				icon: ['loading', 'warning', 'error'].find(kind => status.classList.contains(kind)),
				hidden: status.style.display === 'none',
				checked: parent.querySelector('[role="switch"]')!.getAttribute('aria-checked'),
			};
		}), [
			{ label: 'Native. Agent host', icon: undefined, hidden: true, checked: 'true' },
			{ label: 'Native. Agent host', icon: undefined, hidden: true, checked: 'false' },
			{ label: 'Native. Agent host. Status: Loading', icon: 'loading', hidden: false, checked: 'false' },
			{ label: 'Native. Agent host. Status: Warning', icon: 'warning', hidden: false, checked: 'false' },
			{ label: 'Native. Agent host. Status: Error', icon: 'error', hidden: false, checked: 'false' },
			{ label: 'Native. Agent host. Status: Plugin could not be loaded', icon: 'error', hidden: false, checked: 'false' },
		]);
	});

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

	test('renders the effective state when an enablement write is rejected', async () => {
		const model: IEnablementModel = {
			readEnabled: () => ContributionEnablementState.DisabledProfile,
			readProfileEnabled: () => false,
			setEnabled: () => { },
			remove: () => { },
		};

		assert.strictEqual(
			await setPluginEnablementAndReadEffective(model, new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file('/plugins/plugin');
			}(), ContributionEnablementState.EnabledProfile),
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

	test('keeps collapsed groups collapsed when the plugin list changes', () => {
		const createItem = (name: string, state: ContributionEnablementState): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${name}`);
				override readonly label = name;
				override readonly enablement = constObservable(state);
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		type TreeNode = { readonly element: { readonly type: string; readonly label?: string }; readonly collapsed?: unknown; readonly children?: readonly unknown[] };
		const renders: (readonly TreeNode[] | undefined)[] = [];
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			list: { setChildren: (_input: null, children?: readonly TreeNode[]) => renders.push(children) },
			installedItems: [createItem('workspace-one', ContributionEnablementState.EnabledWorkspace), createItem('user-one', ContributionEnablementState.EnabledProfile)],
			remoteItems: [],
			marketplaceItems: [],
			marketplaceSnapshot: new PluginMarketplaceSnapshotModel(),
			searchQuery: '',
			browseMode: false,
			collapsedGroups: new Set<string>(['user']),
			configurationService: new TestConfigurationService({ [CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true }),
			cardScrollableNode: document.createElement('div'),
			updateToolbarActions: () => { },
			updatePluginTreeEmptyState: () => { },
			workspaceContextService: new class extends mock<IWorkspaceContextService>() {
				override getWorkspace() { return testIWorkspace({ id: 'test', folders: [] }); }
			}(),
		});
		const renderPluginTree = Reflect.get(PluginListWidget.prototype, 'renderPluginTree') as (this: object) => void;
		const describeRenders = () => renders.splice(0).map(children => children?.map(child => `${child.element.label} (${child.children?.length}) ${child.collapsed ? 'collapsed' : 'expanded'}`));

		renderPluginTree.call(widget);
		const initial = describeRenders();
		widget.installedItems = [...widget.installedItems, createItem('user-two', ContributionEnablementState.EnabledProfile)];
		renderPluginTree.call(widget);
		const afterPluginAdded = describeRenders();
		widget.searchQuery = 'one';
		renderPluginTree.call(widget);
		const whileSearching = describeRenders();
		widget.searchQuery = '';
		widget.browseMode = true;
		renderPluginTree.call(widget);
		const whileBrowsing = describeRenders();

		assert.deepStrictEqual({ initial, afterPluginAdded, whileSearching, whileBrowsing }, {
			initial: [['Workspace (1) expanded', 'User (1) collapsed']],
			afterPluginAdded: [['Workspace (1) expanded', 'User (2) collapsed']],
			whileSearching: [['Workspace (1) expanded', 'User (2) expanded']],
			whileBrowsing: [['Workspace (1) expanded', 'User (2) expanded']],
		});
	});

	test('renders Workspace before User even when User has no plugins', () => {
		const createItem = (name: string, state: ContributionEnablementState): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file(`/plugins/${name}`);
				override readonly label = name;
				override readonly enablement = constObservable(state);
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		const renderGroupLabels = (installedItems: readonly IInstalledPluginItem[], remoteItems: readonly ICustomizationItem[] = []): readonly string[] => {
			type TreeNode = { readonly element: { readonly type: string; readonly label?: string } };
			let renderedChildren: readonly TreeNode[] = [];
			const widget = Object.assign(Object.create(PluginListWidget.prototype), {
				list: {
					setChildren: (_input: null, children?: readonly TreeNode[]) => {
						renderedChildren = children ?? [];
					},
				},
				installedItems,
				remoteItems,
				marketplaceItems: [],
				marketplaceSnapshot: new PluginMarketplaceSnapshotModel(),
				searchQuery: '',
				browseMode: false,
				collapsedGroups: new Set<string>(),
				configurationService: new TestConfigurationService({
					[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
				}),
				cardScrollableNode: document.createElement('div'),
				updateToolbarActions: () => { },
				updatePluginTreeEmptyState: () => { },
				workspaceContextService: new class extends mock<IWorkspaceContextService>() {
					override getWorkspace() {
						const uri = URI.file('/workspace');
						return testIWorkspace({ id: 'test', folders: [{ uri, name: 'Workspace', index: 0, toResource: (path: string) => URI.joinPath(uri, path) }] });
					}
				}(),
			});
			const renderPluginTree = Reflect.get(PluginListWidget.prototype, 'renderPluginTree') as (this: object) => void;
			renderPluginTree.call(widget);
			return renderedChildren
				.filter(child => child.element.type === 'group-header')
				.map(child => child.element.label ?? '');
		};
		const workspace = createItem('workspace', ContributionEnablementState.EnabledWorkspace);

		assert.deepStrictEqual({
			bothGroupsPopulated: renderGroupLabels([
				workspace,
				createItem('user', ContributionEnablementState.EnabledProfile),
			]),
			userEmpty: renderGroupLabels([workspace]),
			hostPlugin: renderGroupLabels([], [{
				uri: URI.file('/plugins/host-plugin'),
				type: 'plugin',
				name: 'host-plugin',
				source: AICustomizationSources.plugin,
				extensionId: undefined,
				pluginUri: undefined,
			}]),
		}, {
			bothGroupsPopulated: ['Workspace', 'User'],
			userEmpty: ['Workspace', 'User'],
			hostPlugin: ['Workspace', 'User'],
		});
	});

	test('host plugin accessibility labels do not imply a remote connection', () => {
		const widget: { getPluginEntryAriaLabel(element: { type: 'remote-item'; item: ICustomizationItem }): string } = Object.create(PluginListWidget.prototype);
		const item: ICustomizationItem = {
			uri: URI.file('/plugins/host-plugin'),
			type: 'plugin',
			name: 'host-plugin',
			source: AICustomizationSources.plugin,
			extensionId: undefined,
			pluginUri: undefined,
		};
		assert.deepStrictEqual([
			widget.getPluginEntryAriaLabel({ type: 'remote-item', item }),
			widget.getPluginEntryAriaLabel({ type: 'remote-item', item: { ...item, status: 'loaded' } }),
			widget.getPluginEntryAriaLabel({ type: 'remote-item', item: { ...item, status: 'error', statusMessage: 'Invalid plugin manifest' } }),
			widget.getPluginEntryAriaLabel({ type: 'remote-item', item: { ...item, origin: { kind: 'account', label: 'contoso' } } }),
			widget.getPluginEntryAriaLabel({
				type: 'remote-item',
				item: { ...item, status: 'loading', actions: [{ id: 'toggle', label: 'Enable Globally', checked: false, enabled: false, tooltip: 'Plugin enablement is unavailable until this chat\'s session is ready.', run: () => { } }] },
			}),
		], [
			'host-plugin. Agent host',
			'host-plugin. Agent host. Status: Loaded',
			'host-plugin. Agent host. Status: Error: Invalid plugin manifest',
			'host-plugin. Organization: contoso. Agent host',
			'host-plugin. Agent host. Status: Loading. Plugin enablement is unavailable until this chat\'s session is ready.',
		]);
	});

	test('splits workspace plugin sections in multi-root workspaces', () => {
		const firstUri = URI.file('/workspace/first');
		const secondUri = URI.file('/workspace/second');
		const createItem = (name: string, uri: URI): IInstalledPluginItem => {
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = uri;
				override readonly label = name;
				override readonly enablement = constObservable(ContributionEnablementState.EnabledWorkspace);
			}();
			return { kind: AgentPluginItemKind.Installed, name, description: '', plugin };
		};
		type TreeNode = { readonly element: { readonly type: string; readonly label?: string } };
		let renderedChildren: readonly TreeNode[] = [];
		const folders = [
			{ uri: firstUri, name: 'First', index: 0, toResource: (path: string) => URI.joinPath(firstUri, path) },
			{ uri: secondUri, name: 'Second', index: 1, toResource: (path: string) => URI.joinPath(secondUri, path) },
		];
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			list: { setChildren: (_input: null, children?: readonly TreeNode[]) => renderedChildren = children ?? [] },
			installedItems: [
				createItem('first', URI.joinPath(firstUri, '.github/plugins/first')),
				createItem('second', URI.joinPath(secondUri, '.github/plugins/second')),
			],
			remoteItems: [],
			marketplaceItems: [],
			marketplaceSnapshot: new PluginMarketplaceSnapshotModel(),
			searchQuery: '',
			browseMode: false,
			collapsedGroups: new Set<string>(),
			configurationService: new TestConfigurationService({ [CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true }),
			cardScrollableNode: document.createElement('div'),
			updateToolbarActions: () => { },
			updatePluginTreeEmptyState: () => { },
			workspaceContextService: new class extends mock<IWorkspaceContextService>() {
				override getWorkspace() { return testIWorkspace({ id: 'test', folders }); }
				override getWorkspaceFolder(resource: URI) {
					return folders.find(folder => resource.path.startsWith(folder.uri.path)) ?? null;
				}
			}(),
		});

		(Reflect.get(PluginListWidget.prototype, 'renderPluginTree') as (this: object) => void).call(widget);

		assert.deepStrictEqual(renderedChildren.map(child => child.element.label), ['Workspace · First', 'Workspace · Second', 'User']);
	});

	test('reveals, selects, and focuses an installed plugin by URI', async () => {
		const targetUri = URI.file('/plugins/security');
		const targetEntry = {
			type: 'plugin-item' as const,
			item: {
				plugin: { uri: targetUri },
			},
		};
		const calls: string[] = [];
		const widget = Object.assign(Object.create(PluginListWidget.prototype), {
			browseMode: false,
			searchQuery: '',
			filterPlugins: async () => { },
			currentTreeGroups: [{
				element: { type: 'group-header' },
				children: [targetEntry],
			}],
			list: {
				reveal: (entry: object) => calls.push(entry === targetEntry ? 'reveal' : 'reveal-other'),
				setFocus: (entries: readonly object[]) => calls.push(entries[0] === targetEntry ? 'focus' : 'focus-other'),
				setSelection: (entries: readonly object[]) => calls.push(entries[0] === targetEntry ? 'select' : 'select-other'),
				domFocus: () => calls.push('dom-focus'),
			},
		}) as PluginListWidget;

		assert.deepStrictEqual({
			revealed: await widget.revealAndSelectItemByUri(targetUri),
			calls,
		}, {
			revealed: true,
			calls: ['reveal', 'focus', 'select', 'dom-focus'],
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

	test('shows installed plugin locations in place of marketplace descriptions', () => {
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI): string {
				return uri.path.replace('/home/dev', '~');
			}
		}();
		const createPlugin = (uri: URI, fromMarketplace?: Pick<IMarketplacePlugin, 'description' | 'marketplace'>) => new class extends mock<IAgentPlugin>() {
			override readonly uri = uri;
			override readonly label = uri.path.substring(uri.path.lastIndexOf('/') + 1);
			override readonly fromMarketplace = fromMarketplace as IMarketplacePlugin | undefined;
		}();
		const items = [
			installedPluginToItem(createPlugin(URI.file('/home/dev/.copilot/installed-plugins/local/example')), labelService),
			installedPluginToItem(createPlugin(URI.file('/home/dev/.vscode/agent-plugins/github.com/example/figma'), { description: 'Design system workflows\nSecond line', marketplace: 'copilot' }), labelService),
		];

		assert.deepStrictEqual(items.map(item => ({
			name: item.name,
			location: item.location,
			matchesLocation: installedPluginMatchesQuery(item, 'agent-plugins'),
			matchesSpacedLocation: installedPluginMatchesQuery(item, 'agent plugins'),
			matchesDescription: installedPluginMatchesQuery(item, 'design system'),
			matchesDashedDescription: installedPluginMatchesQuery(item, 'design-system'),
		})), [
			{ name: 'example', location: '~/.copilot/installed-plugins/local', matchesLocation: false, matchesSpacedLocation: false, matchesDescription: false, matchesDashedDescription: false },
			{ name: 'figma', location: '~/.vscode/agent-plugins/github.com/example', matchesLocation: true, matchesSpacedLocation: true, matchesDescription: true, matchesDashedDescription: true },
		]);
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

	test('legacy Available retains its marketplaces until Marketplace visibility is enabled', () => {
		const cases = [
			{ marketplace: false, available: true },
			{ marketplace: true, available: false },
		];
		assert.deepStrictEqual(cases.map(({ marketplace }) =>
			shouldShowLegacyPluginMarketplace(new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplace,
			}))), cases.map(({ available }) => available));
	});

	test('keeps empty group headers visible until search filtering starts', () => {
		assert.deepStrictEqual([
			shouldShowPluginTree('', 0),
			shouldShowPluginTree('  ', 0),
			shouldShowPluginTree('agent', 0),
			shouldShowPluginTree('agent', 1),
		], [true, true, false, true]);
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
