/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MultipleSizePersistingOptions, ResizableContentWidget, ResizableWidget } from 'vs/editor/contrib/hover/browser/resizableContentWidget';


class ResizableHovertWidget extends ResizableWidget {

	public ID = 'editor.contrib.resizableContentHoverWidget';
	private _hoverDisposables = new DisposableStore();

	// TODO: Element from the abstract super class
	// abstract properties have to be public?
	resizableContentWidget: ResizableContentHoverWidget;

	constructor(
		editor: ICodeEditor
	) {
		super(editor, new MultipleSizePersistingOptions());

		// create here the dom node and all other logic should go here that was in the super abstract class
		this.resizableContentWidget = new ResizableContentHoverWidget(this, editor);

		// element is a property of the resizable hover widget
		this._hoverDisposables.add(this.element.onDidResize((e) => {
			// When the resizable hover overlay changes, resize the widget
			// this._widget.resize(e.dimension);
		}));
	}
}

class ResizableContentHoverWidget extends ResizableContentWidget {

	public ID = 'editor.contrib.resizableContentHoverWidget';
	private _hoverDisposables = new DisposableStore();

	constructor(resizableHoverWidget: ResizableHovertWidget, editor: ICodeEditor) {
		super(resizableHoverWidget, editor);
	}
}
