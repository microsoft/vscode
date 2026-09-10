/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, ActionListWidget, IActionListDelegate, IActionListItem, IActionListItemInlineToggle, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { timeout } from '../../../../../../base/common/async.js';
import { EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
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
import * as dom from '../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import type { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { AgentHostChatInputPicker, getAgentHostSandboxSettingId, getConfigPickerAccessibleTriggerLabel, getConfigPickerItemHover, getConfigPickerListOptions, getConfigPickerTriggerHover, getConfigPickerTriggerLabel, resolveConfigChipValue } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { getAgentHostPickerProperty, OpenAgentHostAutoApprovePickerAction, OpenAgentHostCodexApprovalsPickerAction, OpenAgentHostModePickerAction, OpenAgentHostPermissionModePickerAction } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.js';
import { isAutoApproveValuePolicyRestricted, isPermissionLevelVisible, normalizeSessionConfigValue } from '../../../common/agentHostConfigPolicy.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { IChatPhoneInputPresenter } from '../../../browser/widget/input/chatPhoneInputPresenter.js';
import { AGENT_HOST_PERMISSIONS_SETTINGS_QUERY, createModePickerPermissionsItems, renderModePickerPermissions, renderModePickerTrigger, shouldCombineModeAndPermissions } from '../../../browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
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

	function setup(combined = true) {
		const configuration = new TestConfigurationService({
			[ChatConfiguration.ExperimentalModePermissionsPicker]: combined,
			[ChatConfiguration.PermissionsSandboxToggleEnabled]: true,
			[ChatConfiguration.AssistedPermissionsEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const config: ResolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					mode: { title: 'Mode', type: 'string', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'] },
					autoApprove: { title: 'Permissions', type: 'string', enum: ['default', 'assisted', 'autoApprove'], enumLabels: ['Manual permissions', 'Assisted permissions', 'Allow all'] },
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
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override isVisible = false;
			showCount = 0;
			items: readonly IActionListItem<unknown>[] = [];
			anchor: Parameters<IActionWidgetService['show']>[4] | undefined;
			options: IActionListOptions | undefined;
			selectedLabels: (string | undefined)[] = [];
			select: (label: string) => Promise<void> = async () => { };
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
		instantiationService.stub(IAgentHostService, {
			dispatch: (_session, action) => {
				if (action.type === ActionType.SessionConfigChanged) {
					dispatches.push(action);
				}
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
		instantiationService.stub(IAgentHostNewSessionFolderService, { getFolder: () => undefined, getDefaultFolder: () => undefined });
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, { onDidChange: Event.None, getResolvedConfig: () => undefined, refreshResolvedConfig: async () => { } });
		instantiationService.stub(IAgentHostEnablementService, { managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
		instantiationService.stub(IChatPhoneInputPresenter, { enabled: constObservable(false) });
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
		return { modePicker, permissionPicker, modeContainer, permissionContainer, configuration, config, actionWidget, widget, dispatches, settingsRequests, hoverTargets, onDidShow: onDidShow.event };
	}

	test('uses one shared tooltip for the combined label', () => {
		const { modeContainer, hoverTargets } = setup();
		assert.deepStrictEqual(hoverTargets.map(target => target === modeContainer.querySelector('.action-label')), [true]);
	});

	test('uses compact mode glyphs and evenly splits the inner gap between picker buttons', () => {
		const modes = [
			{ label: 'Interactive', icon: Codicon.comment, labelClassName: 'mode-label' },
			{ label: 'Plan', icon: Codicon.checklist, labelClassName: 'mode-label' },
			{ label: 'Autopilot', icon: Codicon.rocket, labelClassName: 'mode-label' },
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
			actionBar.style.setProperty('--vscode-spacing-size60', '6px');
			actionBar.style.setProperty('--vscode-spacing-sizeNone', '0px');
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			for (const mode of modes) {
				const actionItem = dom.append(actions, dom.$('li.action-item'));
				const slot = dom.append(actionItem, dom.$(`.${surface.className}`));
				const trigger = dom.append(slot, dom.$('div.action-label'));
				const rendered = store.add(renderModePickerTrigger(trigger, mode, permissionPresentations[0], () => { }));
				const icon = rendered.modeButton.querySelector<HTMLElement>('.codicon')!;
				const style = dom.getWindow(icon).getComputedStyle(icon);
				states.push({
					surface: surface.className,
					label: mode.label,
					icon: icon.className,
					fontSize: style.fontSize,
					width: icon.getBoundingClientRect().width,
					height: icon.getBoundingClientRect().height,
					buttonHeights: [rendered.modeButton, rendered.permissionsButton].map(button => button.getBoundingClientRect().height),
					buttonPadding: [rendered.modeButton, rendered.permissionsButton].map(button => dom.getWindow(button).getComputedStyle(button).padding),
					contentInsets: [rendered.modeButton, rendered.permissionsButton].map(button => {
						const bounds = button.getBoundingClientRect();
						return {
							left: button.firstElementChild!.getBoundingClientRect().left - bounds.left,
							right: bounds.right - button.lastElementChild!.getBoundingClientRect().right,
						};
					}),
					labelGap: rendered.permissionsButton.querySelector('.agent-host-mode-permission-summary')!.getBoundingClientRect().left - rendered.modeButton.querySelector('.mode-label')!.getBoundingClientRect().right,
				});
			}
		}
		assert.deepStrictEqual(states, surfaces.flatMap(surface => modes.map(mode => ({
			surface: surface.className, label: mode.label, icon: `codicon codicon-${mode.icon.id}-compact`,
			fontSize: '12px', width: 12, height: 12,
			buttonHeights: [surface.buttonHeight, surface.buttonHeight],
			buttonPadding: ['0px 3px 0px 6px', '0px 6px 0px 3px'],
			contentInsets: [{ left: 6, right: 3 }, { left: 3, right: 6 }],
			labelGap: 6,
		}))));
	});

	test('matches picker heights and icon boxes across the primary and secondary composer toolbars', () => {
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
				dom.append(button, dom.$('span', undefined, 'Autopilot'));
				const style = dom.getWindow(icon).getComputedStyle(icon);
				const buttonStyle = dom.getWindow(button).getComputedStyle(button);
				states.push({
					toolbar: toolbarClass,
					picker: pickerClass,
					height: button.getBoundingClientRect().height,
					padding: buttonStyle.padding,
					radius: buttonStyle.borderRadius,
					icon: { width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height, fontSize: style.fontSize, lineHeight: style.lineHeight },
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
			permissionLevels: actionWidget.items.filter(item => item.section && item.item && !item.isSectionToggle && !item.standaloneToggle).map(item => item.label),
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
				initialFocusGroup: actionWidget.options?.initialFocusGroup,
				initialFocusItem: actionWidget.options?.initialFocusItemId,
			});
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [
			{ combined: false, disclosure: false, oldPickerHidden: false, initialFocusGroup: undefined, initialFocusItem: undefined },
			{ combined: true, disclosure: true, oldPickerHidden: true, initialFocusGroup: 'agentHostModePicker.permissions', initialFocusItem: undefined },
		]);
	});

	test('stacked rows retain the permission axis, sandbox toggle, and settings gear', async () => {
		const { modePicker, modeContainer, actionWidget, dispatches, settingsRequests } = setup();
		const trigger = modeContainer.querySelector<HTMLElement>('.agent-host-mode-button')!;
		await modePicker['_showPicker'](trigger);
		const modeHeader = actionWidget.items.find(item => item.kind === ActionListItemKind.Header)?.label;
		const selected = actionWidget.selectedLabels;
		const collapsed = Array.from(actionWidget.options?.collapsedByDefault ?? []);
		const showFilter = actionWidget.options?.showFilter;
		const sandbox = actionWidget.items.find(item => item.standaloneToggle);
		await actionWidget.select('Allow all');
		await modePicker['_showPicker'](trigger, true);
		const expanded = Array.from(actionWidget.options?.collapsedByDefault ?? []);
		const gear = actionWidget.items.find(item => item.isSectionToggle)?.toolbarActions?.[0];
		assert.ok(gear);
		await gear.run();
		assert.deepStrictEqual({
			modeHeader,
			selected,
			collapsed,
			expanded,
			showFilter,
			sandbox: { label: sandbox?.label, icon: sandbox?.group?.icon?.id, checked: sandbox?.standaloneToggle?.checked },
			dispatches,
			settingsRequests,
		}, {
			modeHeader: 'Agent mode',
			selected: ['Interactive', 'Assisted permissions'],
			collapsed: ['agentHostModePicker.permissions'],
			expanded: [],
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
			const shown = Event.toPromise(onDidShow);
			button.click();
			await shown;
			states.push({
				anchorMatches: actionWidget.anchor === button,
				above: actionWidget.options?.anchorPosition === AnchorPosition.ABOVE,
				focusGroup: actionWidget.options?.initialFocusGroup,
				collapsed: [...actionWidget.options?.collapsedByDefault ?? []],
				expanded: button.ariaExpanded,
			});
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [
			{ anchorMatches: true, above: true, focusGroup: undefined, collapsed: ['agentHostModePicker.permissions'], expanded: 'true' },
			{ anchorMatches: true, above: true, focusGroup: 'agentHostModePicker.permissions', collapsed: [], expanded: 'true' },
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
			focusGroup: actionWidget.options?.initialFocusGroup,
			permissionsExpanded: permissions.ariaExpanded,
		}, { showCount: 1, focusGroup: 'agentHostModePicker.permissions', permissionsExpanded: 'true' });
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

	test('always shows the shield on the sandbox toggle row', async () => {
		const { modePicker, modeContainer, configuration, actionWidget } = setup();
		const states = [];
		const settingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, false)!;
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
		const { modePicker, modeContainer, configuration, config, actionWidget, dispatches } = setup();
		const settingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, false)!;
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
		const gear = actionWidget.items.find(item => item.isSectionToggle)?.toolbarActions?.[0];
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
			'chat.assistedPermissions.enabled',
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
			'chat.agentHost.sdkSandbox.*',
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
				gap: targetWindow.getComputedStyle(row).columnGap,
				gearPadding: targetWindow.getComputedStyle(row.querySelector('.action-list-item-toolbar .action-label')!).paddingLeft,
			});
		}
		assert.deepStrictEqual(states, ['rgb(119, 119, 119)', 'rgb(170, 136, 0)', 'rgb(0, 102, 204)'].map(color => ({
			color, matchesTrigger: true, gearVisible: true, visibleAtRest: true, visibleOnFocus: true, compact: true, gap: '4px', gearPadding: '2px',
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
		const sandboxSettingId = getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, false)!;
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
		const picker = store.add(new AgentHostChatInputPicker(
			widget,
			SessionConfigKey.AutoApprove,
			new class extends mock<IAgentHostService>() {
				override dispatch(channel: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
					writes.push({ channel, action });
				}
			}(),
			actionWidgetService,
			new class extends mock<IHoverService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { }(),
			new class extends mock<IWorkspaceContextService>() { }(),
			new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
				override readonly onDidChange = Event.None;
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
						[SessionConfigKey.AutoApprove]: { type: 'string', title: 'Permissions', enum: ['default', 'autoApprove'], default: 'default' },
						[SessionConfigKey.SandboxEnabled]: { type: 'string', title: 'Sandbox', enum: ['default', 'on', 'off'], sessionMutable: true },
					},
				},
			},
		};

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
					const disabled = managed && bypass !== true;
					assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled, title: toggle.title, writes }, {
						checked: true,
						disabled,
						title: managed
							? disabled ? 'Sandboxing is required by your organization' : 'Sandboxing is enabled by your organization, but you may disable it'
							: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only.',
						writes: disabled ? [] : (managed || configured === AgentSandboxEnabledValue.On ? ['off', 'on'] : ['on']).map(value => ({
							channel: 'copilotcli:/test-session', action: { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: value } },
						})),
					});
				}
			}
		}

		const sessionConfig = picker['_initialResolved'].result;
		sessionConfig.values[SessionConfigKey.SandboxEnabled] = 'off';
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, false);
		sessionConfig.values[SessionConfigKey.SandboxEnabled] = 'on';
		await configurationService.setUserConfiguration(sandboxSettingId, AgentSandboxEnabledValue.Off);
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, true);
		delete sessionConfig.values[SessionConfigKey.SandboxEnabled];

		const toggle = picker['_getSandboxStandaloneToggle']()!;
		allowBypass = false;
		managedSettingsChanged.fire();
		writes.length = 0;
		toggle.onChange(false);
		assert.deepStrictEqual({ writes, disabled: picker['_getSandboxStandaloneToggle']()!.disabled }, { writes: [], disabled: true });
		allowBypass = true;
		managedSettingsChanged.fire();
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.disabled, false);

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
			{ disabled: false, title: 'Sandboxing is enabled by your organization, but you may disable it' },
			{ disabled: false, title: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only.' },
			{ disabled: false, title: 'Sandboxing is enabled by your organization, but you may disable it' },
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
			claudePermissions: getConfigPickerListOptions(ClaudeSessionConfigKey.PermissionMode),
			codexApprovals: getConfigPickerListOptions(CodexSessionConfigKey.PermissionsPreset),
		}, {
			mode: { minWidth: 260 },
			approvals: { minWidth: 255 },
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
			sdk: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, false, false),
			sdkWindows: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, false, true),
			customTerminal: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, true, false),
			customTerminalWindows: getAgentHostSandboxSettingId(SessionType.AgentHostCopilot, true, true),
			claude: getAgentHostSandboxSettingId(SessionType.AgentHostClaude, false, false),
		}, {
			sdk: AgentSandboxSettingId.AgentSandboxEnabled,
			sdkWindows: AgentSandboxSettingId.AgentSandboxWindowsEnabled,
			customTerminal: AgentSandboxSettingId.AgentSandboxEnabled,
			customTerminalWindows: AgentSandboxSettingId.AgentSandboxWindowsEnabled,
			claude: undefined,
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

			test('shows Assisted permissions only when the setting is enabled', () => {
				assert.deepStrictEqual({
					enabled: isPermissionLevelVisible(ChatPermissionLevel.Assisted, true),
					disabled: isPermissionLevelVisible(ChatPermissionLevel.Assisted, false),
					bypass: isPermissionLevelVisible(ChatPermissionLevel.AutoApprove, false),
				}, {
					enabled: true,
					disabled: false,
					bypass: true,
				});
			});

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
