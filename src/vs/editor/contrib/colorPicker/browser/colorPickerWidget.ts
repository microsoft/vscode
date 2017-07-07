/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./colorpicker';
import { IOverlayWidget, IOverlayWidgetPosition, ICodeEditor } from "vs/editor/browser/editorBrowser";
import { Widget } from "vs/base/browser/ui/widget";
import * as dom from 'vs/base/browser/dom';
import { ColorPickerHeader } from "vs/editor/contrib/colorPicker/browser/elements/colorPickerHeader";
import { ColorPickerBody } from "vs/editor/contrib/colorPicker/browser/elements/colorPickerBody";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
const $ = dom.$;

export class ColorPickerWidget extends Widget implements IOverlayWidget {
	private static ID = 'editor.contrib.colorPickerWidget';

	private domNode: HTMLElement;
	public header: ColorPickerHeader;
	public body: ColorPickerBody;

	public visible: boolean = false;

	constructor(public model: ColorPickerModel, public editor: ICodeEditor) {
		super();
	}

	public show(): void {
		if (this.visible) {
			return;
		}

		this.domNode = $('editor-widget colorpicker-widget');
		this.domNode.setAttribute('aria-hidden', 'false');
		this.editor.addOverlayWidget(this);

		this.header = new ColorPickerHeader(this, this.model);
		this.body = new ColorPickerBody(this, this.model, this.domNode.offsetWidth);

		this.layout();
		this.visible = true;
	}

	private layout(): void {
		let editorLayout = this.editor.getLayoutInfo();

		let top = Math.round((editorLayout.height - this.domNode.offsetHeight) / 2);
		this.domNode.style.top = top + 'px';

		let left = Math.round((editorLayout.width - this.domNode.offsetWidth) / 2);
		this.domNode.style.left = left + 'px';
	}

	public dispose(): void {
		this.visible = false;
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return ColorPickerWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}
}