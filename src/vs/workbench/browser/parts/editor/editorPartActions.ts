/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ActiveEditorGroupEmptyContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { EditorsOrder } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';

/**
 * The name of a part: the accessible name of its region, else the names of
 * its editors.
 */
export function getPartName(part: IEditorPart): string {
	const element = (part as { element?: unknown }).element;
	const label = isHTMLElement(element) ? element.getAttribute('aria-label') : null;

	return label || getPartEditorNames(part) || localize('part', "Part");
}

function getPartEditorNames(part: IEditorPart): string {
	return part.groups.flatMap(group => group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => editor.getName())).join(', ');
}

/**
 * The other parts of the window of a part, not counting a modal part.
 */
export function getOtherPartsOfWindow(editorGroupsService: IEditorGroupsService, part: IEditorPart): IEditorPart[] {
	return editorGroupsService.parts.filter(candidate => candidate !== part && candidate.windowId === part.windowId && candidate !== editorGroupsService.activeModalEditorPart);
}

/**
 * Moves an editor into the active group of a part and announces it.
 */
export function moveEditorToPart(editor: EditorInput, sourceGroup: IEditorGroup, part: IEditorPart): boolean {
	const targetGroup = part.activeGroup;
	if (!sourceGroup.moveEditor(editor, targetGroup)) {
		return false;
	}

	targetGroup.focus();
	status(localize('movedEditorToPart', "Moved {0} to {1}", editor.getName(), getPartName(part)));

	return true;
}

interface IPartPickItem extends IQuickPickItem {
	readonly part: IEditorPart;
}

export class MoveEditorToPartAction extends Action2 {

	static readonly ID = 'workbench.action.moveEditorToPart';

	constructor() {
		super({
			id: MoveEditorToPartAction.ID,
			title: localize2('moveEditorToPart', "Move Editor to Part..."),
			category: Categories.View,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ActiveEditorGroupEmptyContext.negate()),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const quickInputService = accessor.get(IQuickInputService);

		const sourceGroup = editorGroupsService.activeGroup;
		const editor = sourceGroup.activeEditor;
		if (!editor) {
			return;
		}

		const parts = getOtherPartsOfWindow(editorGroupsService, editorGroupsService.getPart(sourceGroup));
		if (parts.length === 0) {
			status(localize('noOtherPart', "There is no other part in this window"));
			return;
		}

		const picked = await quickInputService.pick<IPartPickItem>(parts.map(part => {
			const label = getPartName(part);
			const editorNames = getPartEditorNames(part);
			return { part, label, description: editorNames !== label ? editorNames : undefined };
		}), {
			placeHolder: localize('pickPart', "Select a part to move '{0}' to", editor.getName())
		});
		if (picked) {
			moveEditorToPart(editor, sourceGroup, picked.part);
		}
	}
}
