/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IEditorGroupView } from './editor.js';
import { EditorPart } from './editorPart.js';
import { GroupActivationReason, GroupDirection, GroupsOrder } from '../../../services/editor/common/editorGroupsService.js';
import { Parts } from '../../../services/layout/browser/layoutService.js';

/**
 * An editor part that is created and owned by someone else than the
 * workbench grid (for example an auxiliary window or a container of a
 * feature). It does not persist its own state, closes itself when its
 * last group is removed, and merges remaining editors into the main
 * part when it is closed.
 */
export abstract class OwnedEditorPart extends EditorPart {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {

		// Close the part when its last group is removed
		const groupView = this.assertGroupView(group);
		if (this.count === 1 && this.activeGroup === groupView) {
			this.doRemoveLastGroup(preserveFocus);
		}

		// Otherwise delegate to parent implementation
		else {
			super.removeGroup(group, preserveFocus);
		}
	}

	private doRemoveLastGroup(preserveFocus?: boolean): void {
		const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);

		// Activate next group when closing
		const nextActiveGroup = this.editorPartsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(group => group.groupsView !== this);
		if (nextActiveGroup) {
			nextActiveGroup.groupsView.activateGroup(nextActiveGroup, undefined, GroupActivationReason.PART_CLOSE);
		}

		// Deal with focus: focus the next recently used group but skip
		// this if the next group is in the main part and the main part
		// is currently hidden, as that would make it visible.
		if (nextActiveGroup && restoreFocus) {
			const nextGroupInHiddenMainPart = nextActiveGroup.groupsView === this.editorPartsView.mainPart && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
			if (!nextGroupInHiddenMainPart) {
				nextActiveGroup.focus();
			}
		}

		this.doClose(false /* do not merge any confirming editors to main part */);
	}

	protected override saveState(): void {
		return; // disabled, the state of an owned editor part is tracked by its owner
	}

	/**
	 * Closes the part: editors that do not need confirmation are closed and
	 * the remaining ones are merged into the main part. Returns `false` if
	 * the editors could not be merged, in which case the part stays open.
	 */
	close(): boolean {
		return this.doClose(true /* merge all confirming editors to main part */);
	}

	private doClose(mergeConfirmingEditorsToMainPart: boolean): boolean {
		let result = true;
		if (mergeConfirmingEditorsToMainPart) {

			// First close all editors that are non-confirming
			for (const group of this.groups) {
				group.closeAllEditors({ excludeConfirming: true, force: true });
			}

			// Then merge remaining to main part
			result = this.mergeGroupsToMainPart();
			if (!result) {
				return false; // Do not close when editors could not be merged back
			}
		}

		this._onWillClose.fire();

		return result;
	}

	private mergeGroupsToMainPart(): boolean {
		if (!this.groups.some(group => group.count > 0)) {
			return true; // skip if we have no editors opened
		}

		// Find the most recent group that is not locked
		let targetGroup: IEditorGroupView | undefined = undefined;
		for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			if (!group.isLocked) {
				targetGroup = group;
				break;
			}
		}

		if (!targetGroup) {
			targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === 'right' ? GroupDirection.RIGHT : GroupDirection.DOWN);
		}

		const result = this.mergeAllGroups(targetGroup, {
			// Try to reduce the impact of closing the owned part
			// as much as possible by not changing existing editors
			// in the main part.
			preserveExistingIndex: true
		});
		targetGroup.focus();

		return result;
	}
}
