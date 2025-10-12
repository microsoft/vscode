/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class AiBrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.aiBrowser';

	constructor(
		group: IEditorGroup,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		storageService: IStorageService
	) {
		super(AiBrowserEditor.ID, group, telemetryService, themeService, storageService);
	}

	// Create DOM structure with:
	// - Left panel (80%): embedded browser (webview or iframe)
	// - Right panel (20%): chat interface

	protected createEditor(parent: HTMLElement): void {
		// TODO: Implement DOM structure
	}

	override layout(dimension: Dimension): void {
		// TODO: Implement layout logic
	}
}
