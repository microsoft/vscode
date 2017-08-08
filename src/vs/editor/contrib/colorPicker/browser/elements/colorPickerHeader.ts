/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
import { Disposable } from "vs/base/common/lifecycle";
import { Button } from "vs/base/browser/ui/button/button";
const $ = dom.$;

export class ColorPickerHeader extends Disposable {

	public toggleButton: Button;

	private domNode: HTMLElement;
	private pickedColorNode: HTMLElement;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel) {
		super();

		this.domNode = $('.colorpicker-header');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawPickedColorBox();
		this.drawOriginalColorBox();

		dom.addDisposableListener(this.pickedColorNode, dom.EventType.CLICK, () => {
			if (this.model.colorFormatters.length === 0) {
				return;
			}
			this.model.nextColorMode();
		});
	}

	public updatePickedColor() {
		this.pickedColorNode.textContent = this.model.selectedColorString;
		this.pickedColorNode.style.backgroundColor = this.model.color.toString();
	}

	private drawPickedColorBox() {
		this.pickedColorNode = $('.picked-color');
		this.pickedColorNode.style.backgroundColor = this.model.color.toString();
		this.pickedColorNode.textContent = this.model.selectedColorString;
		dom.append(this.domNode, this.pickedColorNode);
	}

	private drawOriginalColorBox() {
		let colorBox = $('.original-color');
		colorBox.style.backgroundColor = this.model.originalColor;
		dom.append(this.domNode, colorBox);
	}
}