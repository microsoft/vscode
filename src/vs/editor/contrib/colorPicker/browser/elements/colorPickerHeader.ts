/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
const $ = dom.$;

export class ColorPickerHeader {

	private domNode: HTMLElement;

	constructor(private widget: ColorPickerWidget) {
		this.domNode = $('.colorpicker-header');
		this.domNode.style.display = 'flex';
		this.domNode.style.height = 110 + 'px';
		dom.append(widget.getDomNode(), this.domNode);

		this.drawOriginalColorBox();
		this.drawPickedColorBox();
		this.drawColorValueArea();
	}

	private drawOriginalColorBox() {
		let colorBox = $('.original-color');
		colorBox.style.backgroundColor = this.widget.originalColor;
		colorBox.style.width = 10 + '%';
		dom.append(this.domNode, colorBox);
	}

	private drawPickedColorBox() {
		let pickedColorBox = $('.picked-color');
		pickedColorBox.style.backgroundColor = this.widget.selectedColor;
		pickedColorBox.style.width = 40 + '%';
		dom.append(this.domNode, pickedColorBox);
	}

	private drawColorValueArea() {
		let colorCode = $('.color-code');
		colorCode.style.backgroundColor = 'black';
		colorCode.style.width = 50 + '%';
		dom.append(this.domNode, colorCode);
	}
}