/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ProcessExplorerEditor } from '../browser/processExplorerEditor.js';
import { NativeProcessExplorerControl } from './processExplorerControl.js';

export class NativeProcessExplorerEditor extends ProcessExplorerEditor {

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(group, telemetryService, themeService, storageService, instantiationService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.processExplorerControl = this._register(this.instantiationService.createInstance(NativeProcessExplorerControl, parent));
	}
}
