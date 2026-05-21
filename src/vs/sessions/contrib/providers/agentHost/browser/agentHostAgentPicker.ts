/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ChatContextKeyExprs } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import type { CustomizationAgentRef } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IChatInputPickerOptions, ChatInputPickerActionViewItem } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { ActiveSessionProviderIdContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { type ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';

const MenuIdAgentHostAgentPicker = new MenuId('sessions.agentHost.agentPicker');

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

// -- Agent Host Agent Picker Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.agentPicker',
			title: nls.localize2('agentHostAgentPicker', "Agent"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: -1,
				when: ContextKeyExpr.and(IsActiveSessionAgentHost, IsPhoneLayoutContext.negate()),
			}, {
				// Running-session input bar — only inside the dedicated
				// Agents Window. The regular VS Code chat editor uses its
				// own picker (`agentHostCustomAgentPicker.ts`) gated on
				// `!isSessionsWindow` so the two surfaces don't double up.
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, IsSessionsWindowContext, IsPhoneLayoutContext.negate()),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Configure Custom Agents footer action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.agentPicker.configure',
			title: nls.localize2('configureCustomAgents', "Configure Custom Agents..."),
			f1: false,
			menu: [{ id: MenuIdAgentHostAgentPicker, group: 'configure', order: 1 }],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		try {
			await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
		} catch {
			await commandService.executeCommand('workbench.action.chat.configure.customagents');
		}
	}
});

export function agentHostAgentPickerStorageKey(resourceScheme: string): string {
	return `workbench.agentsession.agentHostAgentPicker.${resourceScheme}.selectedAgentUri`;
}

/**
 * Resolves the agent that should be shown for a session:
 * - If `selectedAgentUri` is set and resolves against the effective agent
 *   list, use that entry.
 * - Else if a stored agent URI matches an entry in the list, use that entry.
 * - Else `undefined` (the default "Agent" placeholder row).
 *
 * Takes the agent URI directly (rather than an `ISessionAgentRef`) because
 * `ISession.mode` only carries the URI — the display name is recovered from
 * the resolved {@link CustomizationAgentRef}.
 */
export function resolveAgentHostAgent(
	agents: readonly CustomizationAgentRef[],
	selectedAgentUri: string | undefined,
	storedAgentUri: string | undefined,
): CustomizationAgentRef | undefined {
	if (selectedAgentUri) {
		const match = agents.find(a => a.uri === selectedAgentUri);
		if (match) {
			return match;
		}
	}
	return storedAgentUri ? agents.find(a => a.uri === storedAgentUri) : undefined;
}

interface IAgentPickerDelegate {
	readonly currentAgent: IObservable<CustomizationAgentRef | undefined>;
	readonly currentAgents: () => readonly CustomizationAgentRef[];
	readonly setAgent: (agent: CustomizationAgentRef | undefined) => void;
	readonly sessionResource: () => URI | undefined;
}

class AgentHostAgentPickerActionItem extends ChatInputPickerActionViewItem {

	constructor(
		action: IAction,
		private readonly delegate: IAgentPickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		const defaultCategory = { label: nls.localize('agentPickerDefaultCategory', "Default"), order: 0 };
		const customCategory = { label: nls.localize('agentPickerCustomCategory', "Custom Agents"), order: 1 };

		const makeDefaultAction = (): IActionWidgetDropdownAction => ({
			id: 'sessions.agentHost.agentPicker.default',
			label: nls.localize('agentPickerDefault', "Agent"),
			tooltip: '',
			class: undefined,
			enabled: true,
			icon: ThemeIcon.fromId(Codicon.agent.id),
			checked: this.delegate.currentAgent.get() === undefined,
			hover: { content: nls.localize('agentPickerDefaultHover', "Use the default agent.") },
			category: defaultCategory,
			run: async () => {
				this.delegate.setAgent(undefined);
				if (this.element) {
					this.renderLabel(this.element);
				}
			},
		});

		const makeAgentAction = (agent: CustomizationAgentRef): IActionWidgetDropdownAction => {
			const current = this.delegate.currentAgent.get();
			const agentUri = URI.parse(agent.uri);
			const toolbarActions: IAction[] = [{
				id: `sessions.agentHost.agentPicker.view.${agent.uri}`,
				label: nls.localize('viewAgent', "View {0} agent", agent.name),
				tooltip: nls.localize('viewAgent', "View {0} agent", agent.name),
				class: ThemeIcon.asClassName(Codicon.goToFile),
				enabled: true,
				run: async () => {
					await this.openerService.open(agentUri);
				},
			}];
			return {
				id: `sessions.agentHost.agentPicker.agent.${agent.uri}`,
				label: agent.name,
				tooltip: '',
				class: undefined,
				enabled: true,
				checked: current?.uri === agent.uri,
				hover: agent.description ? { content: agent.description } : undefined,
				category: customCategory,
				toolbarActions,
				run: async () => {
					this.delegate.setAgent({ uri: agent.uri, name: agent.name, ...(agent.description ? { description: agent.description } : {}) });
					if (this.element) {
						this.renderLabel(this.element);
					}
				},
			};
		};

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const actions: IActionWidgetDropdownAction[] = [makeDefaultAction()];
				const agents = [...this.delegate.currentAgents()].sort((a, b) =>
					a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri),
				);
				for (const agent of agents) {
					actions.push(makeAgentAction(agent));
				}
				return actions;
			},
		};

		const widgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider: {
				getActions: () => this.getFooterActions(),
			},
			showItemKeybindings: false,
			reporter: { id: 'NewChatAgentHostAgentPicker', name: 'NewChatAgentHostAgentPicker', includeOptions: true },
		};

		super(action, widgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(autorun(reader => {
			this.delegate.currentAgent.read(reader);
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-agent-picker-item');
	}

	attachDisposable(d: IDisposable): void {
		this._register(d);
	}

	private getFooterActions(): IAction[] {
		const menu = this.menuService.createMenu(MenuIdAgentHostAgentPicker, this.contextKeyService);
		const actions = getFlatActionBarActions(menu.getActions({ renderShortTitle: true }));
		menu.dispose();
		return actions;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);

		const current = this.delegate.currentAgent.get();
		const label = current ? current.name : nls.localize('agentPickerDefault', "Agent");

		const elements = [];
		const compact = this.pickerOptions.compact.get();
		// Only the default placeholder shows an icon; a chosen custom
		// agent is rendered as a plain label.
		if (!current) {
			elements.push(...renderLabelWithIcons(`$(${Codicon.agent.id})`));
		}
		if (!compact || current) {
			elements.push(dom.$('span.chat-input-picker-label', undefined, label));
		}
		dom.reset(element, ...elements);
		return null;
	}
}

class AgentHostAgentPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostAgentPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const factory = (_action: import('../../../../../base/common/actions.js').IAction, _options: import('../../../../../base/browser/ui/actionbar/actionViewItems.js').IActionViewItemOptions, scopedInstantiationService: import('../../../../../platform/instantiation/common/instantiation.js').IInstantiationService) => {
			const currentAgent = observableValue<CustomizationAgentRef | undefined>('currentAgent', undefined);
			let settingAgentInternally = false;

			const getProvider = (session: ISession | undefined): IAgentHostSessionsProvider | undefined => {
				if (!session) {
					return undefined;
				}
				const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
				return provider && isAgentHostProvider(provider) ? provider : undefined;
			};

			const delegate: IAgentPickerDelegate = {
				currentAgent,
				currentAgents: () => {
					const session = sessionsManagementService.activeSession.get();
					const provider = getProvider(session);
					return session && provider ? provider.getCustomAgents(session.sessionId) : [];
				},
				setAgent: (agent: CustomizationAgentRef | undefined) => {
					const previous = currentAgent.get();
					currentAgent.set(agent, undefined);
					const session = sessionsManagementService.activeSession.get();
					if (session) {
						const key = agentHostAgentPickerStorageKey(session.resource.scheme);
						if (agent) {
							storageService.store(key, agent.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
						} else {
							storageService.remove(key, StorageScope.PROFILE);
						}
						const provider = getProvider(session);
						provider?.setAgent?.(session.sessionId, agent ? { uri: agent.uri, name: agent.name } : undefined);
					}
					if (!settingAgentInternally) {
						reportNewChatPickerClosed(telemetryService, {
							id: 'NewChatAgentHostAgentPicker',
							optionIdBefore: previous?.uri,
							optionIdAfter: agent?.uri,
							optionLabelBefore: previous?.name,
							optionLabelAfter: agent?.name,
							isPII: false,
						});
					}
				},
				sessionResource: () => sessionsManagementService.activeSession.get()?.resource,
			};

			const pickerOptions: IChatInputPickerOptions = {
				compact: observableValue('compact', false),
			};
			const action = { id: 'sessions.agentHost.agentPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
			const picker = scopedInstantiationService.createInstance(AgentHostAgentPickerActionItem, action, delegate, pickerOptions);

			const initAgent = (session: ISession | undefined, selectedAgentUri: string | undefined, isUntitled: boolean) => {
				const provider = getProvider(session);
				const agents = session && provider ? provider.getCustomAgents(session.sessionId) : [];

				if (!session) {
					currentAgent.set(undefined, undefined);
					return;
				}

				const storedUri = isUntitled
					? storageService.get(agentHostAgentPickerStorageKey(session.resource.scheme), StorageScope.PROFILE)
					: undefined;
				const resolved = resolveAgentHostAgent(agents, selectedAgentUri, storedUri);
				currentAgent.set(resolved, undefined);
				if (!selectedAgentUri && isUntitled && resolved) {
					settingAgentInternally = true;
					try {
						delegate.setAgent(resolved);
					} finally {
						settingAgentInternally = false;
					}
				} else if (selectedAgentUri && !resolved && agents.length > 0) {
					// The session's selected agent URI no longer maps to any
					// known custom agent (e.g. the contributing plugin was
					// uninstalled). Silently clear the selection so the picker
					// reverts to the default "Agent" row instead of showing a
					// stale label.
					//
					// Only treat this as a stale selection when we actually
					// have a non-empty agent list to compare against — an
					// empty list means the session's customization state
					// hasn't been hydrated yet (e.g. right after a new
					// session graduates and before the running state
					// subscription has populated `_lastSessionStates`).
					// Clearing in that window would wipe a freshly-seeded
					// selection before the host's echo arrives.
					settingAgentInternally = true;
					try {
						delegate.setAgent(undefined);
					} finally {
						settingAgentInternally = false;
					}
				}
			};
			const initFromActiveSession = () => {
				const session = sessionsManagementService.activeSession.get();
				initAgent(session, session?.mode.get()?.id, session?.status.get() === SessionStatus.Untitled);
			};
			initFromActiveSession();

			const disposableStore = new DisposableStore();
			// React to the active session AND to its `mode`
			// observable so server-echoed `SessionAgentChanged` updates
			// (which flow into `mode`) propagate back into the
			// picker. The `settingAgentInternally` guard around the initial
			// pick (below) prevents the autorun from clobbering an in-flight
			// user selection.
			disposableStore.add(autorun(reader => {
				const session = sessionsManagementService.activeSession.read(reader);
				const selectedAgentUri = session?.mode.read(reader)?.id;
				const isUntitled = session?.status.read(reader) === SessionStatus.Untitled;
				initAgent(session, selectedAgentUri, isUntitled);
			}));

			// Also re-run when the active session's provider advertises a
			// different effective custom-agent set (root state, session
			// state, or active-client customizations changed). The picker
			// contribution doesn't see those mutations through the
			// `mode` observable.
			const customAgentsListener = disposableStore.add(new MutableDisposable());
			disposableStore.add(autorun(reader => {
				const session = sessionsManagementService.activeSession.read(reader);
				const provider = getProvider(session);
				customAgentsListener.value = provider?.onDidChangeCustomAgents(() => {
					if (!settingAgentInternally) {
						initFromActiveSession();
					}
				});
			}));

			picker.attachDisposable(disposableStore);
			return picker;
		};

		this._register(actionViewItemService.register(Menus.NewSessionConfig, 'sessions.agentHost.agentPicker', factory));
		this._register(actionViewItemService.register(MenuId.ChatInput, 'sessions.agentHost.agentPicker', factory));
	}
}

registerWorkbenchContribution2(AgentHostAgentPickerContribution.ID, AgentHostAgentPickerContribution, WorkbenchPhase.AfterRestored);
