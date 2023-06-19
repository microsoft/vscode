/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { ContentWidgetPositionPreference, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ResizableContentWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class TestHover extends ResizableContentWidget {

	private readonly _element = document.createElement('div');

	constructor(editor: ICodeEditor) {
		super(editor, new Dimension(100, 100));

		this._element.innerText = 'Hello Hover';
		this._element.style.backgroundColor = 'yellow';
		this.getDomNode().appendChild(this._element);
		editor.addContentWidget(this);

		this._contentPosition = {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.BELOW]
		};

		let delta = 100;

		setInterval(() => {
			if (this._dim && !this.isResizing) {
				this._resize(new Dimension(this._dim.width, this._dim.height + delta + delta * Math.random()));
				delta *= -1;
			}
		}, 5000);

		editor.layoutContentWidget(this);
	}

	public override dispose(): void {
		super.dispose();
		this._editor.removeContentWidget(this);
	}

	override getId(): string {
		return 'test.hover';
	}

	private _dim: Dimension | undefined;

	override _resize(dimension: Dimension): void {
		super._resize(dimension);
		this._dim = dimension;
		this._element.innerText = `width: ${dimension.width}, height: ${dimension.height}`;
		this._element.style.width = `${dimension.width}px`;
		this._element.style.height = `${dimension.height}px`;
	}

}
let newLocal: TestHover | undefined;

registerAction2(class FOO extends EditorAction2 {

	constructor() {
		super({
			id: 'test.hover',
			title: { value: 'Test Hover', original: '' },
			f1: true,
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		if (newLocal) {
			newLocal.dispose();
			newLocal = undefined;
		} else {
			newLocal = new TestHover(editor);
		}
	}
});
