/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IAction } from '../../../../base/common/actions.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDebugService, IDebugSession, IDebugConfiguration, IConfig, ILaunch, State } from '../common/debug.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { selectBorder, selectBackground, asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { DisposableStore, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { ADD_CONFIGURATION_ID } from './debugCommands.js';
import { BaseActionViewItem, IBaseActionViewItemOptions, SelectActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { debugStart } from './debugIcons.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { ActionWidgetDropdown, IActionWidgetDropdownAction } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';

export class StartDebugActionViewItem extends BaseActionViewItem {

	private container!: HTMLElement;
	private start!: HTMLElement;
	private configurationContainer!: HTMLElement;
	private dropdownLabel: HTMLElement | undefined;
	private dropdown!: ActionWidgetDropdown;
	private debugOptions: { label: string; handler: (() => Promise<boolean>) }[] = [];
	private toDispose: IDisposable[];
	private selected = 0;
	private providers: { label: string; type: string; pick: () => Promise<{ launch: ILaunch; config: IConfig } | undefined> }[] = [];

	constructor(
		private context: unknown,
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IDebugService private readonly debugService: IDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextViewService _contextViewService: IContextViewService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super(context, action, options);
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('launch')) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => {
			this.updateOptions();
		}));
	}

	override render(container: HTMLElement): void {
		this.container = container;
		container.classList.add('start-debug-action-item');
		this.start = dom.append(container, dom.$(ThemeIcon.asCSSSelector(debugStart)));
		const title = this.keybindingService.appendKeybinding(this.action.label, this.action.id);
		this.toDispose.push(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.start, title));
		this.start.setAttribute('role', 'button');
		this._setAriaLabel(title);

		this._register(Gesture.addTarget(this.start));
		for (const event of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this.toDispose.push(dom.addDisposableListener(this.start, event, () => {
				this.start.blur();
				if (this.debugService.state !== State.Initializing) {
					this.actionRunner.run(this.action, this.context);
				}
			}));
		}

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (this.action.enabled && e.button === 0) {
				this.start.classList.add('active');
			}
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_UP, () => {
			this.start.classList.remove('active');
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_OUT, () => {
			this.start.classList.remove('active');
		}));

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this.start.tabIndex = -1;
				this.dropdownLabel?.focus();
				event.stopPropagation();
			}
		}));

		this.configurationContainer = dom.append(container, dom.$('.configuration'));

		this.dropdown = new ActionWidgetDropdown(this.configurationContainer, {
			label: nls.localize('debugLaunchConfigurations', 'Debug Launch Configurations'),
			labelRenderer: (el: HTMLElement) => {
				this.dropdownLabel = el;
				el.classList.add('start-debug-action-item-dropdown-label');
				el.tabIndex = -1;
				el.setAttribute('role', 'button');
				el.setAttribute('aria-haspopup', 'true');
				el.setAttribute('aria-expanded', 'false');
				this.renderDropdownLabel();
				return null;
			},
			actionProvider: { getActions: () => this.getDropdownActions() },
			listOptions: {
				showFilter: true,
				filterPlaceholder: nls.localize('debugLaunchConfigurations.search', "Search configurations"),
				focusFilterOnOpen: true,
			},
		}, this.actionWidgetService, this.keybindingService, this.telemetryService);
		this.toDispose.push(this.dropdown);
		this.toDispose.push(this.dropdown.onDidChangeVisibility(visible => {
			this.dropdownLabel?.setAttribute('aria-expanded', String(visible));
		}));

		this.toDispose.push(dom.addDisposableListener(this.configurationContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				if (this.dropdownLabel) {
					this.dropdownLabel.tabIndex = -1;
				}
				this.start.tabIndex = 0;
				this.start.focus();
				event.stopPropagation();
				event.preventDefault();
			}
		}));

		this.container.style.border = `1px solid ${asCssVariable(selectBorder)}`;
		this.configurationContainer.style.borderLeft = `1px solid ${asCssVariable(selectBorder)}`;
		this.container.style.backgroundColor = asCssVariable(selectBackground);

		const configManager = this.debugService.getConfigurationManager();
		const updateDynamicConfigs = () => configManager.getDynamicProviders().then(providers => {
			if (providers.length !== this.providers.length) {
				this.providers = providers;
				this.updateOptions();
			}
		});

		this.toDispose.push(configManager.onDidChangeConfigurationProviders(updateDynamicConfigs));
		updateDynamicConfigs();
		this.updateOptions();
	}

	override setActionContext(context: any): void {
		this.context = context;
	}

	override isEnabled(): boolean {
		return true;
	}

	override focus(fromRight?: boolean): void {
		if (fromRight) {
			if (this.dropdownLabel) {
				this.dropdownLabel.tabIndex = 0;
				this.dropdownLabel.focus();
			}
		} else {
			this.start.tabIndex = 0;
			this.start.focus();
		}
	}

	override blur(): void {
		this.start.tabIndex = -1;
		if (this.dropdownLabel) {
			this.dropdownLabel.tabIndex = -1;
			this.dropdownLabel.blur();
		}
		this.container.blur();
	}

	override setFocusable(focusable: boolean): void {
		if (focusable) {
			this.start.tabIndex = 0;
		} else {
			this.start.tabIndex = -1;
			if (this.dropdownLabel) {
				this.dropdownLabel.tabIndex = -1;
			}
		}
	}

	override dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}

	private renderDropdownLabel(): void {
		if (!this.dropdownLabel) {
			return;
		}
		const currentLabel = this.debugOptions[this.selected]?.label
			?? nls.localize('noConfigurations', "No Configurations");
		const labelSpan = dom.$('span.start-debug-action-item-label', undefined, currentLabel);
		const chevron = renderLabelWithIcons('$(chevron-down)');
		dom.reset(this.dropdownLabel, labelSpan, ...chevron);
		this.dropdownLabel.title = currentLabel;
		this.dropdownLabel.setAttribute('aria-label', nls.localize('debugLaunchConfigurationsAriaLabel', "Debug Launch Configurations: {0}", currentLabel));
	}

	private getDropdownActions(): IActionWidgetDropdownAction[] {
		const actions: IActionWidgetDropdownAction[] = [];
		for (let i = 0; i < this.debugOptions.length; i++) {
			const option = this.debugOptions[i];
			const category = this.optionCategories[i];
			actions.push({
				id: `debug.config.${i}`,
				label: option.label,
				tooltip: option.label,
				class: undefined,
				enabled: true,
				checked: i === this.selected,
				category,
				run: async () => {
					// Selection state and label are reconciled by updateOptions(),
					// triggered by manager.onDidSelectConfiguration.
					await option.handler();
				}
			});
		}
		return actions;
	}

	private optionCategories: ({ label: string; order: number } | undefined)[] = [];

	private updateOptions(): void {
		this.selected = 0;
		this.debugOptions = [];
		this.optionCategories = [];
		const manager = this.debugService.getConfigurationManager();
		const inWorkspace = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		let lastGroup: string | undefined;
		let groupOrder = 0;

		const pushOption = (option: { label: string; handler: (() => Promise<boolean>) }, category: { label: string; order: number } | undefined) => {
			this.debugOptions.push(option);
			this.optionCategories.push(category);
		};

		manager.getAllConfigurations().forEach(({ launch, name, presentation }) => {
			if (lastGroup !== presentation?.group) {
				lastGroup = presentation?.group;
				if (this.debugOptions.length) {
					groupOrder++;
				}
			}
			if (name === manager.selectedConfiguration.name && launch === manager.selectedConfiguration.launch) {
				this.selected = this.debugOptions.length;
			}

			const label = inWorkspace ? `${name} (${launch.name})` : name;
			pushOption({
				label, handler: async () => {
					await manager.selectConfiguration(launch, name);
					return true;
				}
			}, { label: `configurations-${groupOrder}`, order: groupOrder });
		});

		// Only take 3 elements from the recent dynamic configurations to not clutter the dropdown
		manager.getRecentDynamicConfigurations().slice(0, 3).forEach(({ name, type }) => {
			if (type === manager.selectedConfiguration.type && manager.selectedConfiguration.name === name) {
				this.selected = this.debugOptions.length;
			}
			pushOption({
				label: name,
				handler: async () => {
					await manager.selectConfiguration(undefined, name, undefined, { type });
					return true;
				}
			}, { label: 'recent-dynamic', order: 100 });
		});

		if (this.debugOptions.length === 0) {
			pushOption({ label: nls.localize('noConfigurations', "No Configurations"), handler: async () => false }, undefined);
		}

		this.providers.forEach(p => {
			pushOption({
				label: `${p.label}...`,
				handler: async () => {
					const picked = await p.pick();
					if (picked) {
						await manager.selectConfiguration(picked.launch, picked.config.name, picked.config, { type: p.type });
						return true;
					}
					return false;
				}
			}, { label: 'actions', order: 200 });
		});

		manager.getLaunches().filter(l => !l.hidden).forEach(l => {
			const label = inWorkspace ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize('addConfiguration', "Add Configuration...");
			pushOption({
				label, handler: async () => {
					await this.commandService.executeCommand(ADD_CONFIGURATION_ID, l.uri.toString());
					return false;
				}
			}, { label: 'actions', order: 200 });
		});

		this.renderDropdownLabel();
	}

	private _setAriaLabel(title: string): void {
		let ariaLabel = title;
		let keybinding: string | undefined;
		const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Debug);
		if (verbose) {
			keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp, this.contextKeyService)?.getLabel() ?? undefined;
		}
		if (keybinding) {
			ariaLabel = nls.localize('commentLabelWithKeybinding', "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
		} else {
			ariaLabel = nls.localize('commentLabelWithKeybindingNoKeybinding', "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
		}
		this.start.ariaLabel = ariaLabel;
	}
}

export class FocusSessionActionViewItem extends SelectActionViewItem<IDebugSession> {
	constructor(
		action: IAction,
		session: IDebugSession | undefined,
		@IDebugService protected readonly debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(null, action, [], -1, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('debugSession', 'Debug Session'), useCustomDrawn: !hasNativeContextMenu(configurationService) });

		this._register(this.debugService.getViewModel().onDidFocusSession(() => {
			const session = this.getSelectedSession();
			if (session) {
				const index = this.getSessions().indexOf(session);
				this.select(index);
			}
		}));

		const sessionListenersStore = this._register(new DisposableStore());
		const registerSessionListeners = (session: IDebugSession) => {
			const sessionListeners = sessionListenersStore.add(new DisposableStore());
			sessionListeners.add(session.onDidChangeName(() => this.update()));
			sessionListeners.add(session.onDidEndAdapter(() => sessionListenersStore.delete(sessionListeners)));
		};
		this._register(this.debugService.onDidNewSession(session => {
			registerSessionListeners(session);
			this.update();
		}));
		// Apply the same pattern to existing sessions - track listeners for cleanup
		this.getSessions().forEach(registerSessionListeners);
		this._register(this.debugService.onDidEndSession(() => this.update()));

		const selectedSession = session ? this.mapFocusedSessionToSelected(session) : undefined;
		this.update(selectedSession);
	}

	protected override getActionContext(_: string, index: number): IDebugSession {
		return this.getSessions()[index];
	}

	private update(session?: IDebugSession) {
		if (!session) {
			session = this.getSelectedSession();
		}
		const sessions = this.getSessions();
		const names = sessions.map(s => {
			const label = s.getLabel();
			if (s.parentSession) {
				// Indent child sessions so they look like children
				return `\u00A0\u00A0${label}`;
			}

			return label;
		});
		this.setOptions(names.map((data): ISelectOptionItem => ({ text: data })), session ? sessions.indexOf(session) : undefined);
	}

	private getSelectedSession(): IDebugSession | undefined {
		const session = this.debugService.getViewModel().focusedSession;
		return session ? this.mapFocusedSessionToSelected(session) : undefined;
	}

	protected getSessions(): ReadonlyArray<IDebugSession> {
		const showSubSessions = this.configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
		const sessions = this.debugService.getModel().getSessions();

		return showSubSessions ? sessions : sessions.filter(s => !s.parentSession);
	}

	protected mapFocusedSessionToSelected(focusedSession: IDebugSession): IDebugSession {
		const showSubSessions = this.configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
		while (focusedSession.parentSession && !showSubSessions) {
			focusedSession = focusedSession.parentSession;
		}
		return focusedSession;
	}
}
