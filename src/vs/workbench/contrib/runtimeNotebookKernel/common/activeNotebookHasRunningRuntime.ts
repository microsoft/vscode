/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { LanguageRuntimeSessionMode, RuntimeState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { isNotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';

/** Whether the active notebook has a running runtime. */
export const ActiveNotebookHasRunningRuntime = new RawContextKey<boolean>(
	'notebookHasRunningInterpreter',
	false,
	localize('notebookHasRunningInterpreter', 'Whether the active notebook has a running interpreter.'),
);

/** Manages the {@link ActiveNotebookHasRunningRuntime} context. */
export class ActiveNotebookHasRunningRuntimeManager extends Disposable {

	/** The bound context. */
	public readonly context: IContextKey<boolean>;

	private readonly _disposablesBySessionId = new Map<string, DisposableStore>();

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IEditorService private readonly _editorService: IEditorService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
	) {
		super();

		// Bind the context.
		this.context = ActiveNotebookHasRunningRuntime.bindTo(this._contextKeyService);

		// Attach to new sessions.
		this._register(this._runtimeSessionService.onDidStartRuntime(session => {
			this.attachSession(session);
		}));

		// Attach to existing sessions.
		for (const session of this._runtimeSessionService.activeSessions) {
			this.attachSession(session);
		}

		// Update the context when the active editor changes.
		this._register(this._editorService.onDidActiveEditorChange(() => {
			this.handleActiveEditorChange();
		}));

		// Update the context given the current active editor.
		this.handleActiveEditorChange();
	}

	/** Attach to a language runtime session. */
	private attachSession(session: ILanguageRuntimeSession): void {
		const { notebookUri, sessionMode } = session.metadata;
		if (sessionMode !== LanguageRuntimeSessionMode.Notebook || !notebookUri) {
			// Ignore non-notebook sessions.
			return;
		}

		const oldDisposables = this._disposablesBySessionId.get(session.metadata.sessionId);
		if (oldDisposables) {
			oldDisposables.dispose();
		}

		const disposables = this._register(new DisposableStore());
		this._disposablesBySessionId.set(session.metadata.sessionId, disposables);

		// Update the context when the session state changes.
		disposables.add(session.onDidChangeRuntimeState(state => {
			if (state === RuntimeState.Ready) {
				// The session became ready, enable the context.
				this.updateContextIfNotebookUriIsActive(true, notebookUri);
			} else if (state === RuntimeState.Exited ||
				state === RuntimeState.Exiting ||
				state === RuntimeState.Restarting ||
				state === RuntimeState.Uninitialized) {
				// The session has entered an exiting/exited state, disable the context.
				this.updateContextIfNotebookUriIsActive(false, notebookUri);
			}
		}));

		// Disable the context when the session ends.
		disposables.add(session.onDidEndSession(() => {
			this.updateContextIfNotebookUriIsActive(false, notebookUri);
		}));

		// The session has just started, initially enable the context.
		this.updateContextIfNotebookUriIsActive(true, notebookUri);
	}

	/** Update the context given the current active editor. */
	private handleActiveEditorChange(): void {
		const activeEditor = this._editorService.activeEditor;
		if (isNotebookEditorInput(activeEditor)) {
			// Changed to a notebook editor, check if it has a running session.
			const session = this._runtimeSessionService.getNotebookSessionForNotebookUri(activeEditor.resource);
			this.context.set(Boolean(session));
		} else {
			// Changed to a non-notebook editor, disable the context.
			this.context.set(false);
		}
	}

	/** Update the context if a given notebookUri is the active editor. */
	private updateContextIfNotebookUriIsActive(value: boolean, notebookUri: URI): void {
		const activeEditor = this._editorService.activeEditor;
		if (isNotebookEditorInput(activeEditor) &&
			isEqual(activeEditor.resource, notebookUri)) {
			this.context.set(value);
		}
	}
}

