/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializedNode } from '../../../base/browser/ui/grid/grid.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { dispose } from '../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IEditorPartUIState } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry } from '../../../workbench/common/editor.js';
import { EditorGroupModel, ISerializedEditorGroupModel, isSerializedEditorGroupModel } from '../../../workbench/common/editor/editorGroupModel.js';
import { IEditorGroup } from '../../../workbench/services/editor/common/editorGroupsService.js';

/**
 * Applies a single-group editor part state to `group` without recreating the group:
 * editors that match an open editor are reused, the active editor is swapped in
 * place, and incoming editors open before outgoing ones close. Switching between
 * two non-empty states therefore never empties the group or rebuilds its editor
 * pane, which a full state apply (close all, then recreate the grid) does.
 *
 * Returns `false` without changing `group` when the state cannot be applied in
 * place: it has several groups or a different group, its lock state differs, it
 * has no editors, an open editor would need a close confirmation, either side has
 * sticky editors, or the saved preview editor is open pinned (a group cannot unpin
 * it in place). These checks run before deserializing, so the state's editors are
 * only created once.
 */
export async function applySingleGroupEditorStateInPlace(group: IEditorGroup, state: IEditorPartUIState, instantiationService: IInstantiationService): Promise<boolean> {
	const serializedGroup = getSingleSerializedGroup(state.serializedGrid.root);
	if (!serializedGroup || serializedGroup.id !== group.id || !!serializedGroup.locked !== group.isLocked || serializedGroup.editors.length === 0
		|| group.editors.some(editor => editor.closeHandler || editor.isDirty())
		|| group.stickyCount > 0 || typeof serializedGroup.sticky === 'number'
		|| isSavedPreviewOpenPinned(group, serializedGroup)) {
		return false;
	}

	const model = instantiationService.createInstance(EditorGroupModel, serializedGroup);
	const incoming = model.getEditors(EditorsOrder.SEQUENTIAL);
	const incomingActive = model.activeEditor;
	const editors = incoming.map(editor => group.editors.find(candidate => candidate.matches(editor)) ?? editor);
	const outgoing = group.editors.filter(editor => !editors.includes(editor));
	const editorOptions = incoming.map((editor, index): IEditorOptions => ({
		pinned: model.isPinned(index),
		inactive: editor !== incomingActive,
		preserveFocus: true,
	}));
	model.dispose();
	dispose(incoming.filter((editor, index) => editor !== editors[index]));
	if (!incomingActive) {
		return false;
	}

	editors.forEach((editor, index) => {
		if (!group.contains(editor)) {
			return;
		}
		if (editorOptions[index].pinned && !group.isPinned(editor)) {
			group.pinEditor(editor);
		}
	});

	const activeIndex = incoming.indexOf(incomingActive);
	const active = editors[activeIndex];
	const currentActive = group.activeEditor;
	const opened: Promise<unknown>[] = [];

	if (currentActive && outgoing.includes(currentActive) && !group.contains(active)) {
		opened.push(group.replaceEditors([{ editor: currentActive, replacement: active, forceReplaceDirty: true, options: editorOptions[activeIndex] }]));
		outgoing.splice(outgoing.indexOf(currentActive), 1);
	}

	for (let index = 0; index < editors.length; index++) {
		const editor = editors[index];
		const currentPosition = group.getIndexOfEditor(editor);
		const previousPosition = index === 0 ? -1 : group.getIndexOfEditor(editors[index - 1]);
		if (currentPosition <= previousPosition) {
			opened.push(group.openEditor(editor, { ...editorOptions[index], index: previousPosition + 1 }));
		} else if (index === activeIndex && group.activeEditor !== editor) {
			opened.push(group.openEditor(editor, editorOptions[index]));
		}
	}

	Promise.all(opened).catch(onUnexpectedError);

	if (outgoing.length) {
		await group.closeEditors(outgoing, { preserveFocus: true });
	}

	return true;
}

function isSavedPreviewOpenPinned(group: IEditorGroup, serializedGroup: ISerializedEditorGroupModel): boolean {
	const preview = typeof serializedGroup.preview === 'number' ? serializedGroup.editors[serializedGroup.preview] : undefined;
	if (!preview) {
		return false;
	}
	const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
	return group.editors.some(editor => {
		if (editor.typeId !== preview.id || !group.isPinned(editor)) {
			return false;
		}
		const serializer = registry.getEditorSerializer(editor);
		return !!serializer?.canSerialize(editor) && serializer.serialize(editor) === preview.value;
	});
}

function getSingleSerializedGroup(node: ISerializedNode): ISerializedEditorGroupModel | undefined {
	if (node.type === 'leaf') {
		return isSerializedEditorGroupModel(node.data) ? node.data : undefined;
	}
	return node.data.length === 1 ? getSingleSerializedGroup(node.data[0]) : undefined;
}
