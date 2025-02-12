/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IModifiedFileEntry } from '../../common/chatEditingService.js';


export const ctxIsGlobalEditingSession = new RawContextKey<boolean>('chat.isGlobalEditingSession', undefined, localize('chat.ctxEditSessionIsGlobal', "The current editor is part of the global edit session"));
export const ctxHasEditorModification = new RawContextKey<boolean>('chat.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));
export const ctxHasRequestInProgress = new RawContextKey<boolean>('chat.ctxHasRequestInProgress', false, localize('chat.ctxHasRequestInProgress', "The current editor shows a file from an edit session which is still in progress"));
export const ctxReviewModeEnabled = new RawContextKey<boolean>('chat.ctxReviewModeEnabled', true, localize('chat.ctxReviewModeEnabled', "Review mode for chat changes is enabled"));

export class ChatEditingEditorContextKeys implements IWorkbenchContribution {

	static readonly ID = 'chat.edits.editorContextKeys';

	private readonly _store = new DisposableStore();

	constructor(
		@IChatEditingService chatEditingService: IChatEditingService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
	) {

		const editorGroupCtx = this._store.add(new DisposableMap<IEditorGroup>());

		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups);


		this._store.add(autorun(r => {

			const toDispose = new Set(editorGroupCtx.keys());

			for (const group of editorGroups.read(r)) {

				toDispose.delete(group);

				if (editorGroupCtx.has(group)) {
					continue;
				}

				editorGroupCtx.set(group, new ContextKeyGroup(group, chatEditingService));
			}

			for (const item of toDispose) {
				editorGroupCtx.deleteAndDispose(item);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

}


class ContextKeyGroup {

	private readonly _ctxIsGlobalEditingSession: IContextKey<boolean>;
	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly _ctxHasRequestInProgress: IContextKey<boolean>;
	private readonly _ctxReviewModeEnabled: IContextKey<boolean>;

	private readonly _store = new DisposableStore();

	constructor(
		group: IEditorGroup,
		chatEditingService: IChatEditingService
	) {

		this._ctxIsGlobalEditingSession = ctxIsGlobalEditingSession.bindTo(group.scopedContextKeyService);
		this._ctxHasEditorModification = ctxHasEditorModification.bindTo(group.scopedContextKeyService);
		this._ctxHasRequestInProgress = ctxHasRequestInProgress.bindTo(group.scopedContextKeyService);
		this._ctxReviewModeEnabled = ctxReviewModeEnabled.bindTo(group.scopedContextKeyService);

		const editorObs = observableFromEvent(this, group.onDidModelChange, () => group.activeEditor);

		this._store.add(autorun(r => {

			const editor = editorObs.read(r);
			const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });

			if (!uri) {
				this._reset();
				return;
			}

			let tuple: [IChatEditingSession, IModifiedFileEntry] | undefined;
			for (const session of chatEditingService.editingSessionsObs.read(r)) {
				const entry = session.readEntry(uri, r);
				if (entry) {
					tuple = [session, entry];
					break;
				}
			}

			if (!tuple) {
				this._reset();
				return;
			}

			const [session, entry] = tuple;

			this._ctxIsGlobalEditingSession.set(session.isGlobalEditingSession);
			this._ctxHasEditorModification.set(!entry.diffInfo.read(r).identical);
			this._ctxReviewModeEnabled.set(entry.reviewMode.read(r));
			this._ctxHasRequestInProgress.set(session.state.read(r) === ChatEditingSessionState.StreamingEdits);
		}));
	}

	private _reset(): void {
		this._ctxIsGlobalEditingSession.reset();
		this._ctxHasEditorModification.reset();
		this._ctxHasRequestInProgress.reset();
		this._ctxReviewModeEnabled.reset();
	}

	dispose(): void {
		this._store.dispose();
		this._reset();
	}
}
