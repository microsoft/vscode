/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN && !handlers.isClosing()) {
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
 * Shows only the chat of a chat window that opened with no editor in its main part, as it does once its last editor
 * closes: when it would show only its main part, such as when none of the editors it showed could be restored, and when
 * its chat shows in a chat window for the first time, with no editor to bring along. The chat keeps what is remembered
 * for it, so that a mode the user chooses for it shows again.
 *
 * @param firstOpen whether no layout is remembered for the chat.
 * @returns whether it showed only the chat.
 */
export function showChatInsteadOfEmptyMainPart(part: Pick<IEditorPart, 'groups'>, window: { readonly layoutMode: IObservable<ChatWindowLayoutMode>; showChatOnly(): void }, firstOpen: boolean): boolean {
	const mode = window.layoutMode.get();
	if (mode === ChatWindowLayoutMode.ChatOnly || (mode !== ChatWindowLayoutMode.EditorOnly && !firstOpen) || part.groups.some(group => !group.isEmpty)) {
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
 * Binds whether the parts of a chat window show, as the main window binds it for its own editor area, so that the editors
 * in them show their title actions and can close as in the main window's: on the window's context, its parts show as the
 * window shows them, whether the main window's editor area shows or not, such as the part holding its terminals, which
 * shows also while only the chat shows; on its main part's own context, the main part shows as the window's mode says.
 */
export function bindChatWindowPartsVisible(windowContextKeyService: IContextKeyService, mainPartContextKeyService: IContextKeyService, layoutMode: IObservable<ChatWindowLayoutMode>): IDisposable {
	const partsVisible = MainEditorAreaVisibleContext.bindTo(windowContextKeyService);
	partsVisible.set(true);
	const mainPartVisible = MainEditorAreaVisibleContext.bindTo(mainPartContextKeyService);
	const binding = autorun(reader => mainPartVisible.set(layoutMode.read(reader) !== ChatWindowLayoutMode.ChatOnly));
	return toDisposable(() => {
		binding.dispose();
		mainPartVisible.reset();
		partsVisible.reset();
	});
}
