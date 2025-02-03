/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { BaseBinaryResourceEditor } from '../../../../browser/parts/editor/binaryEditor.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { FileEditorInput } from './fileEditorInput.js';
import { BINARY_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE } from '../../common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorResolution, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IEditorResolverService, ResolvedStatus, ResolvedEditor } from '../../../../services/editor/common/editorResolverService.js';
import { isEditorInputWithOptions } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';

/**
 * An implementation of editor for binary files that cannot be displayed.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	static readonly ID = BINARY_FILE_EDITOR_ID;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IStorageService storageService: IStorageService
	) {
		super(
			BinaryFileEditor.ID,
			group,
			{
				openInternal: (input, options) => this.openInternal(input, options)
			},
			telemetryService,
			themeService,
			storageService
		);
	}

	private async openInternal(input: EditorInput, options: IEditorOptions | undefined): Promise<void> {
		if (input instanceof FileEditorInput && this.group.activeEditor) {

			// We operate on the active editor here to support re-opening
			// diff editors where `input` may just be one side of the
			// diff editor.
			// Since `openInternal` can only ever be selected from the
			// active editor of the group, this is a safe assumption.
			// (https://github.com/microsoft/vscode/issues/124222)
			const activeEditor = this.group.activeEditor;
			const untypedActiveEditor = activeEditor?.toUntyped();
			if (!untypedActiveEditor) {
				return; // we need untyped editor support
			}

			// Try to let the user pick an editor
			let resolvedEditor: ResolvedEditor | undefined = await this.editorResolverService.resolveEditor({
				...untypedActiveEditor,
				options: {
					...options,
					override: EditorResolution.PICK
				}
			}, this.group);

			if (resolvedEditor === ResolvedStatus.NONE) {
				resolvedEditor = undefined;
			} else if (resolvedEditor === ResolvedStatus.ABORT) {
				return;
			}

			// If the result if a file editor, the user indicated to open
			// the binary file as text. As such we adjust the input for that.
			if (isEditorInputWithOptions(resolvedEditor)) {
				for (const editor of resolvedEditor.editor instanceof DiffEditorInput ? [resolvedEditor.editor.original, resolvedEditor.editor.modified] : [resolvedEditor.editor]) {
					if (editor instanceof FileEditorInput) {
						editor.setForceOpenAsText();
						editor.setPreferredLanguageId(BINARY_TEXT_FILE_MODE); // https://github.com/microsoft/vscode/issues/131076
					}
				}
			}

			// Replace the active editor with the picked one
			await this.group.replaceEditors([{
				editor: activeEditor,
				replacement: resolvedEditor?.editor ?? input,
				options: {
					...resolvedEditor?.options ?? options
				}
			}]);
		}
	}

	override getTitle(): string {
		return this.input ? this.input.getName() : localize('binaryFileEditor', "Binary File Viewer");
	}
}
