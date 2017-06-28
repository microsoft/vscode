/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
const $ = dom.$;

export class ColorPickerBody {

	private domNode: HTMLElement;

	constructor(private widget: ColorPickerWidget, width: number) {

		const slidersWidth = 25;
		const padding = 8;
		const selectionBoxHeight = width - (slidersWidth * 2) - (padding * 4);

		this.domNode = $('.colorpicker-body');
		this.domNode.style.padding = `${padding}px`;
		this.domNode.style.display = 'flex';
		dom.append(widget.getDomNode(), this.domNode);

		// Draw shade selection box
		this.drawShadeSelectionBox(selectionBoxHeight);

		// Draw sliders
		this.drawPickerSliders(slidersWidth, selectionBoxHeight);

	}

	private drawShadeSelectionBox(widthAndHeight: number): void {
		let shadeSelectionBox = $('.shadeBox');

		// draw canvas
		// const pixelRatio = this.widget.editor.getConfiguration().pixelRatio;


		shadeSelectionBox.style.backgroundColor = 'black';
		shadeSelectionBox.style.width = widthAndHeight + 'px';
		shadeSelectionBox.style.height = widthAndHeight + 'px';
		dom.append(this.domNode, shadeSelectionBox);
	}

	private drawPickerSliders(width: number, height: number): void {
		const widthVal = width + 'px';
		const heightVal = height + 'px';
		const marginLeft = '8px';

		let opacitySlider = $('.opacity-slider');
		opacitySlider.style.backgroundColor = 'black';
		opacitySlider.style.height = heightVal;
		opacitySlider.style.width = widthVal;
		opacitySlider.style.marginLeft = marginLeft;
		dom.append(this.domNode, opacitySlider);

		let colorSlider = $('.color-slider');
		colorSlider.style.backgroundColor = 'black';
		colorSlider.style.height = heightVal;
		colorSlider.style.width = widthVal;
		colorSlider.style.marginLeft = marginLeft;
		dom.append(this.domNode, colorSlider);
	}

}