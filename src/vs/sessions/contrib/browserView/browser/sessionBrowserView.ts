/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { getFocusedSessionChatSource, IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { runOnChange } from '../../../../base/common/observable.js';

export class SessionBrowserViewController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionBrowserViewController';

	/**
	 * Tracks browser view inputs with the session they were first opened in. The
	 * DisposableMap cleans up lifecycle listeners on deletion/disposal.
	 */
	private readonly _trackedInputs = this._register(new DisposableMap<string, { session: ISession; dispose: () => void }>());

	constructor(
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();

		// Catch editors opened via normal user/tool actions.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (e.editor instanceof BrowserEditorInput) {
				this._attachLifecycle(e.editor);
			}
		}));

		// Catch editors restored from a working set swap — onWillOpenEditor
		// does not fire for deserialized editors, but onDidAddGroup fires
		// after the group (with its editors) has been created.
		this._register(this._editorGroupsService.onDidAddGroup(group => {
			for (const editor of group.editors) {
				if (editor instanceof BrowserEditorInput) {
					this._attachLifecycle(editor);
				}
			}
		}));

		// Restrict the window's contextual browser views to those owned by the
		// active session (or those with no known owning session).
		const onDidChangeActiveSession = this._register(new Emitter<void>());
		this._register(runOnChange(getFocusedSessionChatSource(this._focusedSessionHostService).session, () => onDidChangeActiveSession.fire()));
		this._register(this._browserViewService.registerContextualFilter({
			include: (input, context) => {
				const tracked = this._trackedInputs.get(input.id);
				const ownerId = input.model?.owner.type === 'agent' ? input.model.owner.sessionId : tracked?.session.resource.toString();
				if (!ownerId) {
					return true; // no owning session known
				}
				const owningSession = resolveBrowserOwnerSession(this._sessionManagementService, ownerId)?.session ?? tracked?.session;
				if (!owningSession) {
					return true; // owning chat/session no longer known; don't hide it
				}
				const activeSession = context.activeSessionId ? resolveBrowserOwnerSession(this._sessionManagementService, context.activeSessionId)?.session : this._focusedSessionHostService.focusedHost.read(undefined).session.read(undefined);
				return activeSession?.sessionId === owningSession.sessionId;
			},
			onDidChange: onDidChangeActiveSession.event,
		}));

		// Only open a browser tab automatically when its owning session is the active session.
		this._register(this._browserViewService.registerOpenHandler({
			shouldOpenEditor: (_input, owner) => {
				if (owner.type !== 'agent') {
					return true; // no owning session known; open in the active session
				}
				const owningSession = resolveBrowserOwnerSession(this._sessionManagementService, owner.sessionId)?.session;
				if (!owningSession) {
					return true; // owning chat/session no longer known; open in the active session
				}
				const activeSession = this._focusedSessionHostService.focusedHost.read(undefined).session.read(undefined);
				return owningSession.sessionId === activeSession?.sessionId;
			},
		}));

		// Force-destroy browser views when their owning session is archived or removed.
		this._register(this._sessionManagementService.onDidChangeSessions(e => {
			const archived = e.changed.filter(session => session.isArchived.get());
			if (e.removed.length === 0 && archived.length === 0) {
				return;
			}

			for (const input of [...this._browserViewService.getKnownBrowserViews().values()]) {
				// Other pages close as the session they were opened in gets archived, see `_attachLifecycle`
				const closedSessions = input.model?.owner.type === 'agent' ? [...e.removed, ...archived] : e.removed;
				const owningSession = this._getOwningSession(input, e.removed);
				if (owningSession && closedSessions.some(session => session.sessionId === owningSession.sessionId)) {
					input.dispose(true);
				}
			}
		}));
	}

	/**
	 * The session that owns a browser view: for a page that an agent opened, the session of the agent's chat, also
	 * when the page never had an editor in this window, such as when it was opened in the background or re-adopted
	 * after a window reload. Otherwise, the session the page was first opened in.
	 */
	private _getOwningSession(input: BrowserEditorInput, removedSessions: readonly ISession[]): ISession | undefined {
		const owner = input.model?.owner;
		const agentOwner = owner?.type === 'agent' ? resolveBrowserOwnerSession(this._sessionManagementService, owner.sessionId) : undefined;
		// A removed session is no longer known, so its chats are matched directly
		return agentOwner?.session
			?? (agentOwner && removedSessions.find(session => isChatOfSession(session, agentOwner.resource)))
			?? this._trackedInputs.get(input.id)?.session;
	}

	private _attachLifecycle(input: BrowserEditorInput): void {
		if (this._trackedInputs.has(input.id)) {
			return;
		}

		const session = this._focusedSessionHostService.focusedHost.read(undefined).session.read(undefined);
		if (!session) {
			return; // no session, no lifecycle management needed
		}

		const store = new DisposableStore();
		this._trackedInputs.set(input.id, { session, dispose: () => store.dispose() });

		// When the session is archived, force-dispose the browser view, unless an agent opened it: the page then belongs
		// to the session of the agent, whatever session it was opened in.
		store.add(runOnChange(session.isArchived, (isArchived) => {
			if (isArchived && input.model?.owner.type !== 'agent') {
				input.dispose(true);
			}
		}));

		store.add(input.onBeforeDispose(e => {
			const activeSession = this._focusedSessionHostService.focusedHost.read(undefined).session.read(undefined);

			// If the input is being disposed, but we are not currently in the owning session,
			// assume a session swap is happening and do not actually dispose the browser yet.
			if (session.sessionId !== activeSession?.sessionId) {
				e.veto();
			}
		}));

		store.add(input.onWillDispose(() => {
			store.dispose();
			this._trackedInputs.deleteAndDispose(input.id);
		}));
	}
}

/**
 * Resolves a browser view owner id (the *chat* resource string the browser
 * tools stamp onto `IBrowserViewOwner.sessionId`) to that resource and the
 * `ISession` that owns it. A session's browsers can be opened from any of its
 * chats (main, peer, or subagent), so this looks up the owning session across
 * all chats rather than comparing against the session's own resource directly.
 */
export function resolveBrowserOwnerSession(sessionsManagementService: ISessionsManagementService, ownerId: string): { readonly resource: URI; readonly session: ISession | undefined } | undefined {
	let resource: URI;
	try {
		resource = URI.parse(ownerId);
	} catch {
		return undefined;
	}
	return { resource, session: sessionsManagementService.getSessionForChatResource(resource)?.session ?? sessionsManagementService.getSession(resource) };
}

/** Whether `resource` is the resource of `session`, or of one of its chats. */
function isChatOfSession(session: ISession, resource: URI): boolean {
	return isEqual(session.resource, resource) || [session.mainChat.get(), ...session.chats.get()].some(chat => isEqual(chat.resource, resource));
}
