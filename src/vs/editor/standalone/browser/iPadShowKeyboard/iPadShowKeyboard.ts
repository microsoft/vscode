/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './iPadShowKeyboard.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { isIOS } from '../../../../base/common/platform.js';

export class IPadShowKeyboard extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.iPadShowKeyboard';

	private readonly editor: ICodeEditor;
	private widget: ShowKeyboardWidget | null;

	constructor(editor: ICodeEditor) {
		super();
		this.editor = editor;
		this.widget = null;
		if (isIOS) {
			this._register(editor.onDidChangeConfiguration(() => this.update()));
			this.update();
		}
	}

	private update(): void {
		const shouldHaveWidget = (!this.editor.getOption(EditorOption.readOnly));

		if (!this.widget && shouldHaveWidget) {

			this.widget = new ShowKeyboardWidget(this.editor);

		} else if (this.widget && !shouldHaveWidget) {

			this.widget.dispose();
			this.widget = null;

		}
	}

	public override dispose(): void {
		super.dispose();
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
	}
}

class ShowKeyboardWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.ShowKeyboardWidget';

	private readonly editor: ICodeEditor;

	private readonly _domNode: HTMLElement;

	constructor(editor: ICodeEditor) {
		super();
		this.editor = editor;
		this._domNode = document.createElement('textarea');
		this._domNode.className = 'iPadShowKeyboard';

		this._register(dom.addDisposableListener(this._domNode, 'touchstart', (e) => {
			this.editor.focus();
		}));
		this._register(dom.addDisposableListener(this._domNode, 'focus', (e) => {
			this.editor.focus();
		}));

		this.editor.addOverlayWidget(this);
	}

	public override dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return ShowKeyboardWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

registerEditorContribution(IPadShowKeyboard.ID, IPadShowKeyboard, EditorContributionInstantiation.Eventually);
