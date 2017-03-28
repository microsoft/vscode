/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowsService } from "vs/platform/windows/common/windows";

/**
 * An implementation of editor for binary files like images.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	public static ID = BINARY_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IWindowsService windowsService: IWindowsService
	) {
		super(BinaryFileEditor.ID, telemetryService, themeService, windowsService);
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryFileEditor', "Binary File Viewer");
	}
}