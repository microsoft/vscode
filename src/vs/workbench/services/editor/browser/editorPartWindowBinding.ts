/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService, IEmbeddedEditorPart } from '../common/editorGroupsService.js';

/**
 * Ties the lifetime of editor parts created with `IEditorGroupsService.createEditorPart`
 * to an auxiliary window that the caller owns:
 * - closing the window is vetoed when an editor in one of the parts cannot be moved to the main part
 *   (the editor is revealed in its group so that the user can resolve it),
 * - once the window unloads, the parts are closed, which merges their editors into the main part.
 *
 * The returned disposable removes the binding without closing the parts.
 */
export function bindEditorPartsToWindow(window: IAuxiliaryWindow, parts: readonly IEmbeddedEditorPart[], editorGroupsService: IEditorGroupsService): IDisposable {
	const store = new DisposableStore();

	store.add(window.onBeforeUnload(event => {
		const targetGroupId = editorGroupsService.mainPart.activeGroup.id;
		for (const part of parts) {
			for (const group of part.groups) {
				for (const editor of group.editors) {
					const canMoveVeto = editor.canMove(group.id, targetGroupId);
					if (typeof canMoveVeto === 'string') {
						group.openEditor(editor);
						event.veto(canMoveVeto);
						return;
					}
				}
			}
		}
	}));

	store.add(Event.once(window.onUnload)(() => {
		for (const part of parts) {
			part.close();
		}
		store.dispose();
	}));

	return store;
}
