/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorCommandsContext } from '../../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorInfo } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

export const markdownEditorId = 'vscode.markdown.editor';

const reopenWithEditorCommandId = 'workbench.action.reopenWithEditor';

const lastUntitledEditorStorageKey = 'emptyEditorHint.lastUntitledEditor';

export function getOtherEditors(editorResolverService: IEditorResolverService, resource: URI): RegisteredEditorInfo[] {
	return editorResolverService.getEditors(resource).filter(editor => editor.id !== DEFAULT_EDITOR_ASSOCIATION.id);
}

export function canOpenInMarkdownEditor(editorResolverService: IEditorResolverService, resource: URI): boolean {
	return getOtherEditors(editorResolverService, resource).some(editor => editor.id === markdownEditorId);
}

/**
 * Reopens the file of an editor that shows the empty editor hint in another editor, and remembers that editor,
 * so the hint offers it first next time.
 */
export class EmptyEditorHintReopener {

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IEditorService private readonly _editorService: IEditorService,
		@IStorageService private readonly _storageService: IStorageService,
	) { }

	getPrimaryEditor(): RegisteredEditorInfo | undefined {
		const resource = this._editor.getModel()?.uri;
		const otherEditors = resource ? getOtherEditors(this._editorResolverService, resource) : [];
		const lastEditorId = this._storageService.get(lastUntitledEditorStorageKey, StorageScope.PROFILE);
		return otherEditors.find(editor => editor.id === lastEditorId) ?? otherEditors.find(editor => editor.id === markdownEditorId);
	}

	showEditorPicker(): Promise<void> {
		return this._reopenAndRemember(context => this._commandService.executeCommand(reopenWithEditorCommandId, context));
	}

	reopenWith(editorId: string): Promise<void> {
		return this._reopenAndRemember(context => this._commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, editorId, context));
	}

	/**
	 * The command context of only this editor. The reopen commands act on all tabs that are selected together
	 * with this editor, so the tab selection is narrowed to this editor first.
	 */
	private async _getSingleEditorContext(): Promise<IEditorCommandsContext | undefined> {
		const pane = this._editorService.visibleEditorPanes.find(pane => pane.getControl() === this._editor);
		const input = pane?.input;
		if (!pane || !input) {
			return undefined;
		}
		if (pane.group.isSelected(input) && pane.group.selectedEditors.length > 1) {
			await pane.group.setSelection(input, []);
		}
		return { groupId: pane.group.id, editorIndex: pane.group.getIndexOfEditor(input) };
	}

	private async _reopenAndRemember(reopen: (context: IEditorCommandsContext) => Promise<unknown>): Promise<void> {
		const resource = this._editor.getModel()?.uri;
		const context = await this._getSingleEditorContext();
		if (!context) {
			return;
		}
		await reopen(context);
		const activeEditor = this._editorService.activeEditor;
		if (activeEditor?.editorId && activeEditor.editorId !== DEFAULT_EDITOR_ASSOCIATION.id && isEqual(activeEditor.resource, resource)) {
			this._storageService.store(lastUntitledEditorStorageKey, activeEditor.editorId, StorageScope.PROFILE, StorageTarget.USER);
		}
	}
}
