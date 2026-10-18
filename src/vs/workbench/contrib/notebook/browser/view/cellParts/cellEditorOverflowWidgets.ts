/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ContentHoverController } from '../../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { ParameterHintsController } from '../../../../../../editor/contrib/parameterHints/browser/parameterHints.js';
import { SuggestController } from '../../../../../../editor/contrib/suggest/browser/suggestController.js';

/** Owns the external popup host for a cell editor, including its inactive state. */
export class CellEditorOverflowWidgets extends Disposable {
	readonly domNode: HTMLElement;
	private editor: ICodeEditor | undefined;

	constructor(container: HTMLElement) {
		super();
		this.domNode = DOM.append(container, DOM.$('.monaco-editor'));
		this.setVisible(false);
	}

	bindEditor(editor: ICodeEditor): void {
		this.editor = editor;
		this._register(editor.contextKeyService.createScoped(this.domNode));
	}

	setVisible(visible: boolean): void {
		this.domNode.inert = !visible;
		DOM.setVisibility(visible, this.domNode);
		if (!visible && this.editor) {
			ContentHoverController.get(this.editor)?.cancel();
			ParameterHintsController.get(this.editor)?.cancel();
			SuggestController.get(this.editor)?.cancelSuggestWidget();
		}
	}

	override dispose(): void {
		this.setVisible(false);
		this.editor = undefined;
		this.domNode.remove();
		super.dispose();
	}
}
