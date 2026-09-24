/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import type { GroupIdentifier, IUntypedEditorInput } from '../../../common/editor.js';
import type { EditorInput } from '../../../common/editor/editorInput.js';
import type { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import type { IEditorService } from '../../../services/editor/common/editorService.js';

/**
 * SCM working sets share the editor layout, even across repositories. Keep all
 * transitions in one queue so a second branch switch cannot apply another
 * working set while the first switch is still restoring pinned editors.
 */
export class SCMWorkingSetRestoreQueue {
	private readonly sequencer = new Sequencer();

	queue<T>(restore: () => Promise<T>): Promise<T> {
		return this.sequencer.queue(restore);
	}
}

interface IPinnedEditor {
	readonly groupId: GroupIdentifier;
	readonly input: EditorInput;
	readonly untyped: IUntypedEditorInput | undefined;
}

function matchesPinnedEditor(editor: EditorInput, pinned: IPinnedEditor): boolean {
	return (pinned.untyped !== undefined && editor.matches(pinned.untyped)) || editor.matches(pinned.input) || pinned.input.matches(editor);
}

/**
 * Carry sticky ("pinned tab") editors across SCM working-set switches. Regular
 * pinned editors, which are merely not preview tabs, remain branch-specific.
 */
export async function applyWorkingSetWithPinnedEditors(
	editorGroupsService: IEditorGroupsService,
	editorService: IEditorService,
	workingSet: Parameters<IEditorGroupsService['applyWorkingSet']>[0],
	preserveFocus: boolean,
	persistPins: boolean
): Promise<boolean> {
	if (!persistPins) {
		return editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
	}

	// An EditorInput may be disposed while the new working set is applied. Save
	// the untyped form *before* that happens so it can be reopened afterwards.
	const pinnedEditors: IPinnedEditor[] = editorGroupsService.groups.flatMap(group =>
		group.editors.filter(editor => group.isSticky(editor)).map(input => ({
			groupId: group.id,
			input,
			untyped: input.toUntyped({ preserveViewState: group.id })
		}))
	);

	const applied = await editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
	if (!applied) {
		return false;
	}

	// Previously saved working sets can contain pinned tabs that have since
	// been unpinned or closed on another branch. Do not resurrect those tabs.
	// A close veto (e.g. an unsaved editor) must be respected.
	for (const group of editorGroupsService.groups) {
		for (const editor of group.editors.filter(editor => group.isSticky(editor))) {
			if (!pinnedEditors.some(pinned => matchesPinnedEditor(editor, pinned))) {
				await group.closeEditor(editor, { preserveFocus: true });
			}
		}
	}

	for (const pinned of pinnedEditors) {
		const preferredGroup = editorGroupsService.getGroup(pinned.groupId);
		const groups = preferredGroup
			? [preferredGroup, ...editorGroupsService.groups.filter(group => group !== preferredGroup)]
			: editorGroupsService.groups;
		const existing = groups.flatMap(group =>
			group.editors.filter(editor => matchesPinnedEditor(editor, pinned)).map(editor => ({ group, editor }))
		)[0];

		if (existing) {
			existing.group.stickEditor(existing.editor);
			continue;
		}

		const targetGroup = preferredGroup ?? editorGroupsService.activeGroup;
		const options = { pinned: true, sticky: true, inactive: true, preserveFocus: true };
		if (pinned.untyped) {
			await editorService.openEditor({
				...pinned.untyped,
				options: { ...pinned.untyped.options, ...options }
			}, targetGroup.id);
		} else if (!pinned.input.isDisposed()) {
			// Some custom editors have no untyped representation. If their input
			// survived the switch (e.g. it was open in another group), reuse it.
			await targetGroup.openEditor(pinned.input, options);
		}
	}

	return true;
}
