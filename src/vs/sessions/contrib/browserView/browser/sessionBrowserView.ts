/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { runOnChange } from '../../../../base/common/observable.js';

export class SessionBrowserViewController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionBrowserViewController';

	/**
	 * Tracks browser view inputs with their owning session. The
	 * DisposableMap cleans up lifecycle listeners on deletion/disposal.
	 */
	private readonly _trackedInputs = this._register(new DisposableMap<string, { session: ISession; dispose: () => void }>());

	constructor(
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
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
		this._register(runOnChange(this._sessionsService.activeSession, () => onDidChangeActiveSession.fire()));
		this._register(this._browserViewService.registerContextualFilter({
			include: (input, context) => {
				const tracked = this._trackedInputs.get(input.id);
				// `owner.sessionId` is the session *resource* URI string (set by the
				// browser tools from `sessionResource.toString()`), not the composite
				// `ISession.sessionId` (`providerId:resource`). Compare resource-to-resource.
				const sessionResource = input.model?.owner.sessionId ?? tracked?.session.resource.toString();
				if (!sessionResource) {
					return true; // no owning session known
				}
				const activeSessionResource = context.activeSessionId ?? this._sessionsService.activeSession.read(undefined)?.resource.toString();
				return sessionResource === activeSessionResource;
			},
			onDidChange: onDidChangeActiveSession.event,
		}));

		// Only open a browser tab automatically when its owning session is the active session.
		this._register(this._browserViewService.registerOpenHandler({
			shouldOpenEditor: (_input, owner) => {
				if (!owner.sessionId) {
					return true; // no owning session known; open in the active session
				}
				const activeSessionResource = this._sessionsService.activeSession.read(undefined)?.resource.toString();
				return owner.sessionId === activeSessionResource;
			},
		}));

		// Force-destroy browser views when sessions are removed.
		this._register(this._sessionManagementService.onDidChangeSessions(e => {
			if (e.removed.length === 0 || this._trackedInputs.size === 0) {
				return;
			}

			const removedSessionIds = new Set(e.removed.map(s => s.resource.toString()));
			const known = this._browserViewService.getKnownBrowserViews();
			for (const [id, { session }] of this._trackedInputs) {
				if (removedSessionIds.has(session.resource.toString())) {
					const existingInput = known.get(id);
					if (existingInput instanceof BrowserEditorInput) {
						existingInput.dispose(true);
					}
				}
			}
		}));
	}

	private _attachLifecycle(input: BrowserEditorInput): void {
		if (this._trackedInputs.has(input.id)) {
			return;
		}

		const session = this._sessionsService.activeSession.read(undefined);
		if (!session) {
			return; // no session, no lifecycle management needed
		}

		const store = new DisposableStore();
		this._trackedInputs.set(input.id, { session, dispose: () => store.dispose() });

		// When the owning session is archived, force-dispose the browser view.
		store.add(runOnChange(session.isArchived, (isArchived) => {
			if (isArchived) {
				input.dispose(true);
			}
		}));

		store.add(input.onBeforeDispose(e => {
			const activeSession = this._sessionsService.activeSession.read(undefined);

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
