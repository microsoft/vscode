/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { SemanticDiffEditorInput } from './semanticDiffEditorInput.js';
import { SemanticDiffEditorWidget } from './semanticDiffEditorWidget.js';

export class SemanticDiffEditor extends EditorPane {
	static readonly ID = SemanticDiffEditorInput.EDITOR_ID;
	private container: HTMLElement | undefined;
	private dimension = new Dimension(0, 0);
	private readonly widget = this._register(new MutableDisposable<SemanticDiffEditorWidget>());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(SemanticDiffEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void { this.container = parent; }

	override async setInput(input: SemanticDiffEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.widget.clear();
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || this._store.isDisposed || this.input !== input || !this.container) {
			return;
		}
		const widget = this.widget.value = this.instantiationService.createInstance(SemanticDiffEditorWidget, this.container, input);
		widget.layout(this.dimension);
		await widget.load();
	}

	override clearInput(): void {
		this.widget.clear();
		super.clearInput();
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.widget.value?.layout(dimension);
	}

	override focus(): void {
		super.focus();
		this.widget.value?.focus();
	}

	override get scopedContextKeyService() { return this.widget.value?.scopedContextKeyService; }
	override getControl() { return this.widget.value?.diffWidget.getActiveControl(); }
	getAccessibleContent(): string | undefined { return this.widget.value?.getAccessibleContent(); }
	captureFocus(): () => void { return this.widget.value?.captureFocus() ?? (() => this.focus()); }

	protected override saveState(): void {
		this.widget.value?.saveViewState();
		super.saveState();
	}
}
