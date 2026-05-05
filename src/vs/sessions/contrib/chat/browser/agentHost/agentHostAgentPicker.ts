/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { IAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ICustomAgent } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ChatContextKeyExprs } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import * as nls from '../../../../../nls.js';
import { ActiveSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { Menus } from '../../../../browser/menus.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { PickerActionViewItem } from './agentHostSessionConfigPicker.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';

const STORAGE_KEY = 'sessions.agentHostAgentPicker.lastPickedAgentId';

interface IAgentPickerItem {
	/** Source URI of the `.agent.md`; `undefined` represents "no custom agent" (default). */
	readonly id: URI | undefined;
	/** Display label (the agent's `name` from the customization pipeline). */
	readonly label: string;
	readonly description?: string;
	/** When set, selecting this item runs the given IAction instead of setting an agent. */
	readonly footerAction?: IAction;
}

const DEFAULT_LABEL = localize('agentHostAgentPicker.defaultLabel', "Agent");
const DEFAULT_LABEL_DESCRIPTION = localize('agentHostAgentPicker.defaultLabelDescription', "Edit files in your workspace in agent mode");

/**
 * Self-contained picker widget for selecting a custom agent on an
 * agent-host session (composer or active). Mirrors {@link AgentHostModePicker}
 * but routes through {@link ISessionsProvider.setAgent} instead of the
 * `SessionConfigKey`-based session-config mechanism — agents have richer,
 * dynamic-per-session metadata and warrant a dedicated path (parallel to
 * how `setModel` works).
 *
 * Available agents come from the customization harness
 * ({@link ICustomizationHarnessService.getCustomAgents}), keyed on the active
 * session's resource scheme. The active-session selection is dispatched at
 * turn-time by `agentHostSessionHandler._handleTurn` (mirroring how model
 * changes already flow). This picker is the source-of-intent for the
 * composer (pre-create) and the visual indicator for both surfaces.
 */
export class AgentHostAgentPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	private _availableAgents: readonly ICustomAgent[] = [];
	private _activeHarnessId: string | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IStorageService private readonly _storageService: IStorageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			session?.agentId?.read(reader); // re-render when selection changes
			void this._refreshActiveSession(session);
		}));

		this._register(this._customizationHarnessService.onDidChangeCustomAgents(e => {
			if (e.sessionType === this._activeHarnessId) {
				void this._refreshAgentList();
			}
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._renderDisposables.add(Gesture.addTarget(trigger));
		// Stop CLICK to suppress its default activation behaviour, then drive
		// the picker from MOUSE_DOWN — preventDefault on mousedown is required
		// to stop focus from moving to the trigger before _showPicker captures
		// the previously-focused element. This mirrors BaseDropdown's pattern.
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, e => dom.EventHelper.stop(e, true)));
		for (const eventType of [dom.EventType.MOUSE_DOWN, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				if (dom.isMouseEvent(e) && e.button !== 0) {
					return;
				}
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		this._updateTrigger();
	}

	private async _refreshActiveSession(session: ISession | undefined): Promise<void> {
		const harnessId = session?.resource.scheme;
		if (harnessId !== this._activeHarnessId) {
			this._activeHarnessId = harnessId;
			await this._refreshAgentList();
		}
		this._updateTrigger();
	}

	private async _refreshAgentList(): Promise<void> {
		if (!this._activeHarnessId) {
			this._availableAgents = [];
			this._updateTrigger();
			return;
		}
		try {
			this._availableAgents = await this._customizationHarnessService.getCustomAgents(this._activeHarnessId, CancellationToken.None);
		} catch {
			this._availableAgents = [];
		}
		this._updateTrigger();
	}

	private _updateTrigger(): void {
		if (!this._triggerElement || !this._slotElement) {
			return;
		}

		// Always show the picker for agent-host sessions (the action's `when`
		// clause already gates this contribution on agent-host sessions). We
		// render the default label immediately and update once the agent list
		// resolves, instead of leaving the slot empty while we fetch.
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			this._slotElement.style.display = 'none';
			return;
		}
		this._slotElement.style.display = '';

		dom.clearNode(this._triggerElement);

		const currentId = session.agentId?.get();
		let label: string;
		if (!currentId) {
			label = DEFAULT_LABEL;
		} else {
			const known = this._availableAgents.find(a => isEqual(a.uri, currentId));
			label = known
				? known.name
				: localize('agentHostAgentPicker.unavailable', "{0} (unavailable)", basename(currentId));
		}

		dom.append(this._triggerElement, renderIcon(Codicon.agent));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('agentHostAgentPicker.triggerAriaLabel', "Pick agent, {0}", label);
	}

	private _showPicker(): void {
		if (!this._triggerElement || this._actionWidgetService.isVisible) {
			return;
		}
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}

		const triggerElement = this._triggerElement;
		const currentId = session.agentId?.get();
		// Capture focus before opening so we can restore it on hide — matches
		// the behaviour of mode/model pickers (see ActionWidgetDropdown.show).
		const previouslyFocusedElement = dom.getActiveElement();

		const defaultItem: IAgentPickerItem = { id: undefined, label: DEFAULT_LABEL, description: DEFAULT_LABEL_DESCRIPTION };
		const customItems: IAgentPickerItem[] = this._availableAgents.map(agent => ({
			id: agent.uri,
			label: agent.name,
			description: agent.description,
		}));

		const toActionItem = (item: IAgentPickerItem): IActionListItem<IAgentPickerItem> => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			hover: item.description ? { content: item.description } : undefined,
			group: { title: '', icon: isEqual(item.id, currentId) ? Codicon.check : Codicon.blank },
			toolbarActions: this._buildItemToolbarActions(item),
			item,
		});

		const actionItems: IActionListItem<IAgentPickerItem>[] = [
			toActionItem(defaultItem),
			...(customItems.length > 0 ? [{ kind: ActionListItemKind.Separator, label: '' }] : []),
			...customItems.map(toActionItem),
		];

		// Reuse the same `MenuId.ChatModePicker` the active-session picker
		// uses — any "Configure modes…" / "Manage agents…" contributions
		// surface in both places without duplication.
		// Add them as regular list items (with a leading separator) rather than
		// passing them as actionBarActions to IActionWidgetService.show(), because
		// that code path creates an ActionBar at the widget bottom which triggers
		// focusTracker.onDidBlur and immediately hides the widget.
		const menu = this._menuService.createMenu(MenuId.ChatModePicker, this._contextKeyService);
		const footerActions = getFlatActionBarActions(menu.getActions({ renderShortTitle: true }));
		menu.dispose();

		if (footerActions.length > 0) {
			actionItems.push({ kind: ActionListItemKind.Separator, label: '' });
			for (const action of footerActions) {
				actionItems.push({
					kind: ActionListItemKind.Action,
					label: action.label,
					tooltip: action.tooltip || undefined,
					group: { title: '', icon: Codicon.blank },
					item: { id: undefined, label: action.label, footerAction: action },
					toolbarActions: undefined,
				});
			}
		}

		const delegate: IActionListDelegate<IAgentPickerItem> = {
			onSelect: (item, _preview) => {
				this._actionWidgetService.hide();
				if (item.footerAction) {
					item.footerAction.run();
				} else {
					this._select(session, item);
				}
			},
			onHide: () => {
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				} else {
					triggerElement.focus();
				}
			},
		};

		this._actionWidgetService.show<IAgentPickerItem>(
			'agentHostAgentPicker',
			false,
			actionItems,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: i => i.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostAgentPicker.ariaLabel', "Agent Picker"),
			},
		);
	}

	private _buildItemToolbarActions(item: IAgentPickerItem): IAction[] | undefined {
		if (!item.id) {
			return undefined;
		}
		const uri = item.id;
		return [{
			id: `editAgent:${uri.toString()}`,
			label: localize('agentHostAgentPicker.editAgent', "Edit {0}", item.label),
			tooltip: localize('agentHostAgentPicker.editAgent', "Edit {0}", item.label),
			class: ThemeIcon.asClassName(Codicon.edit),
			enabled: true,
			run: async () => {
				await this._openerService.open(uri);
			},
		}];
	}

	private _select(session: ISession, item: IAgentPickerItem): void {
		const provider = this._sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		provider?.setAgent?.(session.sessionId, item.id);
		this._storageService.store(STORAGE_KEY, item.id?.toString() ?? '', StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

// -- Registration --------------------------------------------------------

const PICKER_ACTION_ID = 'sessions.agentHost.agentPicker';
const RUNNING_SESSION_PICKER_ACTION_ID = 'sessions.agentHost.runningSessionAgentPicker';

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: PICKER_ACTION_ID,
			title: nls.localize2('agentHostAgentPicker', "Agent"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: -1,
				when: IsActiveSessionAgentHost,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_PICKER_ACTION_ID,
			title: nls.localize2('agentHostRunningSessionAgentPicker', "Agent"),
			f1: false,
			menu: [{
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 1,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

class AgentHostAgentPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostAgentPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig,
			PICKER_ACTION_ID,
			() => new PickerActionViewItem(instantiationService.createInstance(AgentHostAgentPicker)),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInput,
			RUNNING_SESSION_PICKER_ACTION_ID,
			() => new PickerActionViewItem(instantiationService.createInstance(AgentHostAgentPicker)),
		));
	}
}

registerWorkbenchContribution2(AgentHostAgentPickerContribution.ID, AgentHostAgentPickerContribution, WorkbenchPhase.AfterRestored);
