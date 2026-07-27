/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, SideBySideEditor, isDiffEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorInfo, RegisteredEditorPriority, priorityToRank } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from './editorCommands.js';

/**
 * Describes the editors available for the active editor's resource, i.e. the different editor types
 * (e.g. "Text Editor" vs. "Markdown Preview") that the resource can be reopened with.
 */
export interface IAvailableEditorTypes {
	readonly resource: URI;
	readonly isDiffEditor: boolean;
	readonly originalResource?: URI;
	readonly modifiedResource?: URI;
	readonly currentId: string;
	readonly editors: RegisteredEditorInfo[];
}

/**
 * Determines the editors available for the given active editor's resource. Returns `undefined` when
 * there is nothing meaningful to switch between: no resource, only the default text editor, or an
 * exclusive editor (e.g. the hex editor, for which `getEditors` returns an empty list).
 */
export function getAvailableEditorTypes(activeEditor: EditorInput | null | undefined, editorResolverService: IEditorResolverService): IAvailableEditorTypes | undefined {
	const resource = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
	if (!resource) {
		return undefined;
	}
	const editors = editorResolverService.getEditors(resource);
	if (editors.length <= 1) {
		return undefined;
	}
	const isDiffEditor = isDiffEditorInput(activeEditor);
	return {
		resource,
		isDiffEditor,
		originalResource: isDiffEditor ? activeEditor.original.resource : undefined,
		modifiedResource: isDiffEditor ? activeEditor.modified.resource : undefined,
		currentId: activeEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id,
		editors
	};
}

/** Whether a custom editor can be selected by default for the resource. */
export function hasDefaultEditorAssociation(available: IAvailableEditorTypes, configuredDefaultEditor: string | undefined): boolean {
	if (configuredDefaultEditor !== undefined && configuredDefaultEditor !== DEFAULT_EDITOR_ASSOCIATION.id) {
		return true;
	}

	return available.editors.some(editor => {
		if (editor.id === DEFAULT_EDITOR_ASSOCIATION.id) {
			return false;
		}

		const priority = available.isDiffEditor ? editor.priority.diff : editor.priority.editor;
		return priorityToRank(priority) >= priorityToRank(RegisteredEditorPriority.builtin);
	});
}

/**
 * The label to show for an editor type. In a diff context the default text editor is presented as
 * "Text Diff Editor" to match how it actually opens.
 */
export function editorTypeDisplayLabel(editor: RegisteredEditorInfo, isDiffEditor: boolean): string {
	if (isDiffEditor && editor.id === DEFAULT_EDITOR_ASSOCIATION.id) {
		return localize('textDiffEditor', "Text Diff Editor");
	}
	return editor.label;
}

/**
 * Builds the actions that let the user switch between the editor types available for a resource:
 * one "reopen with" action per available editor (the current one checked), a "Set Default" submenu
 * for persisting the choice, and — for diffs — actions to open either side as a standalone editor.
 */
export function createEditorTypeActions(
	available: IAvailableEditorTypes,
	editorResolverService: IEditorResolverService,
	commandService: ICommandService,
	editorService: IEditorService
): IAction[] {
	const glob = `*${extUri.extname(available.resource)}`;

	// Show the contributing extension in parentheses, but only for extension-provided editors.
	// Built-in providers share this localized label, so their (redundant) source is omitted.
	const builtinProviderLabel = localize('builtinProviderDisplayName', "Built-in");
	const labelWithSource = (editor: RegisteredEditorInfo) => {
		const label = editorTypeDisplayLabel(editor, available.isDiffEditor);
		return editor.detail && editor.detail !== builtinProviderLabel
			? localize('editorType.labelWithSource', "{0} - {1}", label, editor.detail)
			: label;
	};

	// Reopen the active editor with the chosen editor type. The currently active type is checked.
	const reopenActions: IAction[] = available.editors.map(editor => toAction({
		id: editor.id,
		label: labelWithSource(editor),
		checked: editor.id === available.currentId,
		run: () => commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, editor.id)
	}));

	// Persist the chosen editor as the default for this file type. For diffs this updates the
	// specialized `workbench.diffEditorAssociations` setting instead of the general one. The
	// currently configured default (if any) is checked. Setting a default also reopens the active
	// editor with that type so the change takes effect immediately.
	const configuredDefault = editorResolverService.getConfiguredDefaultEditor(available.resource, available.isDiffEditor);
	const setDefaultActions: IAction[] = available.editors.map(editor => toAction({
		id: `setDefault.${editor.id}`,
		label: labelWithSource(editor),
		checked: editor.id === configuredDefault,
		run: () => {
			editorResolverService.updateUserAssociations(glob, editor.id, available.isDiffEditor);
			return commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, editor.id);
		}
	}));
	const setDefaultSubmenu = new SubmenuAction(
		'editorType.setDefault',
		available.isDiffEditor
			? localize('editorType.setDefaultDiff', "Set Default (Diff Only) for '{0}'", glob)
			: localize('editorType.setDefault', "Set Default for '{0}'", glob),
		setDefaultActions
	);

	const actions: IAction[] = [...reopenActions, new Separator(), setDefaultSubmenu];

	// For diffs, offer to open either side as a standalone editor.
	if (available.isDiffEditor) {
		actions.push(new Separator());
		if (available.originalResource) {
			actions.push(toAction({
				id: 'editorType.openOriginal',
				label: localize('editorType.openOriginal', "Open Original"),
				run: () => editorService.openEditor({ resource: available.originalResource! })
			}));
		}
		if (available.modifiedResource) {
			actions.push(toAction({
				id: 'editorType.openModified',
				label: localize('editorType.openModified', "Open Modified"),
				run: () => editorService.openEditor({ resource: available.modifiedResource! })
			}));
		}
	}

	return actions;
}
