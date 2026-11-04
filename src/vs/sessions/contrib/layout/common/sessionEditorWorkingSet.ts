/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';

/**
 * The layout owner of an editor working set: a whole session, or a single chat of
 * it when the window scopes layout to chats.
 */
export interface ISessionEditorWorkingSetOwner {
	readonly sessionResource: URI;
	/** The owning chat, or `undefined` when the working set belongs to the whole session. */
	readonly chatResource: URI | undefined;
}

/** Whether the given chat of a session belongs to `owner`'s editor working set. */
export function editorWorkingSetOwnerIncludes(owner: ISessionEditorWorkingSetOwner, sessionResource: URI, chatResource: URI): boolean {
	return isEqual(owner.sessionResource, sessionResource) && (owner.chatResource === undefined || isEqual(owner.chatResource, chatResource));
}

export interface ISessionEditorWorkingSetRestoreState {
	/** The owner whose working set was restored most recently, or `undefined` for an empty working set. */
	readonly owner: ISessionEditorWorkingSetOwner | undefined;
	/**
	 * Whether a restore is queued or running. A restore replaces every open editor, so owners of
	 * editors that a working set cannot serialize close them when it begins and reopen them once it settles.
	 */
	readonly restoring: boolean;
	/** Whether the queued restore is currently replacing the editor working set. */
	readonly applying: boolean;
}

export const ISessionEditorWorkingSetService = createDecorator<ISessionEditorWorkingSetService>('sessionEditorWorkingSetService');

/**
 * Publishes the editor working-set restores that the session layout performs when the user
 * switches sessions or chats, so editors that a working set cannot serialize can follow it.
 */
export interface ISessionEditorWorkingSetService {
	readonly _serviceBrand: undefined;

	readonly restoreState: IObservable<ISessionEditorWorkingSetRestoreState>;

	/** Publishes a settled owner when changing to it does not require applying a working set. */
	setCurrentOwner(owner: ISessionEditorWorkingSetOwner | undefined): void;

	/**
	 * Registers a live editor whose state cannot be reconstructed after a
	 * presentation-only Details collapse. Working-set transitions still close it
	 * through its owning service; the layout only retains it while hiding Editor.
	 */
	registerEditorToRetain(input: EditorInput): IDisposable;

	/** Whether a Details-only collapse must leave `input` alive in the hidden editor group. */
	shouldRetainEditor(input: EditorInput): boolean;

	/**
	 * Marks the current queued owner as actively applying. Returns `false` when
	 * the restore was superseded before it reached the sequencer.
	 */
	beginApply(owner: ISessionEditorWorkingSetOwner | undefined): boolean;

	/**
	 * Marks a restore of `owner`'s working set until the returned handle is disposed. Restores
	 * may overlap; the owner of the most recent one is reported once all of them settle.
	 */
	beginRestore(owner: ISessionEditorWorkingSetOwner | undefined): IDisposable;
}

export class SessionEditorWorkingSetService implements ISessionEditorWorkingSetService {

	declare readonly _serviceBrand: undefined;

	private readonly _restoreState = observableValue<ISessionEditorWorkingSetRestoreState>(this, Object.freeze({ owner: undefined, restoring: false, applying: false }));
	readonly restoreState: IObservable<ISessionEditorWorkingSetRestoreState> = this._restoreState;

	private _pendingRestores = 0;
	private readonly _editorsToRetain = new Set<EditorInput>();

	setCurrentOwner(owner: ISessionEditorWorkingSetOwner | undefined): void {
		this._restoreState.set(Object.freeze({ owner, restoring: this._pendingRestores !== 0, applying: false }), undefined);
	}

	registerEditorToRetain(input: EditorInput): IDisposable {
		this._editorsToRetain.add(input);
		return toDisposable(() => this._editorsToRetain.delete(input));
	}

	shouldRetainEditor(input: EditorInput): boolean {
		return this._editorsToRetain.has(input);
	}

	beginApply(owner: ISessionEditorWorkingSetOwner | undefined): boolean {
		const state = this._restoreState.get();
		if (!state.restoring || !editorWorkingSetOwnersEqual(state.owner, owner)) {
			return false;
		}
		if (!state.applying) {
			this._restoreState.set(Object.freeze({ owner, restoring: true, applying: true }), undefined);
		}
		return true;
	}

	beginRestore(owner: ISessionEditorWorkingSetOwner | undefined): IDisposable {
		this._pendingRestores++;
		this._restoreState.set(Object.freeze({ owner, restoring: true, applying: false }), undefined);
		let settled = false;
		return toDisposable(() => {
			if (settled) {
				return;
			}
			settled = true;
			if (--this._pendingRestores === 0) {
				this._restoreState.set(Object.freeze({ owner: this._restoreState.get().owner, restoring: false, applying: false }), undefined);
			}
		});
	}
}

function editorWorkingSetOwnersEqual(a: ISessionEditorWorkingSetOwner | undefined, b: ISessionEditorWorkingSetOwner | undefined): boolean {
	return isEqual(a?.sessionResource, b?.sessionResource) && isEqual(a?.chatResource, b?.chatResource);
}
