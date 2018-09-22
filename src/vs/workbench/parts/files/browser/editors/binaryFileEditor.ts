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
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { URI } from 'vs/base/common/uri';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { IFileService } from 'vs/platform/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

/**
 * An implementation of editor for binary files like images.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	static readonly ID = BINARY_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IFileService fileService: IFileService,
		@IWindowsService private windowsService: IWindowsService,
		@IEditorService private editorService: IEditorService
	) {
		super(
			BinaryFileEditor.ID,
			{
				openInternal: (input, options) => this.openInternal(input, options),
				openExternal: resource => this.openExternal(resource)
			},
			telemetryService,
			themeService,
			fileService
		);
	}

	private openInternal(input: EditorInput, options: EditorOptions): void {
		if (input instanceof FileEditorInput) {
			input.setForceOpenAsText();
			this.editorService.openEditor(input, options, this.group);
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

	getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryFileEditor', "Binary File Viewer");
	}
}
