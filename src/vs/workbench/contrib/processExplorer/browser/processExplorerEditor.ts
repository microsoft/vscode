/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { BrowserProcessExplorerControl, ProcessExplorerControl } from './processExplorerControl.js';

export class ProcessExplorerEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.processExplorer';

	protected processExplorerControl: ProcessExplorerControl | undefined = undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) {
		super(ProcessExplorerEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.processExplorerControl = this._register(this.instantiationService.createInstance(BrowserProcessExplorerControl, parent));
	}

	override focus(): void {
		this.processExplorerControl?.focus();
	}

	override layout(dimension: Dimension): void {
		this.processExplorerControl?.layout(dimension);
	}
}
