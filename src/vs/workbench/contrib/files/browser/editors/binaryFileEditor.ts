/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorOverride, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorOverrideService, OverrideStatus, ReturnedOverride } from 'vs/workbench/services/editor/common/editorOverrideService';

/**
 * An implementation of editor for binary files that cannot be displayed.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	static readonly ID = BINARY_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorOverrideService private readonly editorOverrideService: IEditorOverrideService,
		@IStorageService storageService: IStorageService
	) {
		super(
			BinaryFileEditor.ID,
			{
				openInternal: (input, options) => this.openInternal(input, options)
			},
			telemetryService,
			themeService,
			storageService
		);
	}

	private async openInternal(input: EditorInput, options: IEditorOptions | undefined): Promise<void> {
		if (input instanceof FileEditorInput && this.group && this.group.activeEditor) {

			// We operate on the active editor here to support re-opening
			// diff editors where `input` may just be one side of the
			// diff editor.
			// Since `openInternal` can only ever be selected from the
			// active editor of the group, this is a safe assumption.
			// (https://github.com/microsoft/vscode/issues/124222)
			const editor = this.group.activeEditor;

			// Enforce to open the input as text to enable our text based viewer
			input.setForceOpenAsText();

			// Try to let the user pick an override if there is one availabe
			let overridenInput: ReturnedOverride | undefined = await this.editorOverrideService.resolveEditorInput({ resource: editor.resource, options: { ...options, override: EditorOverride.PICK } }, this.group);
			if (overridenInput === OverrideStatus.NONE) {
				overridenInput = undefined;
			} else if (overridenInput === OverrideStatus.ABORT) {
				return;
			}

			// Replace the overrriden input, with the text based input
			await this.editorService.replaceEditors([{
				editor,
				replacement: overridenInput?.editor ?? input,
				options: {
					...overridenInput?.options ?? options,
					override: EditorOverride.DISABLED
				}
			}], this.group);
		}
	}

	override getTitle(): string {
		return this.input ? this.input.getName() : localize('binaryFileEditor', "Binary File Viewer");
	}
}
