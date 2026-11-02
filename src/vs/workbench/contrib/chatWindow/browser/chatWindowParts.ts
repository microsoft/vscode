/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MainEditorAreaVisibleContext } from '../../../common/contextkeys.js';
import { EditorCloseContext, EditorsOrder, GroupModelChangeKind } from '../../../common/editor.js';
import { IEditorGroup, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode } from '../common/chatWindowLayout.js';

/**
 * Follows the editors of a chat window's main part: `onDidOpenEditor` when an editor opens in it, and
 * `onDidCloseLastEditor` once its last editor closed, but not when that editor moved, or while the window closes.
 */
export function trackMainPartEditors(part: Pick<IEditorPart, 'groups' | 'onDidAddGroup' | 'onDidRemoveGroup'>, handlers: { onDidOpenEditor(): void; onDidCloseLastEditor(): void; isClosing(): boolean }): IDisposable {
	const store = new DisposableStore();
	const groups = store.add(new DisposableStore());
	const isEmpty = () => part.groups.every(group => group.isEmpty);
	const track = () => {
		groups.clear();
		for (const group of part.groups) {
			groups.add(group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
					handlers.onDidOpenEditor();
				}
			}));
			groups.add(group.onDidCloseEditor(e => {
				if (e.context !== EditorCloseContext.MOVE && !handlers.isClosing() && isEmpty()) {
					handlers.onDidCloseLastEditor();
				}
			}));
		}
	};
	track();
	store.add(part.onDidAddGroup(track));
	store.add(part.onDidRemoveGroup(track));
	return store;
}

/**
 * Shows the chat of a chat window that shows only its main part while no editor is in it, such as when none of the
 * editors it showed could be restored, as it does once its last editor closes. The chat keeps what is remembered for it.
 *
 * @returns whether it showed the chat.
 */
export function showChatInsteadOfEmptyMainPart(part: Pick<IEditorPart, 'groups'>, window: { readonly layoutMode: IObservable<ChatWindowLayoutMode>; showChatOnly(): void }): boolean {
	if (window.layoutMode.get() !== ChatWindowLayoutMode.EditorOnly || part.groups.some(group => !group.isEmpty)) {
		return false;
	}
	window.showChatOnly();
	return true;
}

/**
 * Moves the editors of `groups` to `target`, keeping the active one active. An editor that cannot move there, such as
 * one that shows only in the main window, stays where it is, without the error its group shows for a move it vetoes.
 */
export function moveEditorsToChatWindow(groups: readonly IEditorGroup[], target: IEditorGroup): void {
	let active: { readonly group: IEditorGroup; readonly editor: NonNullable<IEditorGroup['activeEditor']> } | undefined;
	for (const group of groups) {
		if (group === target) {
			continue;
		}
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL).filter(editor => editor.canMove(group.id, target.id) === true);
		if (!active && group.activeEditor && editors.includes(group.activeEditor)) {
			active = { group, editor: group.activeEditor };
		}
		if (editors.length) {
			group.moveEditors(editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active?.editor } })), target);
		}
	}
	if (active && target.contains(active.editor)) {
		void target.openEditor(active.editor, { preserveFocus: true });
	}
}

/**
 * Binds on the context of a chat window's main part whether it shows, as the main window binds it for its own editor
 * area, so that the editors in it show their title actions as in the main window's.
 */
export function bindMainPartVisible(contextKeyService: IContextKeyService, layoutMode: IObservable<ChatWindowLayoutMode>): IDisposable {
	const visible = MainEditorAreaVisibleContext.bindTo(contextKeyService);
	return autorun(reader => visible.set(layoutMode.read(reader) !== ChatWindowLayoutMode.ChatOnly));
}
