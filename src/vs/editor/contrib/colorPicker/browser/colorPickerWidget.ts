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
	private readonly width = 300;
	private readonly height = 190;

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
		this.body = new ColorPickerBody(this, this.model, this.width);

		this.layout();
		this.visible = true;
	}

	private layout(): void {
		let editorLayout = this.editor.getLayoutInfo();

		let top = Math.round((editorLayout.height - this.height) / 2);
		this.domNode.style.top = top + 'px';

		let left = Math.round((editorLayout.width - this.width) / 2);
		this.domNode.style.left = left + 'px';

		this.domNode.style.width = this.width + 'px';
		this.domNode.style.height = this.height + 'px';
	}

	public changePrimaryColor(): void {
		// View change only, other things go through the controller
	}
	public changeShade(): void {
		// View change only, other things go through the controller
	}
	public changeOpacity(): void {
		// View change only, other things go through the controller
	}

	public changeSelectedColor(color: string): void {
		// View change only, other things go through the controller
		this.layout();
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