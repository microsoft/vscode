/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IWindowCanvasPresentation, IWindowCanvasService, WindowCanvasInput } from '../../../services/canvas/browser/windowCanvasService.js';

export class WindowCanvasEditor extends EditorPane {
	private container: HTMLElement | undefined;
	private presentation: IWindowCanvasPresentation | undefined;
	private dimension: Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWindowCanvasService private readonly canvasService: IWindowCanvasService,
	) {
		super(WindowCanvasInput.EDITOR_ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = parent.appendChild($('.window-canvas-editor'));
	}

	override async setInput(input: WindowCanvasInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.detach();
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}
		this.presentation = this.canvasService.getPresentation(input);
		this.container?.appendChild(this.presentation.element);
		this.presentation.content.setVisible(this.isVisible());
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.presentation) {
			this.presentation.element.style.width = `${dimension.width}px`;
			this.presentation.element.style.height = `${dimension.height}px`;
			this.presentation.content.layout(dimension.width, dimension.height);
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);
		this.presentation?.content.setVisible(visible);
	}

	override focus(): void {
		this.presentation?.content.focus();
	}

	override clearInput(): void {
		this.detach();
		super.clearInput();
	}

	private detach(): void {
		this.presentation?.content.setVisible(false);
		this.presentation?.element.remove();
		this.presentation = undefined;
	}

	override dispose(): void {
		this.detach();
		super.dispose();
	}
}
