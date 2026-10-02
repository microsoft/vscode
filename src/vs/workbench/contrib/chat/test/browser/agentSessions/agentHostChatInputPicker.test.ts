/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, ActionListWidget, IActionListDelegate, IActionListItem, IActionListItemInlineToggle, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentConnection, IAgentHostNetworkDiagnosticsInfo, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { toAgentHostBackendSessionUri } from '../../../browser/agentSessions/agentHost/agentHostSessionUri.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, IManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatWidget } from '../../../browser/chat.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { withSessionSandboxPolicy } from '../../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import type { ResolveSessionConfigResult, SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { AgentHostChatInputPicker, getAgentHostSandboxSettingId, getConfigPickerAccessibleTriggerLabel, getConfigPickerItemHover, getConfigPickerListOptions, getConfigPickerTriggerHover, getConfigPickerTriggerLabel, isGenericConfigPickerProperty, resolveConfigChipValue } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { getAgentHostPickerProperty, OpenAgentHostAutoApprovePickerAction, OpenAgentHostCodexApprovalsPickerAction, OpenAgentHostModePickerAction, OpenAgentHostPermissionModePickerAction } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.js';
import { isAutoApproveValuePolicyRestricted, normalizeSessionConfigValue } from '../../../common/agentHostConfigPolicy.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { IChatPhoneInputPresenter } from '../../../browser/widget/input/chatPhoneInputPresenter.js';
import { AGENT_HOST_PERMISSIONS_SETTINGS_QUERY, createModePickerPermissionsItems, MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE, renderModePickerPermissions, renderModePickerTrigger, shouldCombineModeAndPermissions } from '../../../browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { resetShownWarnings } from '../../../common/chatPermissionWarnings.js';
import { IOpenSettingsOptions, IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import '../../../browser/agentSessions/agentHost/media/agentHostChatInputPicker.css';
import '../../../browser/widget/media/chat.css';

suite('AgentHostChatInputPicker - combined mode and permissions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => resetShownWarnings());
	const permissionPresentations = [
		{ label: 'Manual permissions', level: ChatPermissionLevel.Default, sandboxed: false },
		{ label: 'Assisted permissions', level: ChatPermissionLevel.Assisted, sandboxed: false },
		{ label: 'Allow all', level: ChatPermissionLevel.AutoApprove, sandboxed: false },
	];

	const isVerticallyCentered = (element: HTMLElement, container: HTMLElement): boolean => {
		const elementBounds = element.getBoundingClientRect();
		const containerBounds = container.getBoundingClientRect();
		const offset = elementBounds.top + elementBounds.height / 2 - containerBounds.top - containerBounds.height / 2;
		return Math.abs(offset) < 0.5;
	};

	function createPermissionsWidget() {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		const container = dom.append(document.body, dom.$('.action-widget'));
		store.add(toDisposable(() => container.remove()));
		const items = permissionPresentations.flatMap(permissions => createModePickerPermissionsItems<IAction>(permissions, [], async () => { }));
		const widget = store.add(instantiationService.createInstance(ActionListWidget<IAction>, 'permissionsLayout', false, items, {
			onSelect: () => { },
			onHide: () => { },
		}, undefined, undefined));
		dom.append(container, widget.domNode);
		return { container, widget };
	}

	function setup(combined = true, getHostInfo: () => Promise<IAgentHostNetworkDiagnosticsInfo> = async () => ({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] }), remoteAuthority?: string) {
		const configuration = new class extends TestConfigurationService {
			policyRestricted = false;
			override inspect<T>(key: string): IConfigurationValue<T> {
				const result = super.inspect<T>(key);
				return { ...result, policyValue: this.policyRestricted && key === ChatConfiguration.GlobalAutoApprove ? result.value : undefined };
			}
		}({
			[ChatConfiguration.ExperimentalModePermissionsPicker]: combined,
			[ChatConfiguration.PermissionsSandboxToggleEnabled]: true,
			[ChatConfiguration.GlobalAutoApprove]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const config: ResolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					mode: { title: 'Mode', type: 'string', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'], sessionMutable: true },
					autoApprove: { title: 'Permissions', type: 'string', enum: ['default', 'assisted', 'autoApprove'], enumLabels: ['Manual permissions', 'Assisted permissions', 'Allow all'], sessionMutable: true },
					[SessionConfigKey.SandboxEnabled]: { title: 'Sandbox', type: 'string', enum: ['default', 'on', 'off'], sessionMutable: true },
				},
			},
			values: { mode: 'interactive', autoApprove: 'assisted' },
		};
		const widget = new class extends mock<IChatWidget>() {
			override readonly onDidChangeViewModel = Event.None;
			override viewModel: IChatViewModel | undefined;
		}();
		const onDidShow = store.add(new Emitter<void>());
		const branchCompletionQueries: (string | undefined)[] = [];
		const branchCompletionProperties: string[] = [];
		const branchCompletionItems: SessionConfigValueItem[] = [];
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override isVisible = false;
			showCount = 0;
			items: readonly IActionListItem<unknown>[] = [];
			anchor: Parameters<IActionWidgetService['show']>[4] | undefined;
			options: IActionListOptions | undefined;
			selectedLabels: (string | undefined)[] = [];
			select: (label: string) => Promise<void> = async () => { };
			filterLabels: (query: string) => Promise<(string | undefined)[]> = async () => [];
			onHide: (() => void) | undefined;
			override show<T>(_id: string, _preview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, anchor: Parameters<IActionWidgetService['show']>[4], _container: Parameters<IActionWidgetService['show']>[5], _actions?: Parameters<IActionWidgetService['show']>[6], _accessibility?: Parameters<IActionWidgetService['show']>[7], options?: IActionListOptions): void {
				this.showCount++;
				this.items = items;
				this.anchor = anchor;
				this.options = options;
				this.selectedLabels = items.filter(item => _accessibility?.isChecked?.(item) === true).map(item => item.label);
				this.isVisible = true;
				this.onHide = delegate.onHide;
				this.select = async label => {
					const item = items.find(item => item.label === label)?.item;
					if (item) {
						await delegate.onSelect(item);
					}
				};
				this.filterLabels = async query => (await delegate.onFilter?.(query, CancellationToken.None) ?? []).map(item => item.label);
				onDidShow.fire();
			}
			override updateItems<T>(items: readonly IActionListItem<T>[]): void {
				this.items = items;
			}
			override hide(): void {
				this.isVisible = false;
				const onHide = this.onHide;
				this.onHide = undefined;
				onHide?.();
			}
		}();
		const dispatches: { type: string; config: Record<string, unknown> }[] = [];
		const settingsRequests: IOpenSettingsOptions[] = [];
		const hoverTargets: HTMLElement[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		const onAgentHostStart = store.add(new Emitter<void>());
		let diagnosticsRequests = 0;
		const logErrors: (string | Error)[] = [];
		instantiationService.set(ILogService, store.add(new class extends NullLogService {
			override error(message: string | Error): void { logErrors.push(message); }
		}()));
		const connection = instantiationService.stub(IAgentHostService, {
			onAgentHostStart: onAgentHostStart.event,
			getNetworkDiagnosticsInfo: () => {
				diagnosticsRequests++;
				return getHostInfo();
			},
			sessionConfigCompletions: async params => {
				branchCompletionQueries.push(params.query);
				branchCompletionProperties.push(params.property);
				return { items: branchCompletionItems };
			},
			dispatch: (_session, action) => {
				if (action.type === ActionType.SessionConfigChanged) {
					dispatches.push(action);
				}
			}
		});
		const sessionResolutions = new Map<string, IAgentHostSessionResolution>();
		instantiationService.stub(IAgentHostConnectionsService, {
			ambientConnection: connection,
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: sessionResource => {
				const resolution = sessionResolutions.get(sessionResource.toString());
				if (resolution) {
					return resolution;
				}
				const backendSession = toAgentHostBackendSessionUri(sessionResource);
				return backendSession ? { connection, backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY } : undefined;
			},
		});
		instantiationService.set(IActionWidgetService, actionWidget);
		instantiationService.set(IConfigurationService, configuration);
		instantiationService.stub(IHoverService, {
			setupDelayedHover: target => {
				hoverTargets.push(target);
				return { dispose: () => { } };
			},
		});
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(IDialogService, new TestDialogService(undefined, { result: true }));
		instantiationService.set(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IPreferencesService, {
			openSettings: async options => {
				assert.ok(options);
				settingsRequests.push(options);
				return undefined;
			},
		});
		instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, { resolve: () => undefined });
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: 'test', folders: [] }) });
		instantiationService.stub(IAgentHostNewSessionFolderService, { getFolder: () => undefined, getDefaultFolder: () => undefined, isNoFolderSelected: () => false });
		const resolvedRefreshes: Record<string, unknown>[] = [];
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, { onDidChange: Event.None, get: () => undefined, getResolvedConfig: () => undefined, refreshResolvedConfig: async (_resource, _provider, _directory, values) => { resolvedRefreshes.push(values ?? {}); } });
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
		const managedSandboxAllowsBypass = observableValue('managedSandboxAllowsBypass', false);
		instantiationService.stub(IAgentHostEnablementService, { managedSandboxEnforced, managedSandboxAllowsBypass });
		instantiationService.stub(IChatPhoneInputPresenter, { enabled: constObservable(false) });
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority });
		const modePicker = store.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, SessionConfigKey.Mode));
		const permissionPicker = store.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, SessionConfigKey.AutoApprove));
		const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/test-session' });
		widget.viewModel = new class extends mock<IChatViewModel>() {
			override readonly sessionResource = sessionResource;
		}();
		modePicker['_initialResolved'] = permissionPicker['_initialResolved'] = { sessionResource, result: config };
		const modeContainer = dom.$('div');
		const permissionContainer = dom.$('div');
		modePicker.render(modeContainer);
		permissionPicker.render(permissionContainer);
		const sandboxReady = () => timeout(0);
		const setSession = (sessionResource: URI, backendSession: URI, host: IAgentConnection, provider = backendSession.scheme) => {
			sessionResolutions.set(sessionResource.toString(), { connection: host, backendSession, connectionAuthority: 'test-host' });
			widget.viewModel = new class extends mock<IChatViewModel>() {
				override readonly sessionResource = sessionResource;
			}();
			const state = new class extends mock<SessionState>() {
				override readonly provider = provider;
				override readonly config = config;
				override _meta: Record<string, unknown> | undefined;
			}();
			for (const picker of [modePicker, permissionPicker]) {
				const sub = new class extends mock<IAgentSubscription<SessionState>>() {
					override readonly value = state;
				}();
				picker['_initialResolved'] = undefined;
				picker['_subRef'].value = Object.assign(toDisposable(() => { }), {
					sessionResource, backendSession, connection: host, generation: picker['_sessionGeneration'], sub,
				});
			}
			return state;
		};
		return { modePicker, permissionPicker, modeContainer, permissionContainer, configuration, config, actionWidget, widget, instantiationService, branchCompletionQueries, branchCompletionProperties, branchCompletionItems, dispatches, resolvedRefreshes, connection, settingsRequests, hoverTargets, onDidShow: onDidShow.event, sandboxReady, setSession, managedSandboxEnforced, managedSandboxAllowsBypass, logErrors, diagnosticsRequests: () => diagnosticsRequests, fireHostStart: () => onAgentHostStart.fire() };
	}

	test('native approval bindings restrict combined choices and write the original host key', async () => {
		const rig = setup();
		delete rig.config.schema.properties.autoApprove;
		delete rig.config.schema.properties.sandboxEnabled;
		rig.config.schema.properties.approvalMode = { type: 'string', title: 'Permissions', enum: ['manual', 'assisted', 'allow-all'], default: 'assisted', sessionMutable: true };
		rig.config.schema.properties.effectiveApprovalMode = { type: 'string', title: 'Effective permissions', readOnly: true };
		rig.config.schema.properties.availableApprovalModes = { type: 'array', title: 'Available permissions', readOnly: true };
		rig.config.values = { mode: 'interactive', approvalMode: 'allow-all', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual', 'assisted'], unsupportedClientValue: 'ignored' };
		rig.setSession(URI.parse('agent-host-other:/opaque-session'), URI.parse('native-provider:/host-owned-session'), rig.connection);
		rig.modePicker.render(rig.modeContainer);
		rig.permissionPicker.render(rig.permissionContainer);
		const context = rig.permissionPicker['_readContext']();
		await rig.modePicker['_showPicker'](rig.modeContainer.querySelector<HTMLElement>('.agent-host-permissions-button')!, true);
		const choices = rig.actionWidget.items.filter(item => ['Manual permissions', 'Assisted permissions', 'Allow all'].includes(item.label ?? '')).map(item => item.label);
		await rig.actionWidget.select('Assisted permissions');
		assert.deepStrictEqual({
			choices,
			effective: context?.value,
			hover: context?.approvalHover,
			standaloneHidden: rig.permissionContainer.style.display,
			dispatches: rig.dispatches,
			refreshes: rig.resolvedRefreshes,
		}, {
			choices: ['Manual permissions', 'Assisted permissions'],
			effective: 'default',
			hover: 'Effective permissions: manual. Requested permissions: allow-all.',
			standaloneHidden: 'none',
			dispatches: [{ type: ActionType.SessionConfigChanged, config: { approvalMode: 'assisted' } }],
			refreshes: [{ mode: 'interactive', approvalMode: 'assisted' }],
		});
	});

	test('malformed VS approval keys use generic fallback without mixing Copilot aliases', () => {
		const rig = setup(false);
		rig.config.schema.properties.autoApprove = { type: 'string', title: 'Custom approvals', enum: ['custom'], sessionMutable: true };
		rig.config.schema.properties.approvalMode = { type: 'string', title: 'Native approvals', enum: ['manual', 'assisted', 'allow-all'], sessionMutable: true };
		rig.config.values = { autoApprove: 'custom', approvalMode: 'allow-all' };
		rig.permissionPicker.render(rig.permissionContainer);
		assert.deepStrictEqual({
			hidden: rig.permissionContainer.style.display,
			generic: Object.entries(rig.config.schema.properties).filter(([key, schema]) => isGenericConfigPickerProperty(key, schema, true, rig.config.schema)).map(([key]) => key),
		}, {
			hidden: 'none', generic: ['autoApprove'],
		});
	});

	test('native base-branch completions and selections retain baseBranch rather than the new branch name', async () => {
		const rig = setup(false);
		rig.config.schema.properties.target = { type: 'string', title: 'Target', enum: ['workspace', 'worktree'], sessionMutable: false };
		rig.config.schema.properties.baseBranch = { type: 'string', title: 'Base branch', enumDynamic: true, sessionMutable: true };
		rig.config.schema.properties.branch = { type: 'string', title: 'New branch', sessionMutable: false };
		rig.config.values = { target: 'worktree', baseBranch: 'main', branch: 'new-session-branch' };
		rig.branchCompletionItems.push({ value: 'main', label: 'main' }, { value: 'dev', label: 'dev' });
		const viewModel = rig.widget.viewModel!;
		rig.widget.viewModel = undefined;
		const picker = store.add(rig.instantiationService.createInstance(AgentHostChatInputPicker, rig.widget, SessionConfigKey.Branch));
		rig.widget.viewModel = viewModel;
		picker['_initialResolved'] = { sessionResource: viewModel.sessionResource, result: rig.config };
		const container = dom.$('div');
		picker.render(container);
		await picker['_showPicker'](container.querySelector<HTMLElement>('.action-label')!);
		await rig.actionWidget.select('dev');
		assert.deepStrictEqual({ properties: rig.branchCompletionProperties, dispatches: rig.dispatches }, {
			properties: ['baseBranch'],
			dispatches: [{ type: ActionType.SessionConfigChanged, config: { baseBranch: 'dev' } }],
		});
	});

	test('readonly or nonmutable native approval properties never become runtime writes', async () => {
		const rig = setup(false);
		delete rig.config.schema.properties.autoApprove;
		rig.config.schema.properties.approvalMode = { type: 'string', title: 'Permissions', enum: ['manual', 'assisted', 'allow-all'], readOnly: true, sessionMutable: true };
		rig.config.values = { approvalMode: 'manual' };
		const anchor = dom.$('div');
		await rig.permissionPicker['_showPicker'](anchor);
		rig.config.schema.properties.approvalMode.readOnly = false;
		rig.config.schema.properties.approvalMode.sessionMutable = false;
		await rig.permissionPicker['_showPicker'](anchor);
		assert.deepStrictEqual({ shows: rig.actionWidget.showCount, dispatches: rig.dispatches }, { shows: 0, dispatches: [] });
	});

	test('branch picker filters the full list locally and reloads it only when reopened', async () => {
		const { config, widget, instantiationService, actionWidget, branchCompletionItems, branchCompletionQueries } = setup(false);
		config.schema.properties[SessionConfigKey.Branch] = { title: 'Branch', type: 'string', enumDynamic: true, default: 'main', sessionMutable: true };
		config.values[SessionConfigKey.Branch] = 'main';
		branchCompletionItems.push(
			{ value: 'main', label: 'main' },
			...Array.from({ length: 35 }, (_, index) => ({ value: `feature/${index}`, label: `feature/${index}` })),
		);
		const viewModel = widget.viewModel!;
		widget.viewModel = undefined;
		const branchPicker = store.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, SessionConfigKey.Branch));
		widget.viewModel = viewModel;
		branchPicker['_initialResolved'] = { sessionResource: viewModel.sessionResource, result: config };
		const container = dom.$('div');
		branchPicker.render(container);
		const trigger = container.querySelector<HTMLElement>('.action-label')!;

		await branchPicker['_showPicker'](trigger);
		const initialLabels = actionWidget.items.map(item => item.label);
		const filteredLabels = await actionWidget.filterLabels('FEATURE/34');
		const queriesAfterFilter = [...branchCompletionQueries];
		actionWidget.hide();
		await branchPicker['_showPicker'](trigger);

		assert.deepStrictEqual({
			initialCount: initialLabels.length,
			first: initialLabels[0],
			last: initialLabels.at(-1),
			filteredLabels,
			queriesAfterFilter,
			queriesAfterReopen: branchCompletionQueries,
		}, {
			initialCount: 36,
			first: 'main',
			last: 'feature/34',
			filteredLabels: ['feature/34'],
			queriesAfterFilter: [undefined],
			queriesAfterReopen: [undefined, undefined],
		});
	});

	test('branch picker includes a selected remote branch that is absent from local completions', async () => {
		const { config, widget, instantiationService, actionWidget, branchCompletionItems } = setup(false);
		config.schema.properties[SessionConfigKey.Branch] = { title: 'Branch', type: 'string', enumDynamic: true, default: 'origin/feature', sessionMutable: true };
		config.values[SessionConfigKey.Branch] = 'origin/feature';
		branchCompletionItems.push(
			{ value: 'main', label: 'main' },
			{ value: 'feature', label: 'feature' },
		);
		const viewModel = widget.viewModel!;
		widget.viewModel = undefined;
		const branchPicker = store.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, SessionConfigKey.Branch));
		widget.viewModel = viewModel;
		branchPicker['_initialResolved'] = { sessionResource: viewModel.sessionResource, result: config };
		const container = dom.$('div');
		branchPicker.render(container);

		await branchPicker['_showPicker'](container.querySelector<HTMLElement>('.action-label')!);
		const filteredLabels = await actionWidget.filterLabels('main');

		assert.deepStrictEqual({
			labels: actionWidget.items.map(item => item.label),
			filteredLabels,
		}, {
			labels: ['origin/feature', 'main', 'feature'],
			filteredLabels: ['main'],
		});
	});

	function createRemoteConnection(getHostInfo: () => Promise<IAgentHostNetworkDiagnosticsInfo>) {
		return new class extends mock<IAgentConnection>() {
			diagnosticsRequests = 0;
			readonly writes: { channel: string; action: Parameters<IAgentConnection['dispatch']>[1] }[] = [];
			override getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				this.diagnosticsRequests++;
				return getHostInfo();
			}
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				this.writes.push({ channel, action });
			}
		}();
	}

	for (const os of ['linux', 'win32']) {
		test(`shows the remote Copilot sandbox toggle using the ${os} host and writes to its connection`, async () => {
			const { permissionPicker, configuration, config, actionWidget, sandboxReady, setSession, dispatches } = setup(false);
			await sandboxReady();
			const remote = createRemoteConnection(async () => ({ version: '1', os, arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] }));
			const sessionResource = URI.from({ scheme: remoteAgentHostSessionTypeId('test-host', 'copilotcli'), path: '/remote-session' });
			const backendSession = URI.parse('copilotcli:/remote-session');
			setSession(sessionResource, backendSession, remote);
			await configuration.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, 'off');
			permissionPicker['_getSandboxSettingId']();
			await sandboxReady();
			await permissionPicker['_showPicker'](dom.$('div'));
			const toggle = actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle;
			assert.ok(toggle);
			const checked = toggle.checked;
			toggle.onChange(!checked);
			await timeout(0);
			await configuration.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, false);
			const hiddenWhenDisabled = permissionPicker['_getSandboxStandaloneToggle']() === undefined;
			await configuration.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
			delete config.schema.properties[SessionConfigKey.SandboxEnabled];

			assert.deepStrictEqual({
				checked,
				setting: permissionPicker['_getSandboxSettingId'](),
				remoteRequests: remote.diagnosticsRequests,
				remoteWrites: remote.writes,
				localWrites: dispatches,
				hiddenWhenDisabled,
				hiddenWithoutSchema: permissionPicker['_getSandboxStandaloneToggle']() === undefined,
			}, {
				checked: false,
				setting: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot),
				remoteRequests: 0,
				remoteWrites: [{ channel: backendSession.toString(), action: { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: checked ? 'off' : 'on' } } }],
				localWrites: [],
				hiddenWhenDisabled: true,
				hiddenWithoutSchema: true,
			});
		});
	}

	test('keeps the unified sandbox setting when switching between remote Copilot hosts', async () => {
		const { permissionPicker, sandboxReady, setSession, configuration, fireHostStart } = setup(false);
		await sandboxReady();
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const first = createRemoteConnection(() => pending.p);
		const second = createRemoteConnection(async () => ({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] }));
		await configuration.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, 'off');
		const backend = URI.parse('copilotcli:/session');
		const firstResource = URI.from({ scheme: remoteAgentHostSessionTypeId('first', 'copilotcli'), path: '/session' });
		setSession(firstResource, backend, first);
		permissionPicker['_getSandboxSettingId']();
		setSession(URI.from({ scheme: remoteAgentHostSessionTypeId('second', 'copilotcli'), path: '/session' }), backend, second);
		permissionPicker['_getSandboxSettingId']();
		await sandboxReady();
		await pending.complete({ version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		fireHostStart();
		await timeout(0);
		const secondState = { setting: permissionPicker['_getSandboxSettingId'](), checked: permissionPicker['_getSandboxStandaloneToggle']()?.checked };
		setSession(firstResource, backend, first);
		permissionPicker['_getSandboxSettingId']();
		await sandboxReady();
		assert.deepStrictEqual({
			secondState,
			firstState: { setting: permissionPicker['_getSandboxSettingId'](), checked: permissionPicker['_getSandboxStandaloneToggle']()?.checked },
			requests: [first.diagnosticsRequests, second.diagnosticsRequests],
		}, {
			secondState: { setting: AgentSandboxSettingId.AgentSandboxEnabled, checked: false },
			firstState: { setting: AgentSandboxSettingId.AgentSandboxEnabled, checked: false },
			requests: [0, 0],
		});
	});

	test('uses local managed policy only on desktop until host sandbox policy arrives', async () => {
		const { permissionPicker, sandboxReady, setSession, config, actionWidget, managedSandboxEnforced, managedSandboxAllowsBypass, instantiationService, widget, dispatches } = setup(false);
		await sandboxReady();
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		const read = () => {
			const toggle = permissionPicker['_getSandboxStandaloneToggle']()!;
			return { checked: toggle.checked, disabled: toggle.disabled };
		};
		managedSandboxEnforced.set(true, undefined);
		const draft = read();
		managedSandboxAllowsBypass.set(true, undefined);
		const bypassAllowed = read();
		managedSandboxAllowsBypass.set(false, undefined);
		const resource = widget.viewModel!.sessionResource;
		const state = setSession(resource, toAgentHostBackendSessionUri(resource)!, instantiationService.get(IAgentHostService));
		const running = read();
		await permissionPicker['_showPicker'](dom.$('div'));
		const toggle = actionWidget.items.find(item => item.standaloneToggle)!.standaloneToggle!;
		toggle.onChange(false);
		state._meta = withSessionSandboxPolicy(undefined, { enabled: false });
		permissionPicker['_sandboxConfigChanged'].trigger(undefined);
		const published = read();
		actionWidget.hide();
		assert.deepStrictEqual({ draft, bypassAllowed, running, published, dispatches }, {
			draft: { checked: !isWeb, disabled: !isWeb },
			bypassAllowed: { checked: !isWeb, disabled: !isWeb },
			running: { checked: !isWeb, disabled: !isWeb },
			published: { checked: false, disabled: false },
			dispatches: [],
		});
	});

	test('does not use renderer sandbox policy for the ambient host in a remote window', async () => {
		const { permissionPicker, sandboxReady, config, managedSandboxEnforced } = setup(false, undefined, 'ssh-remote+test');
		await sandboxReady();
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		managedSandboxEnforced.set(true, undefined);
		const toggle = permissionPicker['_getSandboxStandaloneToggle']()!;
		assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled }, { checked: false, disabled: false });
	});

	test('preserves managed sandbox enforcement and session overrides for remote Copilot', async () => {
		const { permissionPicker, sandboxReady, setSession, config } = setup(false);
		await sandboxReady();
		const remote = createRemoteConnection(async () => ({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] }));
		const state = setSession(URI.from({ scheme: remoteAgentHostSessionTypeId('test-host', 'copilotcli'), path: '/session' }), URI.parse('ahp://remote/session/123'), remote, 'copilotcli');
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		state._meta = withSessionSandboxPolicy(undefined, { enabled: true });
		const required = permissionPicker['_getSandboxStandaloneToggle']()!;
		required.onChange(false);
		const requiredState = { checked: required.checked, disabled: required.disabled, writes: remote.writes.length };
		state._meta = withSessionSandboxPolicy(undefined, { enabled: true, allowBypass: true });
		const optional = permissionPicker['_getSandboxStandaloneToggle']()!;
		const optionalState = { checked: optional.checked, disabled: optional.disabled };
		config.values[SessionConfigKey.SandboxEnabled] = 'on';
		await sandboxReady();
		assert.deepStrictEqual({
			requiredState,
			optionalState,
			sessionEnabled: permissionPicker['_getSandboxStandaloneToggle']()?.checked,
		}, {
			requiredState: { checked: true, disabled: true, writes: 0 },
			optionalState: { checked: true, disabled: true },
			sessionEnabled: true,
		});

	});

	test('uses host-confirmed sandbox defaults while preserving optimistic session choices', async () => {
		const { permissionPicker, sandboxReady, setSession, config, configuration, widget, instantiationService } = setup(false);
		await sandboxReady();
		const resource = widget.viewModel!.sessionResource;
		const state = setSession(resource, toAgentHostBackendSessionUri(resource)!, instantiationService.get(IAgentHostService));
		await configuration.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, 'off');
		delete config.values[SessionConfigKey.SandboxEnabled];
		state._meta = withSessionSandboxState(undefined, { enabled: true });
		const confirmed = permissionPicker['_getSandboxStandaloneToggle']()!.checked;
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		const optimistic = permissionPicker['_getSandboxStandaloneToggle']()!.checked;
		config.values[SessionConfigKey.SandboxEnabled] = 'on';
		const restored = permissionPicker['_getSandboxStandaloneToggle']()!.checked;
		assert.deepStrictEqual({ confirmed, optimistic, restored }, { confirmed: true, optimistic: false, restored: true });
	});

	test('remote sandbox policy updates the open picker and does not leak across hosts', async () => {
		const { permissionPicker, sandboxReady, setSession, config, actionWidget, managedSandboxEnforced } = setup(false);
		await sandboxReady();
		const remote = createRemoteConnection(async () => ({ version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] }));
		const state = setSession(URI.from({ scheme: remoteAgentHostSessionTypeId('first', 'copilotcli'), path: '/session' }), URI.parse('ahp://first/session/1'), remote, 'copilotcli');
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		managedSandboxEnforced.set(true, undefined);
		const withoutMetadata = permissionPicker['_getSandboxStandaloneToggle']()!.disabled;
		await sandboxReady();
		await permissionPicker['_showPicker'](dom.$('div'));
		const staleToggle = actionWidget.items.find(item => item.standaloneToggle)!.standaloneToggle!;
		state._meta = withSessionSandboxPolicy(undefined, { enabled: true, allowBypass: false });
		permissionPicker['_sandboxConfigChanged'].trigger(undefined);
		staleToggle.onChange(true);
		const required = actionWidget.items.find(item => item.standaloneToggle)!.standaloneToggle!;
		const enforced = { checked: required.checked, disabled: required.disabled, title: required.title };
		state._meta = withSessionSandboxPolicy(undefined, { enabled: false });
		permissionPicker['_sandboxConfigChanged'].trigger(undefined);
		const removed = actionWidget.items.find(item => item.standaloneToggle)!.standaloneToggle!;
		actionWidget.hide();
		setSession(URI.from({ scheme: remoteAgentHostSessionTypeId('second', 'copilotcli'), path: '/session' }), URI.parse('ahp://second/session/1'), remote, 'copilotcli');
		assert.deepStrictEqual({
			withoutMetadata,
			enforced,
			removed: { checked: removed.checked, disabled: removed.disabled },
			otherHost: permissionPicker['_getSandboxStandaloneToggle']()!.disabled,
			writes: remote.writes,
		}, {
			withoutMetadata: false,
			enforced: { checked: true, disabled: true, title: 'Sandboxing is required by your organization' },
			removed: { checked: false, disabled: false },
			otherHost: false,
			writes: [],
		});
	});

	for (const provider of ['claude', 'codex'] as const) {
		test(`hides the sandbox toggle for remote ${provider} without querying its OS`, async () => {
			const { permissionPicker, sandboxReady, setSession } = setup(false);
			await sandboxReady();
			const remote = createRemoteConnection(async () => { throw new Error('Unexpected diagnostics request'); });
			setSession(URI.from({ scheme: remoteAgentHostSessionTypeId('test-host', provider), path: '/session' }), URI.from({ scheme: provider, path: '/session' }), remote);
			assert.deepStrictEqual({
				setting: permissionPicker['_getSandboxSettingId'](),
				toggle: permissionPicker['_getSandboxStandaloneToggle'](),
				requests: remote.diagnosticsRequests,
			}, { setting: undefined, toggle: undefined, requests: 0 });
		});
	}

	test('uses one shared tooltip for the combined label', () => {
		const { modeContainer, hoverTargets } = setup();
		assert.deepStrictEqual(hoverTargets.map(target => target === modeContainer.querySelector('.action-label')), [true]);
	});

	for (const os of ['linux', 'win32']) {
		test(`uses the unified setting without requesting ${os} host diagnostics`, async () => {
			const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
			const { modePicker, permissionPicker, configuration, modeContainer, actionWidget, sandboxReady, diagnosticsRequests } = setup(true, () => pending.p);
			const fallbackSettingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot)!;
			await configuration.setUserConfiguration(fallbackSettingId, 'off');
			await modePicker['_showPicker'](document.createElement('div'));
			const pendingState = {
				settings: [modePicker['_getSandboxSettingId'](), permissionPicker['_getSandboxSettingId']()],
				checked: actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle?.checked,
				menuOpen: actionWidget.isVisible,
			};

			await pending.complete({ version: '1', os, arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
			await sandboxReady();
			const expectedSettingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot);

			assert.deepStrictEqual({
				pendingState,
				settings: [modePicker['_getSandboxSettingId'](), permissionPicker['_getSandboxSettingId']()],
				checked: modePicker['_getSandboxStandaloneToggle'](SessionConfigKey.AutoApprove)?.checked,
				shield: !!modeContainer.querySelector('.agent-host-mode-sandbox-icon'),
				menuOpen: actionWidget.isVisible,
				requests: diagnosticsRequests(),
			}, {
				pendingState: { settings: [fallbackSettingId, fallbackSettingId], checked: false, menuOpen: true },
				settings: [expectedSettingId, expectedSettingId],
				checked: false,
				shield: false,
				menuOpen: true,
				requests: 0,
			});
		});
	}

	test('supports sandboxing when host diagnostics are unavailable', async () => {
		const { modePicker, permissionPicker, configuration, actionWidget, sandboxReady, diagnosticsRequests, logErrors } = setup(true, async () => {
			throw new Error('Host diagnostics unavailable');
		});
		permissionPicker['_getSandboxSettingId']();
		await sandboxReady();
		const fallbackSettingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot)!;
		await configuration.setUserConfiguration(fallbackSettingId, 'on');
		await modePicker['_showPicker'](document.createElement('div'));
		assert.deepStrictEqual({
			settings: [modePicker['_getSandboxSettingId'](), permissionPicker['_getSandboxSettingId']()],
			checked: actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle?.checked,
			menuOpen: actionWidget.isVisible,
			requests: diagnosticsRequests(),
			errors: logErrors.length,
		}, { settings: [fallbackSettingId, fallbackSettingId], checked: true, menuOpen: true, requests: 0, errors: 0 });
	});

	test('uses unified enablement without disturbing a different harness after a session switch', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const { modePicker, widget, config, actionWidget, sandboxReady, diagnosticsRequests } = setup(true, () => pending.p);
		const originalViewModel = widget.viewModel;
		const sessionResource = URI.from({ scheme: SessionType.AgentHostClaude, path: '/second-session' });
		widget.viewModel = new class extends mock<IChatViewModel>() {
			override readonly sessionResource = sessionResource;
		}();
		modePicker['_initialResolved'] = { sessionResource, result: config };
		await modePicker['_showPicker'](document.createElement('div'));
		await pending.complete({ version: '1', os: 'win32', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] });
		await sandboxReady();
		const switchedState = { setting: modePicker['_getSandboxSettingId'](), menuOpen: actionWidget.isVisible };
		widget.viewModel = originalViewModel;
		assert.deepStrictEqual({
			switchedState,
			restoredSetting: modePicker['_getSandboxSettingId'](),
			requests: diagnosticsRequests(),
		}, {
			switchedState: { setting: undefined, menuOpen: true },
			restoredSetting: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot),
			requests: 0,
		});
	});

	test('uses compact mode glyphs and evenly splits the inner gap between picker buttons', () => {
		const modes = [
			{ label: 'Interactive', icon: Codicon.comment, labelClassName: 'agent-host-chat-input-picker-label' },
			{ label: 'Plan', icon: Codicon.checklist, labelClassName: 'agent-host-chat-input-picker-label' },
			{ label: 'Autopilot', icon: Codicon.rocket, labelClassName: 'agent-host-chat-input-picker-label' },
		];
		const surfaces = [
			{ className: 'sessions-chat-picker-slot', buttonHeight: 22 },
			{ className: 'agent-host-chat-input-picker-slot', buttonHeight: 22 },
		];
		const states = [];
		for (const surface of surfaces) {
			const actionBar = dom.append(document.body, dom.$('.monaco-workbench.monaco-action-bar'));
			store.add(toDisposable(() => actionBar.remove()));
			actionBar.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			actionBar.style.setProperty('--vscode-spacing-size240', '24px');
			actionBar.style.setProperty('--vscode-spacing-size120', '12px');
			actionBar.style.setProperty('--vscode-spacing-size20', '2px');
			actionBar.style.setProperty('--vscode-spacing-size40', '4px');
			actionBar.style.setProperty('--vscode-spacing-size60', '6px');
			actionBar.style.setProperty('--vscode-spacing-sizeNone', '0px');
			actionBar.style.setProperty('--vscode-strokeThickness', '1px');
			actionBar.style.setProperty('--vscode-widget-border', '#123456');
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			for (const mode of modes) {
				const actionItem = dom.append(actions, dom.$('li.action-item'));
				const slot = dom.append(actionItem, dom.$(`.${surface.className}`));
				const trigger = dom.append(slot, dom.$('div.action-label'));
				const rendered = store.add(renderModePickerTrigger(trigger, mode, permissionPresentations[0], () => { }));
				const icon = rendered.modeButton.querySelector<HTMLElement>('.codicon')!;
				const modeLabel = rendered.modeButton.querySelector<HTMLElement>('.agent-host-chat-input-picker-label')!;
				const permissionLabel = rendered.permissionsButton.querySelector<HTMLElement>('.agent-host-mode-permission-summary')!;
				const style = dom.getWindow(icon).getComputedStyle(icon);
				const contentInsets = [rendered.modeButton, rendered.permissionsButton].map(button => {
					const bounds = button.getBoundingClientRect();
					return {
						left: button.firstElementChild!.getBoundingClientRect().left - bounds.left,
						right: bounds.right - button.lastElementChild!.getBoundingClientRect().right,
					};
				});
				const labelGap = permissionLabel.getBoundingClientRect().left - modeLabel.getBoundingClientRect().right;
				const dividerStyle = dom.getWindow(rendered.permissionsButton).getComputedStyle(rendered.permissionsButton, '::before');
				states.push({
					surface: surface.className,
					label: mode.label,
					icon: icon.className,
					fontSize: style.fontSize,
					width: icon.getBoundingClientRect().width,
					height: icon.getBoundingClientRect().height,
					triggerHeight: trigger.getBoundingClientRect().height,
					modeLabelCentered: isVerticallyCentered(modeLabel, rendered.modeButton),
					permissionLabelCentered: isVerticallyCentered(permissionLabel, rendered.permissionsButton),
					buttonHeights: [rendered.modeButton, rendered.permissionsButton].map(button => button.getBoundingClientRect().height),
					buttonPadding: [rendered.modeButton, rendered.permissionsButton].map(button => dom.getWindow(button).getComputedStyle(button).padding),
					contentInsets,
					surfaceGap: rendered.permissionsButton.getBoundingClientRect().left - rendered.modeButton.getBoundingClientRect().right,
					labelGap,
					totalChrome: contentInsets[0].left + labelGap + contentInsets[1].right,
					divider: {
						position: dividerStyle.position,
						left: dividerStyle.left,
						width: dividerStyle.width,
						height: dividerStyle.height,
						color: dividerStyle.backgroundColor,
						transform: dividerStyle.transform,
						zIndex: dividerStyle.zIndex,
					},
				});
			}
		}
		assert.deepStrictEqual(states, surfaces.flatMap(surface => modes.map(mode => ({
			surface: surface.className, label: mode.label, icon: `codicon codicon-${mode.icon.id}-compact`,
			fontSize: '12px', width: 12, height: 12,
			triggerHeight: surface.buttonHeight,
			modeLabelCentered: true,
			permissionLabelCentered: true,
			buttonHeights: [surface.buttonHeight, surface.buttonHeight],
			buttonPadding: ['0px 6px', '0px 6px'],
			contentInsets: [{ left: 6, right: 6 }, { left: 6, right: 6 }],
			surfaceGap: 2,
			labelGap: 14,
			totalChrome: 26,
			divider: {
				position: 'absolute',
				left: '-1px',
				width: '1px',
				height: '12px',
				color: 'rgb(18, 52, 86)',
				transform: 'matrix(1, 0, 0, 1, -0.5, -6)',
				zIndex: '1',
			},
		}))));
	});

	test('matches picker heights and centers their content across the primary and secondary composer toolbars', () => {
		const host = dom.append(document.body, dom.$('.monaco-workbench'));
		store.add(toDisposable(() => host.remove()));
		host.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		host.style.setProperty('--vscode-spacing-size60', '6px');
		host.style.setProperty('--vscode-spacing-size80', '8px');
		host.style.setProperty('--vscode-cornerRadius-small', '4px');
		const session = dom.append(host, dom.$('.interactive-session'));
		const states = [];
		for (const [containerClass, toolbarClass] of [['chat-input-toolbars', 'chat-input-toolbar'], ['chat-secondary-toolbar', 'chat-secondary-input-toolbar']]) {
			const container = dom.append(session, dom.$(`.${containerClass}`));
			const toolbar = dom.append(container, dom.$(`.${toolbarClass}`));
			const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			for (const pickerClass of ['chat-input-picker-item', 'chat-sessionPicker-item', 'agent-host-chat-input-picker-host']) {
				const item = dom.append(actions, dom.$(`li.action-item.${pickerClass}`));
				const slot = pickerClass === 'agent-host-chat-input-picker-host' ? dom.append(item, dom.$('.agent-host-chat-input-picker-slot')) : item;
				const button = dom.append(slot, dom.$('a.action-label'));
				const icon = dom.append(button, renderIcon(Codicon.rocketCompact));
				const labelClassName = pickerClass === 'agent-host-chat-input-picker-host' ? 'agent-host-chat-input-picker-label' : 'chat-input-picker-label';
				const label = dom.append(button, dom.$(`span.${labelClassName}`, undefined, 'Autopilot'));
				const style = dom.getWindow(icon).getComputedStyle(icon);
				const buttonStyle = dom.getWindow(button).getComputedStyle(button);
				states.push({
					toolbar: toolbarClass,
					picker: pickerClass,
					height: button.getBoundingClientRect().height,
					padding: buttonStyle.padding,
					radius: buttonStyle.borderRadius,
					icon: { width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height, fontSize: style.fontSize, lineHeight: style.lineHeight },
					iconCentered: isVerticallyCentered(icon, button),
					labelCentered: isVerticallyCentered(label, button),
				});
			}
		}
		assert.deepStrictEqual(states, ['chat-input-toolbar', 'chat-secondary-input-toolbar'].flatMap(toolbar =>
			['chat-input-picker-item', 'chat-sessionPicker-item', 'agent-host-chat-input-picker-host'].map(picker => ({
				toolbar,
				picker,
				height: 22,
				padding: '0px 6px',
				radius: '4px',
				icon: { width: 12, height: 12, fontSize: '12px', lineHeight: '12px' },
				iconCentered: true,
				labelCentered: true,
			}))));
	});

	test('uses one mode icon and a secondary colored permission label, hiding the old picker', async () => {
		const { modePicker, modeContainer, permissionContainer, actionWidget } = setup();
		const trigger = modeContainer.querySelector<HTMLElement>('.action-label')!;
		await modePicker['_showPicker'](trigger);
		assert.deepStrictEqual({
			mode: trigger.querySelector('.agent-host-chat-input-picker-label')?.textContent,
			permission: trigger.querySelector('.agent-host-mode-permission-summary')?.textContent,
			permissionColor: trigger.querySelector('.agent-host-mode-permission-summary')?.classList.contains('warning'),
			icons: trigger.querySelectorAll('.codicon').length,
			separatePicker: permissionContainer.style.display,
			rows: actionWidget.items.map(item => item.kind === ActionListItemKind.Separator ? item.kind : item.label),
			permissionLevels: actionWidget.items.filter(item => item.section === 'agentHostModePicker.permissions' && item.item && !item.isSectionToggle && !item.standaloneToggle).map(item => item.label),
			aria: trigger.ariaLabel,
		}, {
			mode: 'Interactive',
			permission: 'Assisted permissions',
			permissionColor: true,
			icons: 1,
			separatePicker: 'none',
			rows: ['Agent mode', 'Interactive', 'Plan', 'Autopilot', ActionListItemKind.Separator, 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', ActionListItemKind.Separator, 'Sandboxing for terminal', ActionListItemKind.Separator, 'Learn more about permissions'],
			permissionLevels: ['Manual permissions', 'Assisted permissions', 'Allow all', 'Learn more about permissions'],
			aria: 'Pick Mode and Permissions, Interactive, Assisted permissions',
		});
	});

	test('the combined picker gate controls the inline permissions layout', async () => {
		const states = [];
		for (const combined of [false, true]) {
			const { modePicker, modeContainer, permissionContainer, actionWidget } = setup(combined);
			await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!, true);
			states.push({
				combined,
				disclosure: actionWidget.items.some(item => item.isSectionToggle),
				oldPickerHidden: permissionContainer.style.display === 'none',
				initialFocusItem: actionWidget.options?.initialFocusItemId,
			});
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [
			{ combined: false, disclosure: false, oldPickerHidden: false, initialFocusItem: undefined },
			{ combined: true, disclosure: true, oldPickerHidden: true, initialFocusItem: 'agentHostPermissions.assisted' },
		]);
	});

	for (const combined of [false, true]) {
		test(`offers experimental Assisted permissions without an opt-in setting (${combined ? 'combined' : 'separate'} picker)`, async () => {
			const { modePicker, permissionPicker, configuration, config, actionWidget, dispatches } = setup(combined);
			await configuration.setUserConfiguration('chat.assistedPermissions.enabled', false);
			config.values.autoApprove = 'default';
			const picker = combined ? modePicker : permissionPicker;
			await picker['_showPicker'](document.createElement('div'));
			const levels = actionWidget.items.filter(item => ['Manual permissions', 'Assisted permissions', 'Allow all'].includes(item.label ?? ''))
				.map(item => ({ label: item.label, disabled: item.disabled, badge: item.badge }));
			const beforeSelection = [...dispatches];
			await actionWidget.select('Assisted permissions');

			assert.deepStrictEqual({ levels, beforeSelection, dispatches }, {
				levels: [
					{ label: 'Manual permissions', disabled: false, badge: undefined },
					{ label: 'Assisted permissions', disabled: false, badge: 'Experimental' },
					{ label: 'Allow all', disabled: false, badge: undefined },
				],
				beforeSelection: [],
				dispatches: [{ type: ActionType.SessionConfigChanged, config: { autoApprove: 'assisted' } }],
			});
		});

		test(`preserves enterprise approval restrictions (${combined ? 'combined' : 'separate'} picker)`, async () => {
			const { modePicker, permissionPicker, configuration, actionWidget, dispatches } = setup(combined);
			configuration.policyRestricted = true;
			const picker = combined ? modePicker : permissionPicker;
			await picker['_showPicker'](document.createElement('div'));
			const levels = actionWidget.items.filter(item => ['Manual permissions', 'Assisted permissions', 'Allow all'].includes(item.label ?? ''))
				.map(item => ({ label: item.label, disabled: item.disabled, badge: item.badge }));
			await actionWidget.select('Assisted permissions');

			assert.deepStrictEqual({ levels, dispatches }, {
				levels: [
					{ label: 'Manual permissions', disabled: false, badge: undefined },
					{ label: 'Assisted permissions', disabled: true, badge: 'Experimental' },
					{ label: 'Allow all', disabled: true, badge: undefined },
				],
				dispatches: [{ type: ActionType.SessionConfigChanged, config: { autoApprove: 'default' } }],
			});
		});

		test(`closes on enterprise approval policy changes (${combined ? 'combined' : 'separate'} picker)`, async () => {
			const { modePicker, permissionPicker, configuration, actionWidget } = setup(combined);
			const picker = combined ? modePicker : permissionPicker;
			await picker['_showPicker'](document.createElement('div'));
			configuration.policyRestricted = true;
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === ChatConfiguration.GlobalAutoApprove,
				affectedKeys: new Set([ChatConfiguration.GlobalAutoApprove]),
				source: ConfigurationTarget.USER,
				change: { keys: [ChatConfiguration.GlobalAutoApprove], overrides: [] },
			});

			assert.strictEqual(actionWidget.isVisible, false);
		});
	}

	test('stacked rows retain the permission axis, sandbox toggle, and settings gear', async () => {
		const { modePicker, modeContainer, actionWidget, dispatches, settingsRequests } = setup();
		const trigger = modeContainer.querySelector<HTMLElement>('.agent-host-mode-button')!;
		await modePicker['_showPicker'](trigger);
		const modeHeader = actionWidget.items.find(item => item.className === 'agent-host-mode-section');
		const selected = actionWidget.selectedLabels;
		const collapsed = Array.from(actionWidget.options?.collapsedByDefault ?? []);
		const showFilter = actionWidget.options?.showFilter;
		const sandbox = actionWidget.items.find(item => item.standaloneToggle);
		await actionWidget.select('Allow all');
		await modePicker['_showPicker'](trigger, true);
		const expanded = Array.from(actionWidget.options?.collapsedByDefault ?? []);
		const gear = actionWidget.items.find(item => item.toolbarActions?.length)?.toolbarActions?.[0];
		assert.ok(gear);
		await gear.run();
		assert.deepStrictEqual({
			modeHeader: { label: modeHeader?.label, summary: modeHeader?.description, aria: modeHeader?.ariaDescription },
			selected,
			collapsed,
			expanded,
			showFilter,
			sandbox: { label: sandbox?.label, icon: sandbox?.group?.icon?.id, checked: sandbox?.standaloneToggle?.checked },
			dispatches,
			settingsRequests,
		}, {
			modeHeader: { label: 'Agent mode', summary: 'Interactive', aria: 'Current mode: Interactive' },
			selected: ['Interactive', 'Assisted permissions'],
			collapsed: ['agentHostModePicker.permissions'],
			expanded: ['agentHostModePicker.mode'],
			showFilter: undefined,
			sandbox: { label: 'Sandboxing for terminal', icon: 'shield', checked: false },
			dispatches: [{ type: ActionType.SessionConfigChanged, config: { autoApprove: 'autoApprove' } }],
			settingsRequests: [{ jsonEditor: false, query: AGENT_HOST_PERMISSIONS_SETTINGS_QUERY }],
		});
	});

	test('changing the combined setting closes the menu and restores separate pickers', async () => {
		const { modePicker, modeContainer, permissionContainer, configuration, actionWidget, dispatches } = setup();
		const permissionsButton = modeContainer.querySelector<HTMLElement>('.agent-host-permissions-button')!;
		await modePicker['_showPicker'](permissionsButton, true);
		const states = [];
		for (const combined of [false, true]) {
			await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, combined);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === ChatConfiguration.ExperimentalModePermissionsPicker,
				affectedKeys: new Set([ChatConfiguration.ExperimentalModePermissionsPicker]),
				source: ConfigurationTarget.USER,
				change: { keys: [ChatConfiguration.ExperimentalModePermissionsPicker], overrides: [] },
			});
			const closed = !actionWidget.isVisible;
			await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!, true);
			states.push({
				combined,
				closed,
				inline: actionWidget.items.some(item => item.isSectionToggle),
				separatePermissionsVisible: permissionContainer.style.display !== 'none',
			});
		}
		assert.deepStrictEqual({ states, dispatches }, {
			states: [
				{ combined: false, closed: true, inline: false, separatePermissionsVisible: true },
				{ combined: true, closed: true, inline: true, separatePermissionsVisible: false },
			],
			dispatches: [],
		});
	});

	test('inline permission selections write the permission axis rather than the mode', async () => {
		const { modePicker, modeContainer, actionWidget, dispatches } = setup();
		await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!);
		await actionWidget.select('Allow all');
		assert.deepStrictEqual(dispatches, [{ type: ActionType.SessionConfigChanged, config: { autoApprove: 'autoApprove' } }]);
	});

	test('opens mode and permissions directly from their own label regions', async () => {
		const { modeContainer, actionWidget, onDidShow } = setup();
		const states = [];
		for (const selector of ['.agent-host-mode-button', '.agent-host-permissions-button']) {
			const button = modeContainer.querySelector<HTMLElement>(selector)!;
			const trigger = modeContainer.querySelector<HTMLElement>('.agent-host-mode-permissions-trigger')!;
			const shown = Event.toPromise(onDidShow);
			button.click();
			await shown;
			const state = {
				anchorMatches: actionWidget.anchor === button,
				above: actionWidget.options?.anchorPosition === AnchorPosition.ABOVE,
				initialFocusItem: actionWidget.options?.initialFocusItemId,
				collapsed: [...actionWidget.options?.collapsedByDefault ?? []],
				expanded: button.ariaExpanded,
				rowOpen: trigger.getAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE),
			};
			actionWidget.hide();
			states.push({ ...state, rowClosed: !trigger.hasAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE) });
		}
		assert.deepStrictEqual(states, [
			{ anchorMatches: true, above: true, initialFocusItem: 'interactive', collapsed: ['agentHostModePicker.permissions'], expanded: 'true', rowOpen: 'true', rowClosed: true },
			{ anchorMatches: true, above: true, initialFocusItem: 'agentHostPermissions.assisted', collapsed: ['agentHostModePicker.mode'], expanded: 'true', rowOpen: 'true', rowClosed: true },
		]);
	});

	test('does not handle touch taps on the non-interactive combined group', async () => {
		const { modeContainer, actionWidget } = setup();
		modeContainer.querySelector('.action-label')!.dispatchEvent(new CustomEvent(TouchEventType.Tap));
		await timeout(0);
		assert.strictEqual(actionWidget.showCount, 0);
	});

	test('concurrent opens do not replace the first permissions popup', async () => {
		const { modePicker, modeContainer, actionWidget } = setup();
		const permissions = modeContainer.querySelector<HTMLElement>('.agent-host-permissions-button')!;
		const mode = modeContainer.querySelector<HTMLElement>('.agent-host-mode-button')!;
		await Promise.all([
			modePicker['_showPicker'](permissions, true),
			modePicker['_showPicker'](mode),
		]);
		assert.deepStrictEqual({
			showCount: actionWidget.showCount,
			initialFocusItem: actionWidget.options?.initialFocusItemId,
			permissionsExpanded: permissions.ariaExpanded,
		}, { showCount: 1, initialFocusItem: 'agentHostPermissions.assisted', permissionsExpanded: 'true' });
	});

	test('the combined editor popup fades without changing its geometry', () => {
		const { container, widget } = createPermissionsWidget();
		const host = dom.append(document.body, dom.$('.modern-ui.monaco-enable-motion'));
		store.add(toDisposable(() => host.remove()));
		dom.append(host, container);
		container.style.width = '260px';
		container.classList.add('action-widget-dropdown', 'agent-host-mode-permissions-popup');
		widget.layout(widget.computeListHeight(), 260);
		const animation = container.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		const widths = [0, 125, 250].map(time => {
			animation.currentTime = time;
			return container.getBoundingClientRect().width;
		});
		widget.focusNext();
		widths.push(container.getBoundingClientRect().width);
		assert.deepStrictEqual(widths, Array(4).fill(widths[0]));
	});

	test('live config refreshes preserve the popup anchor buttons', () => {
		const { modePicker, modeContainer, config } = setup();
		dom.append(document.body, modeContainer);
		store.add(toDisposable(() => modeContainer.remove()));
		const trigger = modeContainer.querySelector('.action-label');
		const modeButton = modeContainer.querySelector<HTMLElement>('.agent-host-mode-button')!;
		const permissionsButton = modeContainer.querySelector('.agent-host-permissions-button');
		modeButton.focus();
		config.values.mode = 'plan';
		config.values.autoApprove = 'autoApprove';
		modePicker['_renderChip']();
		assert.deepStrictEqual({
			sameTrigger: modeContainer.querySelector('.action-label') === trigger,
			sameModeButton: modeContainer.querySelector('.agent-host-mode-button') === modeButton,
			samePermissionsButton: modeContainer.querySelector('.agent-host-permissions-button') === permissionsButton,
			mode: modeButton?.textContent,
			permissions: permissionsButton?.textContent,
			focusPreserved: document.activeElement === modeButton,
		}, { sameTrigger: true, sameModeButton: true, samePermissionsButton: true, mode: 'Plan', permissions: 'Allow all', focusPreserved: true });
	});

	test('mode section header reflects the current mode', async () => {
		const { modePicker, modeContainer, config, actionWidget } = setup();
		config.values.mode = 'plan';
		modePicker['_renderChip']();
		await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.agent-host-mode-button')!);
		const modeHeader = actionWidget.items.find(item => item.className === 'agent-host-mode-section');
		assert.deepStrictEqual({
			label: modeHeader?.label,
			summary: modeHeader?.description,
			aria: modeHeader?.ariaDescription,
		}, {
			label: 'Agent mode',
			summary: 'Plan',
			aria: 'Current mode: Plan',
		});
	});

	test('always shows the shield on the sandbox toggle row', async () => {
		const { modePicker, modeContainer, configuration, actionWidget, sandboxReady } = setup();
		await sandboxReady();
		const states = [];
		const settingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot)!;
		for (const enabled of [false, true]) {
			await configuration.setUserConfiguration(settingId, enabled ? AgentSandboxEnabledValue.On : AgentSandboxEnabledValue.Off);
			await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!);
			const sandboxRow = actionWidget.items.find(item => item.standaloneToggle);
			states.push({ checked: sandboxRow?.standaloneToggle?.checked, icon: sandboxRow?.group?.icon?.id });
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [{ checked: false, icon: 'shield' }, { checked: true, icon: 'shield' }]);
	});

	test('combined sandbox toggle writes session choices and reconciles external changes', async () => {
		const { modePicker, modeContainer, configuration, config, actionWidget, dispatches, sandboxReady } = setup();
		await sandboxReady();
		const settingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot)!;
		await configuration.setUserConfiguration(settingId, AgentSandboxEnabledValue.Off);
		await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!);
		const items = actionWidget.items;
		const toggle = items.find(item => item.standaloneToggle)?.standaloneToggle;
		assert.ok(toggle);
		toggle.onChange(true);
		config.values[SessionConfigKey.SandboxEnabled] = 'on';
		modePicker['_sandboxConfigChanged'].trigger(undefined);
		const matchingUpdatePreservedItems = actionWidget.items === items;
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		modePicker['_sandboxConfigChanged'].trigger(undefined);
		assert.deepStrictEqual({
			dispatches,
			globalSetting: configuration.getValue(settingId),
			matchingUpdatePreservedItems,
			externalUpdateReplacedItems: actionWidget.items !== items,
			checked: actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle?.checked,
			menuOpen: actionWidget.isVisible,
		}, {
			dispatches: [{ type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: 'on' } }],
			globalSetting: AgentSandboxEnabledValue.Off,
			matchingUpdatePreservedItems: true,
			externalUpdateReplacedItems: true,
			checked: false,
			menuOpen: true,
		});
	});

	test('opens permission settings from the gear without changing session configuration', async () => {
		const { modePicker, modeContainer, actionWidget, settingsRequests, dispatches } = setup();
		await modePicker['_showPicker'](modeContainer.querySelector<HTMLElement>('.action-label')!);
		const gear = actionWidget.items.find(item => item.toolbarActions?.length)?.toolbarActions?.[0];
		assert.ok(gear);
		await gear.run();
		assert.deepStrictEqual({
			label: gear.label,
			icon: gear.class,
			menuOpen: actionWidget.isVisible,
			settingsRequests,
			dispatches,
		}, {
			label: 'Configure Permissions',
			icon: 'codicon codicon-gear',
			menuOpen: false,
			settingsRequests: [{ jsonEditor: false, query: AGENT_HOST_PERMISSIONS_SETTINGS_QUERY }],
			dispatches: [],
		});
	});

	test('settings filter includes defaults, approvals, risk assessment, and sandbox controls', () => {
		assert.deepStrictEqual(AGENT_HOST_PERMISSIONS_SETTINGS_QUERY.slice('@id:'.length).split(','), [
			'chat.defaultConfiguration',
			'chat.permissions.default',
			'chat.tools.global.autoApprove',
			'chat.tools.edits.autoApprove',
			'chat.tools.urls.autoApprove',
			'chat.tools.eligibleForAutoApproval',
			'chat.tools.riskAssessment.*',
			'chat.tools.terminal.enableAutoApprove',
			'chat.tools.terminal.autoApprove',
			'chat.tools.terminal.autoApproveWorkspaceNpmScripts',
			'chat.tools.terminal.ignoreDefaultAutoApproveRules',
			'chat.tools.terminal.blockDetectedFileWrites',
			'chat.agent.sandbox.*',
		]);
	});

	test('gate only combines usable Copilot schemas', () => {
		const { config } = setup();
		const mode = config.schema.properties.mode;
		const permission = config.schema.properties.autoApprove;
		assert.deepStrictEqual([
			shouldCombineModeAndPermissions(true, true, mode, permission),
			shouldCombineModeAndPermissions(false, true, mode, permission),
			shouldCombineModeAndPermissions(true, false, mode, permission),
			shouldCombineModeAndPermissions(true, true, undefined, permission),
			shouldCombineModeAndPermissions(true, true, mode, { ...permission, enum: ['custom'] }),
			shouldCombineModeAndPermissions(true, true, { ...mode, readOnly: true }, permission),
			shouldCombineModeAndPermissions(true, true, mode, { ...permission, enumDynamic: true }),
		], [true, false, false, false, false, false, false]);
	});

	test('uses short permission summaries that fit alongside the full Permissions heading', () => {
		const { container, widget } = createPermissionsWidget();
		const sizes = [];
		for (const width of [260, 220]) {
			container.style.width = `${width}px`;
			widget.layout(widget.computeListHeight(), width);
			for (const row of widget.domNode.querySelectorAll('.agent-host-mode-permissions')) {
				row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
				const title = row.querySelector<HTMLElement>('.title')!;
				const description = row.querySelector<HTMLElement>('.description')!;
				sizes.push({ width, summary: description.textContent, headingFits: title.scrollWidth <= title.clientWidth, summaryFits: description.scrollWidth <= description.clientWidth });
			}
		}
		assert.deepStrictEqual(sizes, [
			{ width: 260, summary: 'Manual', headingFits: true, summaryFits: true },
			{ width: 260, summary: 'Assisted', headingFits: true, summaryFits: true },
			{ width: 260, summary: 'Allow all', headingFits: true, summaryFits: true },
			{ width: 220, summary: 'Manual', headingFits: true, summaryFits: true },
			{ width: 220, summary: 'Assisted', headingFits: true, summaryFits: true },
			{ width: 220, summary: 'Allow all', headingFits: true, summaryFits: true },
		]);
	});

	test('matches trigger colors and keeps the gear and compact chevron visible with tight spacing', () => {
		const { container, widget } = createPermissionsWidget();
		container.style.setProperty('--vscode-descriptionForeground', '#777777');
		container.style.setProperty('--vscode-problemsWarningIcon-foreground', '#aa8800');
		container.style.setProperty('--vscode-problemsInfoIcon-foreground', '#0066cc');
		container.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size20', '2px');
		container.style.setProperty('--vscode-spacing-size60', '6px');
		widget.layout(widget.computeListHeight(), 260);
		const states = [];
		for (const [index, row] of Array.from(widget.domNode.querySelectorAll('.agent-host-mode-permissions')).entries()) {
			widget.clearFocus();
			const trigger = dom.append(container, dom.$('a'));
			renderModePickerPermissions(trigger, permissionPresentations[index]);
			const targetWindow = dom.getWindow(container);
			const triggerStyle = targetWindow.getComputedStyle(trigger.querySelector('.agent-host-mode-permission-summary')!);
			const summaryStyle = targetWindow.getComputedStyle(row.querySelector('.description')!);
			const gearStyle = targetWindow.getComputedStyle(row.querySelector('.action-list-item-toolbar')!);
			const gearBounds = row.querySelector('.action-list-item-toolbar .action-label')!.getBoundingClientRect();
			const summaryBounds = row.querySelector('.description')!.getBoundingClientRect();
			const gearVisible = gearStyle.display !== 'none' && gearStyle.visibility === 'visible';
			const chevron = row.querySelector(':scope > .codicon')!;
			const chevronStyle = targetWindow.getComputedStyle(chevron);
			const visibleAtRest = chevronStyle.visibility === 'visible';
			row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			states.push({
				color: summaryStyle.color,
				matchesTrigger: summaryStyle.color === triggerStyle.color && summaryStyle.opacity === triggerStyle.opacity,
				gearVisible,
				visibleAtRest,
				visibleOnFocus: chevronStyle.visibility === 'visible',
				compact: chevronStyle.fontSize === '12px' && chevron.classList.contains('codicon-chevron-down'),
				gearSummaryGap: summaryBounds.left - gearBounds.right,
				gearPadding: targetWindow.getComputedStyle(row.querySelector('.action-list-item-toolbar .action-label')!).paddingLeft,
			});
		}
		assert.deepStrictEqual(states, ['rgb(119, 119, 119)', 'rgb(170, 136, 0)', 'rgb(0, 102, 204)'].map(color => ({
			color, matchesTrigger: true, gearVisible: true, visibleAtRest: true, visibleOnFocus: true, compact: true, gearSummaryGap: 4, gearPadding: '2px',
		})));
	});

	test('removes the summary and restores the permissions picker when disabled', async () => {
		const { modePicker, permissionPicker, modeContainer, permissionContainer, configuration } = setup();
		await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, false);
		modePicker.render(modeContainer);
		permissionPicker.render(permissionContainer);
		assert.deepStrictEqual({
			summary: modeContainer.querySelector('.agent-host-mode-permission-summary'),
			permissionPicker: permissionContainer.style.display,
			permissions: permissionContainer.querySelector('.agent-host-chat-input-picker-label')?.textContent,
		}, { summary: null, permissionPicker: '', permissions: 'Assisted permissions' });
	});
});

suite('AgentHostChatInputPicker - sandbox toggle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('editability follows managed bypass policy', async () => {
		const sandboxSettingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot)!;
		const writes: unknown[] = [];
		const configurationService = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				writes.push({ key, value });
			}
		}();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		await configurationService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
		let allowBypass: boolean | undefined;
		const managedSettingsChanged = store.add(new Emitter<void>());
		const managedSettingsService: IManagedSettingsService = {
			_serviceBrand: undefined,
			onDidChangeManagedSettings: managedSettingsChanged.event,
			getManagedSettingValue: key => key === COPILOT_SANDBOX_ALLOW_BYPASS_KEY ? allowBypass : undefined,
		};
		const enablementService: IAgentHostEnablementService = {
			_serviceBrand: undefined,
			enabled: constObservable(true),
			managedSandboxEnforced,
			managedSandboxAllowsBypass: observableFromEvent(managedSettingsService, managedSettingsChanged.event, () => allowBypass === true),
		};
		const visibleStates: Pick<IActionListItemInlineToggle, 'disabled' | 'title'>[] = [];
		let onHide: (() => void) | undefined;
		const recordVisibleState = <T>(items: readonly IActionListItem<T>[]) => {
			const toggle = items.find(item => item.standaloneToggle)?.standaloneToggle;
			assert.ok(toggle);
			visibleStates.push({ disabled: toggle.disabled, title: toggle.title });
		};
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override readonly isVisible = false;
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				onHide = delegate.onHide;
				recordVisibleState(items);
			}
			override updateItems<T>(items: readonly IActionListItem<T>[]): void {
				recordVisibleState(items);
			}
		}();
		const widget = new class extends mock<IChatWidget>() {
			override readonly onDidChangeViewModel = Event.None;
			override viewModel: IChatViewModel | undefined;
		}();
		const connection = new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				return { version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] };
			}
			override dispatch(channel: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				writes.push({ channel, action });
			}
		}();
		const picker = store.add(new AgentHostChatInputPicker(
			widget,
			SessionConfigKey.AutoApprove,
			connection,
			actionWidgetService,
			new class extends mock<IHoverService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { }(),
			new class extends mock<IWorkspaceContextService>() { }(),
			new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
				override readonly onDidChange = Event.None;
				override get() { return undefined; }
				override getResolvedConfig() { return undefined; }
				override async refreshResolvedConfig(): Promise<void> { }
			}(),
			configurationService,
			new class extends mock<IAgentHostNewSessionFolderService>() {
				override getFolder() { return URI.file('/workspace'); }
			}(),
			new class extends mock<IDialogService>() { }(),
			store.add(new TestStorageService()),
			enablementService,
			new class extends mock<IChatPhoneInputPresenter>() {
				override readonly enabled = constObservable(false);
			}(),
			new class extends mock<IPreferencesService>() { }(),
			store.add(new NullLogService()),
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly ambientConnection = connection;
				override readonly onDidChangeSessionResolution = Event.None;
				override resolveSessionResource(sessionResource: URI) {
					const backendSession = toAgentHostBackendSessionUri(sessionResource);
					return backendSession ? { connection, backendSession, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY } : undefined;
				}
			}(),
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly remoteAuthority = undefined;
			}(),
		));
		widget.viewModel = new class extends mock<IChatViewModel>() {
			override readonly sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/test-session' });
		}();
		picker['_initialResolved'] = {
			sessionResource: widget.viewModel.sessionResource,
			result: {
				values: { [SessionConfigKey.AutoApprove]: 'default' },
				schema: {
					type: 'object',
					properties: {
						[SessionConfigKey.AutoApprove]: { type: 'string', title: 'Permissions', enum: ['default', 'autoApprove'], default: 'default', sessionMutable: true },
						[SessionConfigKey.SandboxEnabled]: { type: 'string', title: 'Sandbox', enum: ['default', 'on', 'off'], sessionMutable: true },
					},
				},
			},
		};

		picker['_getSandboxSettingId']();
		const sessionConfig = picker['_initialResolved'].result;
		const state = new class extends mock<SessionState>() {
			override readonly provider = 'copilotcli';
			override readonly config = sessionConfig;
			override get _meta() {
				return withSessionSandboxPolicy(undefined, { enabled: managedSandboxEnforced.get(), allowBypass });
			}
		}();
		picker['_subRef'].value = Object.assign(toDisposable(() => { }), {
			sessionResource: widget.viewModel.sessionResource,
			backendSession: URI.parse('copilotcli:/test-session'),
			connection,
			generation: picker['_sessionGeneration'],
			sub: new class extends mock<IAgentSubscription<SessionState>>() {
				override readonly value = state;
			}(),
		});
		for (const managed of [false, true]) {
			managedSandboxEnforced.set(managed, undefined);
			for (const bypass of [undefined, false, true]) {
				allowBypass = bypass;
				managedSettingsChanged.fire();
				for (const configured of [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On]) {
					await configurationService.setUserConfiguration(sandboxSettingId, configured);
					const toggle = picker['_getSandboxStandaloneToggle']()!;
					writes.length = 0;
					toggle.onChange(false);
					toggle.onChange(true);
					const disabled = managed;
					assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled, title: toggle.title, writes }, {
						checked: true,
						disabled,
						title: managed
							? 'Sandboxing is required by your organization'
							: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. The applied setting is saved for this session and checked against current organization policy when restored.',
						writes: disabled ? [] : (managed || configured === AgentSandboxEnabledValue.On ? ['off', 'on'] : ['on']).map(value => ({
							channel: 'copilotcli:/test-session', action: { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: value } },
						})),
					});
				}
			}
		}

		managedSandboxEnforced.set(false, undefined);
		sessionConfig.values[SessionConfigKey.SandboxEnabled] = 'off';
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, false);
		sessionConfig.values[SessionConfigKey.SandboxEnabled] = 'on';
		await configurationService.setUserConfiguration(sandboxSettingId, AgentSandboxEnabledValue.Off);
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, true);
		delete sessionConfig.values[SessionConfigKey.SandboxEnabled];

		const toggle = picker['_getSandboxStandaloneToggle']()!;
		managedSandboxEnforced.set(true, undefined);
		allowBypass = false;
		managedSettingsChanged.fire();
		writes.length = 0;
		toggle.onChange(false);
		assert.deepStrictEqual({ writes, disabled: picker['_getSandboxStandaloneToggle']()!.disabled }, { writes: [], disabled: true });
		allowBypass = true;
		managedSettingsChanged.fire();
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.disabled, true);

		allowBypass = false;
		managedSettingsChanged.fire();
		await picker['_showPicker'](document.createElement('div'));
		picker['_sandboxConfigChanged'].trigger(undefined);
		picker['_sandboxConfigChanged'].trigger(undefined);
		allowBypass = true;
		managedSettingsChanged.fire();
		managedSettingsChanged.fire();
		managedSandboxEnforced.set(false, undefined);
		managedSandboxEnforced.set(true, undefined);
		allowBypass = false;
		managedSettingsChanged.fire();
		assert.ok(onHide);
		onHide();
		allowBypass = true;
		managedSettingsChanged.fire();
		assert.deepStrictEqual(visibleStates, [
			{ disabled: true, title: 'Sandboxing is required by your organization' },
			{ disabled: false, title: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. The applied setting is saved for this session and checked against current organization policy when restored.' },
			{ disabled: true, title: 'Sandboxing is required by your organization' },
		]);
		delete sessionConfig.schema.properties[SessionConfigKey.SandboxEnabled];
		assert.strictEqual(picker['_getSandboxStandaloneToggle'](), undefined);
	});
});

suite('AgentHostChatInputPicker - compact layout', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the Copilot harness picker height stable and centers its compact icon', () => {
		const session = dom.append(document.body, dom.$('.monaco-workbench.interactive-session'));
		disposables.add(toDisposable(() => session.remove()));
		session.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const actionBar = dom.append(session, dom.$('.monaco-action-bar'));
		const actionsContainer = dom.append(actionBar, dom.$('.actions-container'));
		actionsContainer.style.display = 'flex';
		const item = dom.append(actionsContainer, dom.$('.action-item.agent-host-chat-input-picker-host'));
		const slot = dom.append(item, dom.$('.agent-host-chat-input-picker-slot'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, renderIcon(Codicon.rocketCompact));
		dom.append(label, dom.$('span.agent-host-chat-input-picker-label', undefined, 'Autopilot'));

		const expandedHeight = item.getBoundingClientRect().height;
		item.classList.add('compact-picker');
		const itemBounds = item.getBoundingClientRect();
		const slotBounds = slot.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			expandedHeight,
			item: { width: itemBounds.width, height: itemBounds.height },
			slot: { width: slotBounds.width, height: slotBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			icon: {
				width: iconBounds.width,
				height: iconBounds.height,
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
		}, {
			expandedHeight: 22,
			item: { width: 22, height: 22 },
			slot: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			icon: { width: 12, height: 12, x: 5, y: 5 },
		});
	});
});

suite('AgentHostChatInputPicker - action mapping', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps dedicated actions to their session config properties', () => {
		assert.deepStrictEqual([
			getAgentHostPickerProperty(OpenAgentHostModePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostAutoApprovePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostPermissionModePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostCodexApprovalsPickerAction.ID),
		], [
			SessionConfigKey.Mode,
			SessionConfigKey.AutoApprove,
			ClaudeSessionConfigKey.PermissionMode,
			CodexSessionConfigKey.PermissionsPreset,
		]);
	});
});

suite('AgentHostChatInputPicker - list options', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses picker-specific widths and layouts', () => {
		assert.deepStrictEqual({
			mode: getConfigPickerListOptions(SessionConfigKey.Mode),
			approvals: getConfigPickerListOptions(SessionConfigKey.AutoApprove),
			branch: getConfigPickerListOptions(SessionConfigKey.Branch),
			claudePermissions: getConfigPickerListOptions(ClaudeSessionConfigKey.PermissionMode),
			codexApprovals: getConfigPickerListOptions(CodexSessionConfigKey.PermissionsPreset),
		}, {
			mode: { minWidth: 260 },
			approvals: { minWidth: 300 },
			branch: { maxVisibleItems: 10 },
			claudePermissions: undefined,
			codexApprovals: {
				className: 'codex-approvals-picker',
				minWidth: 340,
				maxWidth: 340,
				detailItemHeight: 76,
			},
		});
	});

	test('resolves the Copilot Agent Host sandbox setting', () => {
		assert.deepStrictEqual({
			copilot: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot),
			claude: getAgentHostSandboxSettingId(SessionType.AgentHostClaude),
			codex: getAgentHostSandboxSettingId(SessionType.AgentHostCodex),
			remoteCopilot: getAgentHostSandboxSettingId(remoteAgentHostSessionTypeId('test-host', 'copilotcli')),
			remoteClaude: getAgentHostSandboxSettingId(remoteAgentHostSessionTypeId('test-host', 'claude')),
			remoteCodex: getAgentHostSandboxSettingId(remoteAgentHostSessionTypeId('test-host', 'codex')),
			missing: getAgentHostSandboxSettingId(undefined),
		}, {
			copilot: AgentSandboxSettingId.AgentSandboxEnabled,
			claude: undefined,
			codex: undefined,
			remoteCopilot: AgentSandboxSettingId.AgentSandboxEnabled,
			remoteClaude: undefined,
			remoteCodex: undefined,
			missing: undefined,
		});
	});
});

suite('AgentHostChatInputPicker - trigger labels', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const permissionsSchema = {
		type: 'string',
		title: 'Permissions',
		enum: [ChatPermissionLevel.Default, ChatPermissionLevel.Assisted, ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot],
		enumLabels: ['Default permissions', 'Assisted permissions', 'Allow all', 'Autopilot'],
	} as SessionConfigPropertySchema;

	test('uses an icon-ready label while preserving the sandbox state for accessibility', () => {
		assert.deepStrictEqual({
			default: getConfigPickerTriggerLabel(permissionsSchema, ChatPermissionLevel.Default),
			assisted: getConfigPickerTriggerLabel(permissionsSchema, ChatPermissionLevel.Assisted),
			allowAll: getConfigPickerTriggerLabel(permissionsSchema, ChatPermissionLevel.AutoApprove),
			autopilot: getConfigPickerTriggerLabel(permissionsSchema, ChatPermissionLevel.Autopilot),
			accessible: getConfigPickerAccessibleTriggerLabel('Default permissions', true),
		}, {
			default: 'Default permissions',
			assisted: 'Assisted permissions',
			allowAll: 'Allow all',
			autopilot: 'Autopilot',
			accessible: 'Default permissions (sandboxed)',
		});
	});

	test('leaves the accessible permission label unchanged when sandboxing is disabled', () => {
		assert.strictEqual(
			getConfigPickerAccessibleTriggerLabel('Assisted permissions', false),
			'Assisted permissions'
		);
	});
});

suite('AgentHostChatInputPicker - resolveConfigChipValue', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('running (titled) session', () => {

		test('server value wins over a stale overlay (server-driven mode change is reflected)', () => {
			// Server flips Plan → Autopilot (e.g. user approved a plan); the
			// overlay still holds the old manually-picked value.
			assert.strictEqual(resolveConfigChipValue(false, 'autopilot', 'plan', 'interactive'), 'autopilot');
		});

		suite('AgentHostChatInputPicker - approval controls', () => {

			test('enterprise policy restricts and normalizes Approve When Safe and Allow All equally', () => {
				assert.deepStrictEqual({
					autoRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.Assisted, true),
					bypassRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.AutoApprove, true),
					defaultRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.Default, true),
					autoNormalized: normalizeSessionConfigValue(SessionConfigKey.AutoApprove, ChatPermissionLevel.Assisted, true),
					bypassNormalized: normalizeSessionConfigValue(SessionConfigKey.AutoApprove, ChatPermissionLevel.AutoApprove, true),
				}, {
					autoRestricted: true,
					bypassRestricted: true,
					defaultRestricted: false,
					autoNormalized: ChatPermissionLevel.Default,
					bypassNormalized: ChatPermissionLevel.Default,
				});
			});
		});

		test('falls back to overlay when the server has no value', () => {
			assert.strictEqual(resolveConfigChipValue(false, undefined, 'plan', 'interactive'), 'plan');
		});

		test('falls back to schema default when neither has a value', () => {
			assert.strictEqual(resolveConfigChipValue(false, undefined, undefined, 'interactive'), 'interactive');
		});
	});

	suite('AgentHostChatInputPicker - hovers', () => {
		const approvalsSchema = {
			type: 'string',
			title: 'Approvals',
			description: 'Tool approval behavior for this session',
			enum: ['default', 'autoApprove'],
			enumLabels: ['Manual permissions', 'Allow all'],
			enumDescriptions: ['Asks when approval settings don\'t apply', 'Runs tool calls without asking'],
		} as SessionConfigPropertySchema;

		test('explains the selected approval level on the trigger hover', () => {
			assert.deepStrictEqual({
				unsandboxed: getConfigPickerTriggerHover(SessionConfigKey.AutoApprove, approvalsSchema, 'autoApprove', false),
				sandboxed: getConfigPickerTriggerHover(SessionConfigKey.AutoApprove, approvalsSchema, 'autoApprove', false, true),
			}, {
				unsandboxed: 'Copilot runs all tools without asking for approval.',
				sandboxed: 'Copilot runs all tools without asking for approval. Terminal commands are sandboxed.',
			});
		});

		test('explains approval choices on item hover', () => {
			assert.deepStrictEqual({
				auto: getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'assisted', label: 'Assisted permissions', description: 'Evaluates risk before running tools' }, false),
				bypass: getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'autoApprove', label: 'Allow all', description: 'Runs tool calls without asking' }, false),
			}, {
				auto: 'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.',
				bypass: 'Copilot runs all tools without asking for approval.',
			});
		});

		test('directs users to their administrator when approvals are disabled by policy', () => {
			assert.strictEqual(
				getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'assisted', label: 'Assisted permissions' }, true),
				'Disabled by your organization. Contact your administrator.'
			);
		});

		test('explains the selected Codex permissions preset on the trigger hover', () => {
			const codexApprovalsSchema = {
				type: 'string',
				title: 'Approvals',
				description: 'How much Codex can do on its own before asking for approval.',
				enum: ['default', 'auto-review', 'full-access'],
				enumLabels: ['Default Permissions', 'Auto-Review', 'Full Access'],
				enumDescriptions: ['Default access', 'Auto-review access', 'Full machine access'],
			} as SessionConfigPropertySchema;

			assert.strictEqual(
				getConfigPickerTriggerHover(CodexSessionConfigKey.PermissionsPreset, codexApprovalsSchema, 'full-access', false),
				'Full machine access'
			);
		});
	});

	suite('untitled (pre-send) session', () => {

		test('overlay wins so a synchronous chip edit is reflected before the backend echoes', () => {
			assert.strictEqual(resolveConfigChipValue(true, 'interactive', 'plan', 'interactive'), 'plan');
		});

		test('falls back to server value when the overlay has none', () => {
			assert.strictEqual(resolveConfigChipValue(true, 'autopilot', undefined, 'interactive'), 'autopilot');
		});

		test('falls back to schema default when neither has a value', () => {
			assert.strictEqual(resolveConfigChipValue(true, undefined, undefined, 'interactive'), 'interactive');
		});
	});
});
