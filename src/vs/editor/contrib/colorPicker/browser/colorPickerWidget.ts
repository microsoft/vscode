/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./colorPicker';
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { Widget } from "vs/base/browser/ui/widget";
import * as dom from 'vs/base/browser/dom';
import { onDidChangeZoomLevel } from 'vs/base/browser/browser';
import { ColorPickerHeader } from "vs/editor/contrib/colorPicker/browser/elements/colorPickerHeader";
import { ColorPickerBody } from "vs/editor/contrib/colorPicker/browser/elements/colorPickerBody";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
const $ = dom.$;

export class ColorPickerWidget extends Widget {
	private static ID = 'editor.contrib.colorPickerWidget';

	private domNode: HTMLElement;
	public header: ColorPickerHeader;
	public body: ColorPickerBody;

	public visible: boolean = false;

	constructor(public model: ColorPickerModel, public editor: ICodeEditor) {
		super();
		this._register(onDidChangeZoomLevel(() => this.layout()));
		this.domNode = $('.editor-widget.colorpicker-widget');
	}

	public layout(): void {
		if (this.visible) {
			return;
		}

		this.header = new ColorPickerHeader(this, this.model);
		this.body = new ColorPickerBody(this, this.model);

		this.visible = true;
	}

	public layoutSaturationBox(): void {
		this.body.saturationBox.layout();
	}

	public dispose(): void {
		this.visible = false;
		this.domNode = null;
		super.dispose();
	}

	public getId(): string {
		return ColorPickerWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}
}