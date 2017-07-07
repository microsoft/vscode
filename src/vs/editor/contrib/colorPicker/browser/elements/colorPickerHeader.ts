/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
const $ = dom.$;

export class ColorPickerHeader {

	private domNode: HTMLElement;
	private pickedColorNode: HTMLElement;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel) {
		this.domNode = $('.colorpicker-header');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawPickedColorBox();
		this.drawOriginalColorBox();
	}

	public updatePickedColor() {
		this.pickedColorNode.textContent = this.model.selectedColor;
		this.pickedColorNode.style.backgroundColor = this.model.selectedColor;
	}

	private drawPickedColorBox() {
		this.pickedColorNode = $('.picked-color');
		this.pickedColorNode.style.backgroundColor = this.model.selectedColor;
		this.pickedColorNode.textContent = this.model.selectedColor;
		dom.append(this.domNode, this.pickedColorNode);
	}

	private drawOriginalColorBox() {
		let colorBox = $('.original-color');
		colorBox.style.backgroundColor = this.model.originalColor;
		dom.append(this.domNode, colorBox);
	}
}