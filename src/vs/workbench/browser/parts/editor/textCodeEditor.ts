/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { assertIsDefined, withNullAsUndefined } from 'vs/base/common/types';
import { ITextEditorPane } from 'vs/workbench/common/editor';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { isEqual } from 'vs/base/common/resources';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { AbstractTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';

/**
 * A text editor using the code editor widget.
 */
export abstract class AbstractTextCodeEditor<T extends IEditorViewState> extends AbstractTextEditor<T> implements ITextEditorPane {

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this.getControl()?.invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	protected createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): CodeEditorWidget {
		return this.instantiationService.createInstance(CodeEditorWidget, parent, { enableDropIntoEditor: true, ...configuration }, {});
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.getControl();
	}

	override getControl(): ICodeEditor | undefined {
		return super.getControl() as ICodeEditor | undefined;
	}

	protected override computeEditorViewState(resource: URI): T | undefined {
		const control = this.getControl();
		if (!control) {
			return undefined;
		}

		const model = control.getModel();
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

		return withNullAsUndefined(control.saveViewState() as unknown as T);
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, assertIsDefined(this.getControl()), ScrollType.Smooth);
		}
	}
}
