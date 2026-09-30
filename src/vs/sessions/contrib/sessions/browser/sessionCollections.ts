/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { IAction, Action, Separator } from '../../../../base/common/actions.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { getWorkbenchContribution, IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionsHasMultipleCollectionsContext } from '../../../common/contextkeys.js';
import { SESSIONS_LIST_COLLECTION_SWITCHER_SETTING, SESSIONS_LIST_COLLECTIONS_SETTING, SessionsCollectionSwitcher } from '../../../common/sessionConfig.js';
import { DraggedSessionIdentifier, DraggedSessionListHeaderIdentifier } from '../../../browser/dnd.js';
import { ISessionCollectionsService } from '../../../services/sessions/browser/sessionCollectionsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionCollectionAttention, SessionCollectionsIconStrip, ISessionCollectionsSwitcherDelegate, SESSION_COLLECTIONS_CONTROLLER_ID } from './sessionCollectionsSwitcher.js';
import { SessionHeaderEditors } from './views/sessionHeaderEditors.js';
import { SessionsView, SessionsViewId } from './views/sessionsView.js';

const SWITCH_COLLECTION_COMMAND_ID = 'sessions.collections.switch';
const SWITCH_COLLECTION_TO_INDEX_COMMAND_PREFIX = 'sessions.collections.switchTo';
const NEW_COLLECTION_COMMAND_ID = 'sessions.collections.new';
const EDIT_COLLECTION_COMMAND_ID = 'sessions.collections.edit';
const TITLE_BAR_COLLECTIONS_COMMAND_ID = 'sessions.collections.titleBarStrip';
const COLLECTIONS_ENABLED_CONTEXT = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${SESSIONS_LIST_COLLECTIONS_SETTING}`, true),
)!;
const MULTIPLE_COLLECTIONS_CONTEXT = ContextKeyExpr.and(COLLECTIONS_ENABLED_CONTEXT, SessionsHasMultipleCollectionsContext)!;

class TitleBarCollectionsAction extends Action2 {

	constructor() {
		super({
			id: TITLE_BAR_COLLECTIONS_COMMAND_ID,
			title: localize2('collectionsTitleBar', "Collections"),
			category: SessionsCategories.Sessions,
			precondition: COLLECTIONS_ENABLED_CONTEXT,
			menu: [{
				id: Menus.TitleBarLeftLayout,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(
					COLLECTIONS_ENABLED_CONTEXT,
					ContextKeyExpr.equals(`config.${SESSIONS_LIST_COLLECTION_SWITCHER_SETTING}`, SessionsCollectionSwitcher.TitleBar),
				),
			}],
		});
	}

	override run(): void { }
}

class SwitchCollectionAction extends Action2 {

	constructor() {
		super({
			id: SWITCH_COLLECTION_COMMAND_ID,
			title: localize2('switchCollection', "Switch Collection"),
			category: SessionsCategories.Sessions,
			precondition: COLLECTIONS_ENABLED_CONTEXT,
		});
	}

	override async run(_accessor: ServicesAccessor, collectionId: string | undefined): Promise<void> {
		await getWorkbenchContribution<SessionCollectionsController>(SESSION_COLLECTIONS_CONTROLLER_ID).switchTo(collectionId);
	}
}

class NewCollectionAction extends Action2 {

	constructor() {
		super({
			id: NEW_COLLECTION_COMMAND_ID,
			title: localize2('newCollection', "New Collection..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: COLLECTIONS_ENABLED_CONTEXT,
		});
	}

	override run(): void {
		getWorkbenchContribution<SessionCollectionsController>(SESSION_COLLECTIONS_CONTROLLER_ID).showNewCollectionEditor();
	}
}

class EditCollectionAction extends Action2 {

	constructor() {
		super({
			id: EDIT_COLLECTION_COMMAND_ID,
			title: localize2('editCollection', "Edit Collection..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: COLLECTIONS_ENABLED_CONTEXT,
		});
	}

	override run(_accessor: ServicesAccessor, collectionId: string | undefined): void {
		getWorkbenchContribution<SessionCollectionsController>(SESSION_COLLECTIONS_CONTROLLER_ID).showEditCollectionEditor(collectionId);
	}
}

function registerSwitchToIndexAction(index: number): void {
	registerAction2(class SwitchCollectionToIndexAction extends Action2 {
		constructor() {
			super({
				id: `${SWITCH_COLLECTION_TO_INDEX_COMMAND_PREFIX}${index}`,
				title: localize2('switchCollectionToIndex', "Switch to Collection {0}", index),
				category: SessionsCategories.Sessions,
				precondition: MULTIPLE_COLLECTIONS_CONTEXT,
				keybinding: {
					// Wins over Open Editor at Index on the same keys, except while an editor has focus.
					weight: KeybindingWeight.WorkbenchContrib + 1,
					primary: KeyMod.Alt | (KeyCode.Digit0 + index),
					mac: { primary: KeyMod.WinCtrl | (KeyCode.Digit0 + index) },
					when: ContextKeyExpr.and(MULTIPLE_COLLECTIONS_CONTEXT, EditorAreaFocusContext.negate()),
				},
			});
		}

		override async run(): Promise<void> {
			await getWorkbenchContribution<SessionCollectionsController>(SESSION_COLLECTIONS_CONTROLLER_ID).switchToIndex(index - 1);
		}
	});
}

registerAction2(TitleBarCollectionsAction);
registerAction2(SwitchCollectionAction);
registerAction2(NewCollectionAction);
registerAction2(EditCollectionAction);
for (let index = 1; index <= 9; index++) {
	registerSwitchToIndexAction(index);
}

export class SessionCollectionsAttentionModel extends Disposable {

	private readonly sessionsChanged: IObservable<void>;

	constructor(
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this.sessionsChanged = observableSignalFromEvent(this, Event.any(this.sessionsManagementService.onDidChangeSessions, this.collectionsService.onDidChangeMembership));
	}

	getAttention(collectionId: string, reader?: IReader): SessionCollectionAttention {
		this.sessionsChanged.read(reader);
		let hasUnread = false;
		for (const session of this.sessionsManagementService.getSessions()) {
			if (session.isArchived.read(reader) || this.collectionsService.getSessionCollection(session, reader) !== collectionId) {
				continue;
			}
			if (session.status.read(reader) === SessionStatus.NeedsInput) {
				return SessionCollectionAttention.NeedsInput;
			}
			hasUnread ||= !session.isRead.read(reader);
		}
		return hasUnread ? SessionCollectionAttention.Unread : SessionCollectionAttention.None;
	}
}

class SessionCollectionsTitleBarActionViewItem extends BaseActionViewItem {

	private readonly widgetStore = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		private readonly delegate: ISessionCollectionsSwitcherDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (!this.element) {
			return;
		}
		const store = this.widgetStore.value = new DisposableStore();
		const host = DOM.append(this.element, DOM.$('div.session-collections-titlebar-host'));
		store.add(toDisposable(() => host.remove()));
		store.add(this.instantiationService.createInstance(SessionCollectionsIconStrip, host, this.delegate));
	}
}

export class SessionCollectionsController extends Disposable implements IWorkbenchContribution, ISessionCollectionsSwitcherDelegate {

	static readonly ID = SESSION_COLLECTIONS_CONTROLLER_ID;

	private readonly hasMultipleCollectionsContext: IContextKey<boolean>;
	private readonly collectionsEnabled: IObservable<boolean>;
	private readonly attentionModel: SessionCollectionsAttentionModel;
	private readonly collectionAnchors = new Map<string, Set<HTMLElement>>();
	private readonly headerEditors = this._register(new MutableDisposable<SessionHeaderEditors>());
	private switchRequest = 0;
	private pendingSwitchRequest: number | undefined;
	private lastFollowedSessionId: string | undefined;
	private lastActiveWasDraft = false;

	private readonly sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	private readonly headerTransfer = LocalSelectionTransfer.getInstance<DraggedSessionListHeaderIdentifier>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.collectionsEnabled = observableConfigValue<boolean>(SESSIONS_LIST_COLLECTIONS_SETTING, false, this.configurationService);
		this.hasMultipleCollectionsContext = SessionsHasMultipleCollectionsContext.bindTo(contextKeyService);
		this.attentionModel = this._register(this.instantiationService.createInstance(SessionCollectionsAttentionModel));

		this._register(autorun(reader => {
			this.hasMultipleCollectionsContext.set(this.collectionsEnabled.read(reader) && this.collectionsService.collections.read(reader).length > 1);
		}));
		this._register(autorun(reader => {
			if (!this.collectionsEnabled.read(reader)) {
				return;
			}
			const activeSession = this.sessionsService.activeSession.read(reader);
			activeSession?.status.read(reader);
			this.followActiveSession(activeSession);
		}));

		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.TitleBarLeftLayout, TITLE_BAR_COLLECTIONS_COMMAND_ID, (action, _options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionCollectionsTitleBarActionViewItem, action, this);
		}, onDidRegister.event));
		onDidRegister.fire();
	}

	async switchTo(collectionId: string | undefined): Promise<void> {
		if (!this.collectionsEnabled.get()) {
			this.logService.warn('[SessionCollectionsController] Ignored collection switch while collections are disabled.');
			return;
		}
		if (!collectionId || !this.collectionsService.getCollection(collectionId)) {
			this.logService.warn(`[SessionCollectionsController] Ignored collection switch for unknown collection '${collectionId ?? ''}'.`);
			return;
		}

		const request = ++this.switchRequest;
		this.pendingSwitchRequest = request;
		this.collectionsService.setActiveCollection(collectionId);
		try {
			const activeSession = this.sessionsService.activeSession.get();
			if (this.isCommittedKnownSession(activeSession) && this.collectionsService.getSessionCollection(activeSession) === collectionId) {
				this.recordActiveSessionIfInCollection(collectionId);
				return;
			}

			const remembered = this.getRememberedSession(collectionId);
			if (remembered) {
				await this.sessionsService.openSession(remembered.resource, { source: 'sessionsList' });
			} else {
				await this.sessionsService.openNewSession();
			}
			if (request !== this.switchRequest) {
				return;
			}
			this.recordActiveSessionIfInCollection(collectionId);
		} finally {
			if (this.pendingSwitchRequest === request) {
				this.pendingSwitchRequest = undefined;
			}
		}
	}

	async switchToIndex(index: number): Promise<void> {
		const collection = this.collectionsService.collections.get()[index];
		if (collection) {
			await this.switchTo(collection.id);
		}
	}

	switchToCollection(collectionId: string): void {
		this.switchTo(collectionId).catch(onUnexpectedError);
	}

	showNewCollectionEditor(anchor?: HTMLElement): void {
		this.showCollectionEditor(undefined, anchor);
	}

	showEditCollectionEditor(collectionId?: string, anchor?: HTMLElement): void {
		const targetCollectionId = collectionId ?? this.collectionsService.activeCollectionId.get();
		if (!this.collectionsService.getCollection(targetCollectionId)) {
			this.logService.warn(`[SessionCollectionsController] Ignored edit for unknown collection '${targetCollectionId}'.`);
			return;
		}
		this.showCollectionEditor(targetCollectionId, anchor);
	}

	showCollectionMenu(anchor: HTMLElement): void {
		const active = this.collectionsService.activeCollectionId.get();
		const collections = this.collectionsService.collections.get();
		const actions: IAction[] = collections.map((collection, index) => {
			const commandId = index < 9 ? `${SWITCH_COLLECTION_TO_INDEX_COMMAND_PREFIX}${index + 1}` : SWITCH_COLLECTION_COMMAND_ID;
			const action = new Action(commandId, collection.name, undefined, true, () => this.switchTo(collection.id));
			action.checked = collection.id === active;
			return action;
		});
		actions.push(new Separator());
		actions.push(new Action(NEW_COLLECTION_COMMAND_ID, localize('newCollectionMenu', "New Collection..."), undefined, true, () => this.showNewCollectionEditor(anchor)));
		actions.push(new Action(EDIT_COLLECTION_COMMAND_ID, localize('editCollectionMenu', "Edit Collection..."), undefined, true, () => this.showEditCollectionEditor(active, anchor)));
		this.contextMenuForAnchor(anchor, actions, action => {
			return this.keybindingService.lookupKeybinding(action.id) ?? undefined;
		});
	}

	getCollectionAttention(collectionId: string, reader?: IReader): SessionCollectionAttention {
		return this.attentionModel.getAttention(collectionId, reader);
	}

	getCollectionKeybindingLabel(index: number): string | undefined {
		return index < 9 ? this.keybindingService.lookupKeybinding(`${SWITCH_COLLECTION_TO_INDEX_COMMAND_PREFIX}${index + 1}`)?.getLabel() ?? undefined : undefined;
	}

	getCollectionKeybindingAriaLabel(index: number): string | undefined {
		return index < 9 ? this.keybindingService.lookupKeybinding(`${SWITCH_COLLECTION_TO_INDEX_COMMAND_PREFIX}${index + 1}`)?.getAriaLabel() ?? undefined : undefined;
	}

	registerCollectionAnchor(collectionId: string, element: HTMLElement): IDisposable {
		let elements = this.collectionAnchors.get(collectionId);
		if (!elements) {
			elements = new Set();
			this.collectionAnchors.set(collectionId, elements);
		}
		elements.add(element);
		return toDisposable(() => {
			elements?.delete(element);
			if (elements?.size === 0) {
				this.collectionAnchors.delete(collectionId);
			}
		});
	}

	hasDraggedCollectionItems(): boolean {
		return this.sessionTransfer.hasData(DraggedSessionIdentifier.prototype) || this.headerTransfer.hasData(DraggedSessionListHeaderIdentifier.prototype);
	}

	moveDraggedItemsToCollection(collectionId: string): boolean {
		if (collectionId === this.collectionsService.activeCollectionId.get() || !this.collectionsService.getCollection(collectionId)) {
			return false;
		}

		const sessionIdentifiers = this.sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		const headerIdentifiers = this.headerTransfer.getData(DraggedSessionListHeaderIdentifier.prototype);
		let undo: (() => void) | undefined;
		let label: string | undefined;
		if (sessionIdentifiers?.length) {
			const sessions = sessionIdentifiers.map(identifier => this.sessionsManagementService.getSession(identifier.resource)).filter((session): session is ISession => !!session);
			if (sessions.length === 0) {
				return false;
			}
			undo = this.collectionsService.moveSessionsToCollection(sessions, collectionId);
			label = sessions.length === 1 ? sessions[0].title.get() : localize('sessionsMovedLabel', "{0} Sessions", sessions.length);
		} else if (headerIdentifiers?.length) {
			const [header] = headerIdentifiers;
			const sessions = header.sessionResources.map(resource => this.sessionsManagementService.getSession(resource)).filter((session): session is ISession => !!session);
			undo = header.kind === 'group'
				? this.collectionsService.moveGroupToCollection(header.id, collectionId)
				: this.collectionsService.moveWorkspaceToCollection(header.id, collectionId, sessions);
			label = header.label;
		}

		if (!undo || !label) {
			return false;
		}

		const target = this.collectionsService.getCollection(collectionId);
		if (!target) {
			return false;
		}
		this.showUndoNotification(
			localize('movedToCollection', "Moved {0} to {1}", label, target.name),
			undo,
			localize('moveUndoHelp', "Undo moves the item back to its previous collection."),
		);
		return true;
	}

	private contextMenuForAnchor(anchor: HTMLElement, actions: readonly IAction[], getKeyBinding: NonNullable<IContextMenuDelegate['getKeyBinding']>): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [...actions],
			getKeyBinding: (action: IAction): ResolvedKeybinding | undefined => getKeyBinding(action),
		});
	}

	private showCollectionEditor(collectionId: string | undefined, anchor: HTMLElement | undefined): void {
		const editor = this.getHeaderEditors();
		editor.showCollectionEditor({
			anchor: anchor ?? this.getEditorAnchor(collectionId),
			collectionId,
			onDidCommit: (message, undo) => this.showUndoNotification(message, undo, localize('collectionUndoHelp', "Undo restores the previous collection settings.")),
		});
	}

	private getHeaderEditors(): SessionHeaderEditors {
		if (!this.headerEditors.value) {
			this.headerEditors.value = this.instantiationService.createInstance(SessionHeaderEditors);
		}
		return this.headerEditors.value;
	}

	private getEditorAnchor(collectionId: string | undefined): HTMLElement | { readonly x: number; readonly y: number } {
		const anchor = collectionId ? this.getVisibleAnchor(collectionId) : undefined;
		if (anchor) {
			return anchor;
		}
		return this.layoutService.getContainer(mainWindow, Parts.SIDEBAR_PART) ?? this.layoutService.getContainer(mainWindow);
	}

	private getVisibleAnchor(collectionId: string): HTMLElement | undefined {
		const elements = this.collectionAnchors.get(collectionId);
		if (!elements) {
			return undefined;
		}
		for (const element of elements) {
			if (element.isConnected && element.getClientRects().length > 0) {
				return element;
			}
		}
		return undefined;
	}

	private getRememberedSession(collectionId: string): ISession | undefined {
		const resource = this.collectionsService.getLastSession(collectionId);
		const session = resource ? this.sessionsManagementService.getSession(resource) : undefined;
		if (!session || session.status.get() === SessionStatus.Untitled || session.isArchived.get() || this.collectionsService.getSessionCollection(session) !== collectionId) {
			return undefined;
		}
		return session;
	}

	private isCommittedKnownSession(session: IActiveSession | undefined): session is IActiveSession {
		const known = session ? this.sessionsManagementService.getSession(session.resource) : undefined;
		return !!session && session.status.get() !== SessionStatus.Untitled && known?.sessionId === session.sessionId;
	}

	private followActiveSession(activeSession: IActiveSession | undefined): void {
		const previousWasDraft = this.lastActiveWasDraft;
		this.lastActiveWasDraft = !!activeSession && activeSession.status.get() === SessionStatus.Untitled;
		if (this.pendingSwitchRequest !== undefined || !this.isCommittedKnownSession(activeSession)) {
			return;
		}
		// Only activating a session follows it; reassigning the open session keeps the current collection.
		const isNewlyActive = this.lastFollowedSessionId !== activeSession.sessionId;
		this.lastFollowedSessionId = activeSession.sessionId;
		const collectionId = this.collectionsService.getSessionCollection(activeSession);
		const activeCollectionId = this.collectionsService.activeCollectionId.get();
		if (collectionId !== activeCollectionId) {
			// A draft that was just sent stays in the collection it was composed in.
			if (!isNewlyActive || previousWasDraft) {
				return;
			}
			this.collectionsService.setActiveCollection(collectionId);
		}
		this.collectionsService.setLastSession(collectionId, activeSession.resource);
	}

	private recordActiveSessionIfInCollection(collectionId: string): void {
		const activeSession = this.sessionsService.activeSession.get();
		if (this.isCommittedKnownSession(activeSession)) {
			this.lastFollowedSessionId = activeSession.sessionId;
			if (this.collectionsService.getSessionCollection(activeSession) === collectionId) {
				this.collectionsService.setLastSession(collectionId, activeSession.resource);
			}
		}
	}

	private showUndoNotification(message: string, undo: () => void | Promise<void>, help: string): void {
		const view = this.viewsService.getViewWithId<SessionsView>(SessionsViewId);
		if (!view) {
			this.logService.warn('[SessionCollectionsController] Unable to show collection undo notification because the Sessions view is not available.');
			return;
		}
		view.showUndoNotification(message, undo, localize('collectionNotificationHelp', "{0}\n{1} Use Tab and Shift+Tab to reach Undo and Dismiss. Press Enter or Space to activate them, or Escape to dismiss the notice.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open. The bar along the bottom shows the remaining time.", message, help));
	}
}
