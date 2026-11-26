/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { EditorInputCapabilities, GroupIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { GroupsOrder, IAuxiliaryEditorPart, IEditorGroup, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';

/** Why an editor cannot move or copy to another group, as the editor says (see {@link EditorInput.canMove}). */
export interface IEditorTransferVeto {
	readonly editor: EditorInput;
	readonly message: string;
	/** Whether the editor has unsaved changes, which saving or reverting may resolve. */
	readonly dirty: boolean;
}

/** A group of a window that does not exist yet, such as one that a drag or a "… into New Window" command creates. */
export const NEW_WINDOW_TARGET = 'newWindow';

export type EditorTransferTarget = GroupIdentifier | typeof NEW_WINDOW_TARGET;

export interface IEditorTransferOptions {
	/**
	 * Whether the editors are copied. A copy opens `editor.copy()` in the target and leaves the editor where it is, so
	 * only singleton editors, which move even when copied, are asked.
	 */
	readonly copy?: boolean;
}

/**
 * Why the exact `editors` of the group `source`, the ones taking part in a transfer, cannot move or copy to `target`;
 * `undefined` when they can. Asks each editor, in order, and returns the first veto. Never changes anything.
 */
export function getEditorsTransferVeto(editors: readonly EditorInput[], source: GroupIdentifier, target: EditorTransferTarget, options?: IEditorTransferOptions): IEditorTransferVeto | undefined {
	for (const editor of editors) {
		if (options?.copy && !editor.hasCapability(EditorInputCapabilities.Singleton)) {
			continue;
		}
		const result = target === NEW_WINDOW_TARGET ? editor.canMoveToNewWindow(source) : editor.canMove(source, target);
		if (typeof result === 'string') {
			return { editor, message: result, dirty: editor.isDirty() };
		}
	}

	return undefined;
}

/** Why the editors of `group` cannot move or copy to `target` with the group; `undefined` when they can. */
export function getGroupTransferVeto(group: IEditorGroup, target: EditorTransferTarget, options?: IEditorTransferOptions): IEditorTransferVeto | undefined {
	return getEditorsTransferVeto(group.editors, group.id, target, options);
}

/**
 * Why the editors of the modal editor part `modalPart` cannot all move into the window of `mainPart`, as Open Modal
 * Editor in Main Window moves them; `undefined` when they can. Any group of `mainPart` stands for its window.
 */
export function getModalToMainTransferVeto(modalPart: IEditorPart, mainPart: IEditorPart): IEditorTransferVeto | undefined {
	for (const group of modalPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
		const veto = getGroupTransferVeto(group, mainPart.activeGroup.id);
		if (veto) {
			return veto;
		}
	}

	return undefined;
}

/** The detail shown with a veto: only an editor with unsaved changes may move once they are saved or reverted. */
export function getEditorTransferVetoDetail(veto: Pick<IEditorTransferVeto, 'dirty'>): string | undefined {
	return veto.dirty ? localize('editorTransferVetoDetail', "Try saving or reverting the editor first and then try again.") : undefined;
}

/** Tells the user why editors cannot move or copy to another group. */
export function showEditorTransferVeto(dialogService: IDialogService, veto: IEditorTransferVeto): void {
	dialogService.error(veto.message, getEditorTransferVetoDetail(veto));
}

/** What {@link transferToNewWindow} needs of its caller. */
export interface INewWindowTransfer {
	/** Why the editors cannot go to `target`: a window not created yet, then the active group of the one created. */
	readonly getVeto: (target: EditorTransferTarget) => IEditorTransferVeto | undefined;
	readonly showVeto: (veto: IEditorTransferVeto) => void;
	/** Creates the window; `undefined` when it does not create one, such as when the drag ends over a window. */
	readonly createPart: () => Promise<IAuxiliaryEditorPart | undefined>;
	/** Whether the editors are still where they were, once the window is created. */
	readonly isSourceAlive: () => boolean;
	/** Moves or copies the editors into the window's active group. */
	readonly transfer: (part: IAuxiliaryEditorPart) => void;
}

/**
 * Moves or copies editors into a new window, unless one of them cannot go: it does not create a window for editors
 * that cannot leave, and checks again once the window exists, before anything moves, as an editor may have changed
 * meanwhile. A window created for nothing closes again while it is still empty; one that something else opened an
 * editor in meanwhile stays. Resolves to the window the editors went to.
 */
export async function transferToNewWindow(transfer: INewWindowTransfer): Promise<IAuxiliaryEditorPart | undefined> {
	const preflight = transfer.getVeto(NEW_WINDOW_TARGET);
	if (preflight) {
		transfer.showVeto(preflight);
		return undefined;
	}

	const part = await transfer.createPart();
	if (!part) {
		return undefined;
	}

	let closed = false;
	const closeListener = Event.once(part.onWillClose)(() => closed = true);
	try {
		const veto = transfer.isSourceAlive() ? transfer.getVeto(part.activeGroup.id) : undefined;
		if (veto || !transfer.isSourceAlive()) {
			if (veto) {
				transfer.showVeto(veto);
			}
			if (!closed && part.groups.every(group => group.isEmpty)) {
				part.close();
			}
			return undefined;
		}

		transfer.transfer(part);
		return part;
	} finally {
		closeListener.dispose();
	}
}
