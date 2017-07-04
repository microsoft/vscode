/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/common/colorPickerModel";
const $ = dom.$;

export class ColorPickerHeader {

	private domNode: HTMLElement;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel) {
		this.domNode = $('.colorpicker-header');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawPickedColorBox();
		this.drawOriginalColorBox();
	}

	private drawPickedColorBox() {
		let pickedColorBox = $('.picked-color');
		pickedColorBox.style.backgroundColor = this.model.selectedColor;
		pickedColorBox.style.width = 80 + '%';
		pickedColorBox.textContent = this.model.selectedColor;
		dom.append(this.domNode, pickedColorBox);
	}

	private drawOriginalColorBox() {
		let colorBox = $('.original-color');
		colorBox.style.backgroundColor = this.model.originalColor;
		colorBox.style.width = 20 + '%';
		dom.append(this.domNode, colorBox);
	}
}