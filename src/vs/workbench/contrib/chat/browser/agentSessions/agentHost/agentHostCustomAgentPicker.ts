/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as nls from '../../../../../../nls.js';
import { getFlatActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAgentPickerStorageKey, getEffectiveAgents, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { CustomizationAgentRef, SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { AICustomizationManagementCommands } from '../../aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import type { IChatWidget } from '../../chat.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from '../../widget/input/chatInputPickerActionItem.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/**
 * Shared footer-menu identifier for both Agent Host custom-agent pickers —
 * the Agents-Window picker (in `vs/sessions`) and the workbench
 * chat-editor picker. What is shared here is the {@link MenuId}; each
 * surface contributes its own footer actions against this menu as needed.
 */
export const MenuIdAgentHostAgentPicker = new MenuId('AgentHostAgentPicker');

function toBackendSessionUri(sessionResource: URI): URI | undefined {
	const scheme = sessionResource.scheme;
	const prefix = 'agent-host-';
	if (!scheme.startsWith(prefix)) {
		return undefined;
	}
	const provider = scheme.substring(prefix.length);
	if (!provider) {
		return undefined;
	}
	const rawId = sessionResource.path.replace(/^\//, '');
	return URI.from({ scheme: provider, path: `/${rawId}` });
}

/**
 * Workbench-chat counterpart of the Agents-Window agent picker. Reads the
 * effective custom-agent list and current selection directly from the
 * agent-host {@link SessionState} via {@link IAgentHostService}, and writes
 * selections back by dispatching `SessionAgentChanged` on the same
 * connection — paralleling the per-property chips in
 * `agentHostChatInputPicker.ts`.
 *
 * For untitled chat-editor sessions there is no real backend session yet,
 * so the backend URI is resolved through
 * {@link IAgentHostUntitledProvisionalSessionService}. The per-property
 * chips eagerly create that provisional on first render, so by the time
 * this picker opens `state.customizations` is already being populated by
 * the agent host.
 *
 * Visibility is gated upstream via the
 * `OpenAgentHostCustomAgentPickerAction` menu `when` clause
 * (`isAgentHostSession && !isSessionsWindow`).
 */
export class WorkbenchAgentHostAgentPickerActionItem extends ChatInputPickerActionViewItem {

	private readonly _currentAgent = observableValue<CustomizationAgentRef | undefined>('agentHostCurrentAgent', undefined);
	private readonly _subRef = this._register(new MutableDisposable<IDisposable & { readonly sub: IAgentSubscription<SessionState>; readonly backendSession: URI }>());
	/** Captured at construction so the footer menu doesn't depend on a private parent field. */
	private readonly _ctxKeyService: IContextKeyService;

	constructor(
		action: IAction,
		pickerOptions: IChatInputPickerOptions,
		private readonly _widget: IChatWidget,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
	) {
		const widgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: {
				getActions: () => this._buildRows(),
			} satisfies IActionWidgetDropdownActionProvider,
			actionBarActionProvider: {
				getActions: () => this._getFooterActions(),
			},
			showItemKeybindings: false,
			reporter: { id: 'ChatAgentHostAgentPicker', name: 'ChatAgentHostAgentPicker', includeOptions: true },
		};

		super(action, widgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
		this._ctxKeyService = contextKeyService;

		this._reattach();
		this._refresh();

		// Re-render the chip label whenever the locally tracked selection changes.
		this._register(autorun(reader => {
			this._currentAgent.read(reader);
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));

		// Active chat session changed (editor switched, view-model swapped).
		this._register(this._widget.onDidChangeViewModel(() => {
			this._reattach();
			this._refresh();
		}));

		// Provisional backend create/rebind/dispose — swap the subscription
		// when the change is for the session this picker is bound to.
		this._register(this._provisional.onDidChange(changed => {
			const current = this._sessionResource();
			if (current && changed.toString() === current.toString()) {
				this._reattach();
				this._refresh();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-agent-picker-item');
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const current = this._currentAgent.get();
		const label = current ? current.name : nls.localize('agentPickerDefault', "Agent");
		const elements: (HTMLElement | string)[] = [];
		const compact = this.pickerOptions.compact.get();
		// Only the default placeholder shows an icon; a chosen custom agent
		// is rendered as a plain label.
		if (!current) {
			elements.push(...renderLabelWithIcons(`$(${Codicon.agent.id})`));
		}
		if (!compact || current) {
			elements.push(dom.$('span.chat-input-picker-label', undefined, label));
		}
		dom.reset(element, ...elements);
		return null;
	}

	private _buildRows(): IActionWidgetDropdownAction[] {
		const current = this._currentAgent.get();
		const defaultCategory = { label: nls.localize('agentPickerDefaultCategory', "Default"), order: 0 };
		const customCategory = { label: nls.localize('agentPickerCustomCategory', "Custom Agents"), order: 1 };
		const rows: IActionWidgetDropdownAction[] = [{
			id: 'workbench.chat.agentHostAgentPicker.default',
			label: nls.localize('agentPickerDefault', "Agent"),
			tooltip: '',
			class: undefined,
			enabled: true,
			icon: ThemeIcon.fromId(Codicon.agent.id),
			checked: current === undefined,
			hover: { content: nls.localize('agentPickerDefaultHover', "Use the default agent.") },
			category: defaultCategory,
			run: async () => {
				this._userSetAgent(undefined);
				if (this.element) {
					this.renderLabel(this.element);
				}
			},
		}];
		for (const agent of this._currentAgents()) {
			const agentUri = agent.uri;
			const viewAgentLabel = nls.localize('viewAgent', "View {0} agent", agent.name);
			const toolbarActions: IAction[] = [{
				id: `workbench.chat.agentHostAgentPicker.view.${agent.uri.toString()}`,
				label: viewAgentLabel,
				tooltip: viewAgentLabel,
				class: ThemeIcon.asClassName(Codicon.goToFile),
				enabled: true,
				run: async () => { void this._openerService.open(agentUri); },
			}];
			rows.push({
				id: `workbench.chat.agentHostAgentPicker.agent.${agent.uri.toString()}`,
				label: agent.name,
				tooltip: '',
				class: undefined,
				enabled: true,
				checked: current?.uri.toString() === agent.uri.toString(),
				hover: agent.description ? { content: agent.description } : undefined,
				category: customCategory,
				toolbarActions,
				run: async () => {
					this._userSetAgent(agent);
					if (this.element) {
						this.renderLabel(this.element);
					}
				},
			});
		}
		return rows;
	}

	private _sessionResource(): URI | undefined {
		return this._widget.viewModel?.sessionResource;
	}

	private _resolveBackend(sessionResource: URI): URI | undefined {
		return this._provisional.get(sessionResource) ?? toBackendSessionUri(sessionResource);
	}

	private _reattach(): void {
		const resource = this._sessionResource();
		const provisionalBackend = resource ? this._provisional.get(resource) : undefined;
		const fallbackBackend = resource ? toBackendSessionUri(resource) : undefined;
		const backend = provisionalBackend ?? fallbackBackend;

		// For untitled chat sessions the AHP server only knows about the
		// session once the provisional is created (driven by the chip lane).
		// Subscribing to the deterministic URI before that hands us a
		// permanently-empty subscription, so wait for `_provisional.onDidChange`
		// to swap us onto the real backend.
		const readyToSubscribe = !!backend && (!resource || !isUntitledChatSession(resource) || !!provisionalBackend);
		const targetBackend = readyToSubscribe ? backend : undefined;

		if (this._subRef.value?.backendSession.toString() === targetBackend?.toString()) {
			return;
		}
		this._subRef.clear();
		if (!targetBackend) {
			return;
		}
		const ref = this._agentHostService.getSubscription(StateComponents.Session, targetBackend);
		const sub = ref.object;
		const listener = sub.onDidChange(() => this._refresh());
		this._subRef.value = {
			sub,
			backendSession: targetBackend,
			dispose: () => { listener.dispose(); ref.dispose(); },
		};
	}

	private _readState(): SessionState | undefined {
		const value = this._subRef.value?.sub.value;
		return value && !(value instanceof Error) ? value : undefined;
	}

	private _currentAgents(): readonly CustomizationAgentRef[] {
		return getEffectiveAgents(this._readState()?.customizations);
	}

	private _refresh(): void {
		const resource = this._sessionResource();
		if (!resource) {
			this._currentAgent.set(undefined, undefined);
			return;
		}
		const state = this._readState();
		const agents = getEffectiveAgents(state?.customizations);
		const sessionAgentUri = state?.summary.agent?.uri;
		const storedUri = this._storageService.get(agentHostAgentPickerStorageKey(resource.scheme), StorageScope.PROFILE);
		const resolved = resolveAgentHostAgent(agents, sessionAgentUri, storedUri);
		this._currentAgent.set(resolved, undefined);
	}

	private _userSetAgent(agent: CustomizationAgentRef | undefined): void {
		const resource = this._sessionResource();
		const backend = resource ? this._resolveBackend(resource) : undefined;
		if (!resource || !backend) {
			return;
		}
		this._currentAgent.set(agent, undefined);
		const key = agentHostAgentPickerStorageKey(resource.scheme);
		if (agent) {
			this._storageService.store(key, agent.uri.toString(), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(key, StorageScope.PROFILE);
		}
		this._agentHostService.dispatch(backend.toString(), {
			type: ActionType.SessionAgentChanged,
			...(agent ? { agent: { uri: agent.uri } } : {}),
		});
	}

	private _getFooterActions(): IAction[] {
		const menu = this._menuService.createMenu(MenuIdAgentHostAgentPicker, this._ctxKeyService);
		const actions = getFlatActionBarActions(menu.getActions({ renderShortTitle: true }));
		menu.dispose();
		return actions;
	}

	override show(): void {
		super.show();
	}
}

/**
 * "Configure Custom Agents…" footer entry for the workbench chat-editor
 * custom-agent picker. The Agents-Window picker registers an equivalent
 * action in `vs/sessions/.../agentHostAgentPicker.ts`; gating on
 * `\!isSessionsWindow` keeps the menu from duplicating when both layers
 * happen to be loaded in the same process.
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.chat.agentHostAgentPicker.configure',
			title: nls.localize2('configureCustomAgents', "Configure Custom Agents..."),
			f1: false,
			menu: [{
				id: MenuIdAgentHostAgentPicker,
				group: 'configure',
				order: 1,
				when: IsSessionsWindowContext.negate(),
			}],
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
