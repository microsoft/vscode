/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
import { InputBox } from "vs/base/browser/ui/inputbox/inputBox";
import { IContextViewService } from "vs/platform/contextview/browser/contextView";
import { Color, RGBA } from "vs/base/common/color";
const $ = dom.$;

export class ColorPickerHeader {

	private domNode: HTMLElement;
	private pickedColorNode: HTMLElement;

	private inputBox: InputBox;

	constructor(
		private widget: ColorPickerWidget, private model: ColorPickerModel,
		private contextViewService: IContextViewService
	) {
		this.domNode = $('.colorpicker-header');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawPickedColorBox();
		this.drawOriginalColorBox();
	}

	public updatePickedColor() {
		this.inputBox.value = this.model.selectedColor;
		this.pickedColorNode.style.backgroundColor = this.model.selectedColor;
	}

	private drawPickedColorBox() {
		this.pickedColorNode = $('.picked-color');
		this.pickedColorNode.style.backgroundColor = this.model.selectedColor;
		this.pickedColorNode.style.width = 73 + '%';
		dom.append(this.domNode, this.pickedColorNode);

		this.inputBox = new InputBox(this.pickedColorNode, this.contextViewService, {
			flexibleHeight: false,
			inputBackground: Color.fromRGBA(new RGBA(0, 171, 84, 1)) // colour to be parsed from the editor, rather than hardcoded
		});
		this.inputBox.value = this.model.selectedColor;
	}

	private drawOriginalColorBox() {
		let colorBox = $('.original-color');
		colorBox.style.backgroundColor = this.model.originalColor;
		colorBox.style.width = 27 + '%';
		dom.append(this.domNode, colorBox);
	}
}