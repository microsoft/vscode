/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput, EditorOptions, BINARY_FILE_EDITOR_ID } from 'vs/workbench/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import URI from 'vs/base/common/uri';

/**
 * An implementation of editor for binary files like images.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	public static readonly ID = BINARY_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(
			BinaryFileEditor.ID,
			{
				openInternal: (input, options) => this.openInternal(input, options),
				openExternal: resource => this.openExternal(resource)
			},
			telemetryService,
			themeService
		);
	}

	private openInternal(input: EditorInput, options: EditorOptions): void {
		if (input instanceof FileEditorInput) {
			input.setForceOpenAsText();
			this.editorService.openEditor(input, options, this.position).done(null, onUnexpectedError);
		}
	}

	private openExternal(resource: URI): void {
		this.windowsService.openExternal(resource.toString()).then(didOpen => {
			if (!didOpen) {
				return this.windowsService.showItemInFolder(resource.fsPath);
			}

			return void 0;
		});
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryFileEditor', "Binary File Viewer");
	}
}
