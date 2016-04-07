/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';

export class ExtensionsPart extends BaseEditor {

	static ID: string = 'workbench.editor.extensionsPart';

	private domNode: HTMLDivElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(ExtensionsPart.ID, telemetryService);
	}

	createEditor(parent: Builder): void {
		this.domNode = document.createElement('div');
		parent.getHTMLElement().appendChild(this.domNode);
	}

	setVisible(visible: boolean, position?: Position): TPromise<void> {
		return super.setVisible(visible, position);
	}

	layout(dimension: Dimension): void {
		// TODO
	}

	focus(): void {
		// TODO
	}

	setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		if (this.input === input) {
			return TPromise.as(undefined);
		}

		// this._model = undefined;
		// this._modelChangeSubscription.dispose();

		if (!(input instanceof ExtensionsInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		// return this._editorService.resolveEditorModel({ resource: (<HtmlInput>input).getResource() }).then(model => {
		// 	if (model instanceof BaseTextEditorModel) {
		// 		this._model = model.textEditorModel;
		// 	}
		// 	if (!this._model) {
		// 		return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
		// 	}
		// 	this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this.webview.contents = this._model.getLinesContent());
		// 	this.webview.contents = this._model.getLinesContent();
		// 	return super.setInput(input, options);
		// });
	}

	dispose(): void {
		super.dispose();
	}
}
