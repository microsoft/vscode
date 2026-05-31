/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ITextEditorPane } from '../../../common/editor.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IEditorOptions as ICodeEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorViewState, ScrollType } from '../../../../editor/common/editorCommon.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { AbstractTextEditor } from './textEditor.js';
import { Dimension } from '../../../../base/browser/dom.js';

/**
 * A text editor using the code editor widget.
 */
export abstract class AbstractTextCodeEditor<T extends IEditorViewState> extends AbstractTextEditor<T> implements ITextEditorPane {

	protected editorControl: ICodeEditor | undefined = undefined;

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this.editorControl?.invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('textEditor', "Text Editor");
	}

	protected createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void {
		this.editorControl = this._register(this.instantiationService.createInstance(CodeEditorWidget, parent, initialOptions, this.getCodeEditorWidgetOptions()));
	}

	protected getCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return Object.create(null);
	}

	protected updateEditorControlOptions(options: ICodeEditorOptions): void {
		this.editorControl?.updateOptions(options);
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.editorControl;
	}

	override getControl(): ICodeEditor | undefined {
		return this.editorControl;
	}

	protected override computeEditorViewState(resource: URI): T | undefined {
		if (!this.editorControl) {
			return undefined;
		}

		const model = this.editorControl.getModel();
		if (!model) {
			return undefined; // view state always needs a model
		}

		const modelUri = model.uri;
		if (!modelUri) {
			return undefined; // model URI is needed to make sure we save the view state correctly
		}

		if (!isEqual(modelUri, resource)) {
			return undefined; // prevent saving view state for a model that is not the expected one
		}

		return this.editorControl.saveViewState() as unknown as T ?? undefined;
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, assertReturnsDefined(this.editorControl), ScrollType.Smooth);
		}
	}

	override focus(): void {
		super.focus();

		this.editorControl?.focus();
	}

	override hasFocus(): boolean {
		return this.editorControl?.hasTextFocus() || super.hasFocus();
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		if (visible) {
			this.editorControl?.onVisible();
		} else {
			this.editorControl?.onHide();
		}
	}

	override layout(dimension: Dimension): void {
		this.editorControl?.layout(dimension);
	}
}
