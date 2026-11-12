/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MainEditorAreaVisibleContext } from '../../../common/contextkeys.js';
import { EditorCloseContext, EditorsOrder, GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode } from '../common/chatWindowLayout.js';

/**
 * Follows the editors of a chat window's main part: `onDidOpenEditor` when an editor opens in it, and
 * `onDidCloseLastEditor` once its last editor closed, but not when that editor moved, or while the window closes.
 */
export function trackMainPartEditors(part: Pick<IEditorPart, 'groups' | 'onDidAddGroup' | 'onDidRemoveGroup'>, handlers: { onDidOpenEditor(editor: EditorInput | undefined): void; onDidCloseLastEditor(): void; isClosing(): boolean }): IDisposable {
	const store = new DisposableStore();
	const groups = store.add(new DisposableStore());
	const isEmpty = () => part.groups.every(group => group.isEmpty);
	const track = () => {
		groups.clear();
		for (const group of part.groups) {
			groups.add(group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN && !handlers.isClosing()) {
					handlers.onDidOpenEditor(e.editor);
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
 * closes: when none of the editors it showed could be restored, and when its chat shows in a chat window for the first
 * time, with no editor to bring along. The chat keeps what is remembered for it, so that a mode the user chooses for it
 * shows again, and the first editor that opens shows the main part as remembered.
 *
 * @returns whether it showed only the chat.
 */
export function showChatInsteadOfEmptyMainPart(part: Pick<IEditorPart, 'groups'>, window: { readonly layoutMode: IObservable<ChatWindowLayoutMode>; showChatOnly(): void }): boolean {
	if (window.layoutMode.get() === ChatWindowLayoutMode.ChatOnly || part.groups.some(group => !group.isEmpty)) {
		return false;
	}
	window.showChatOnly();
	return true;
}

/**
 * An editor that {@link moveEditorsToChatWindow} moved, the group it came from, whether it was that group's active editor,
 * and whether the target showed it already: then the move left the target's tab as it was and only closed the source's.
 */
export interface IMovedChatWindowEditor {
	readonly editor: EditorInput;
	readonly from: IEditorGroup;
	readonly wasActive: boolean;
	readonly inTargetBefore: boolean;
}

/** What {@link moveEditorsToChatWindow} moved, and the editor its target showed as active before. */
export interface IChatWindowEditorTransfer {
	readonly editors: readonly IMovedChatWindowEditor[];
	readonly targetActive: EditorInput | undefined;
}

/**
 * Moves the editors of `groups` to `target`, keeping the active one active. An editor that cannot move there, such as
 * one that shows only in the main window, stays where it is, without the error its group shows for a move it vetoes.
 * Returns the editors it moved, which {@link moveEditorsBackFromChatWindow} can put back.
 */
export function moveEditorsToChatWindow(groups: readonly IEditorGroup[], target: IEditorGroup): IChatWindowEditorTransfer {
	const targetActive = target.activeEditor ?? undefined;
	const moved: IMovedChatWindowEditor[] = [];
	let active: { readonly group: IEditorGroup; readonly editor: NonNullable<IEditorGroup['activeEditor']> } | undefined;
	for (const group of groups) {
		if (group === target) {
			continue;
		}
		const groupActive = group.activeEditor;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL).filter(editor => editor.canMove(group.id, target.id) === true);
		if (!active && groupActive && editors.includes(groupActive)) {
			active = { group, editor: groupActive };
		}
		if (editors.length) {
			// A group opens an editor that matches one it shows as that one, rather than as another tab
			const inTargetBefore = new Set(editors.filter(editor => target.contains(editor)));
			group.moveEditors(editors.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active?.editor } })), target);
			moved.push(...editors
				.filter(editor => !group.contains(editor, { strictEquals: true }) && target.contains(editor))
				.map(editor => ({ editor, from: group, wasActive: editor === groupActive, inTargetBefore: inTargetBefore.has(editor) })));
		}
	}
	if (active && target.contains(active.editor)) {
		void target.openEditor(active.editor, { preserveFocus: true });
	}
	return { editors: moved, targetActive };
}

/**
 * Puts the editors that {@link moveEditorsToChatWindow} moved into `target` back: each into the group it came from, or
 * into `fallback` if that group is gone, the one that was active there active again. One the target showed already is
 * copied back, so that the target keeps its tab. One no longer in `target`, such as one the user closed or moved
 * meanwhile, stays where it is. The target shows the editor it showed as active before again.
 */
export function moveEditorsBackFromChatWindow(transfer: IChatWindowEditorTransfer, target: IEditorGroup, fallback: () => IEditorGroup, exists: (group: IEditorGroup) => boolean): void {
	const targetEditors = target.getEditors(EditorsOrder.SEQUENTIAL);
	const byGroup = new Map<IEditorGroup, { readonly editor: EditorInput; readonly entry: IMovedChatWindowEditor }[]>();
	for (const entry of transfer.editors) {
		// The editor as the target shows it: the one that moved, or, if it showed it already, its own, which matches it
		const editor = targetEditors.find(candidate => entry.inTargetBefore ? candidate.matches(entry.editor) : candidate === entry.editor);
		const to = editor && (exists(entry.from) ? entry.from : fallback());
		if (!editor || !to || to === target) {
			continue;
		}
		byGroup.set(to, [...byGroup.get(to) ?? [], { editor, entry }]);
	}
	for (const [to, entries] of byGroup) {
		const options = (entry: IMovedChatWindowEditor) => ({ pinned: true, preserveFocus: true, inactive: !entry.wasActive });
		const copies = entries.filter(({ entry }) => entry.inTargetBefore);
		const moves = entries.filter(({ entry }) => !entry.inTargetBefore);
		if (moves.length) {
			target.moveEditors(moves.map(({ editor, entry }) => ({ editor, options: options(entry) })), to);
		}
		if (copies.length) {
			target.copyEditors(copies.map(({ editor, entry }) => ({ editor, options: options(entry) })), to);
		}
		const active = entries.find(({ entry }) => entry.wasActive)?.editor;
		const shown = active && to.getEditors(EditorsOrder.SEQUENTIAL).find(candidate => candidate.matches(active));
		if (shown) {
			void to.openEditor(shown, { preserveFocus: true });
		}
	}
	if (transfer.targetActive && target.contains(transfer.targetActive, { strictEquals: true })) {
		void target.openEditor(transfer.targetActive, { preserveFocus: true });
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
