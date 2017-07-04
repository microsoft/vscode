/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Disposable } from "vs/base/common/lifecycle";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/common/colorPickerModel";
const $ = dom.$;

export class ColorPickerBody extends Disposable {

	private domNode: HTMLElement;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel, widgetWidth: number) {
		super();

		const pixelRatio = this.widget.editor.getConfiguration().pixelRatio;

		const stripsWidth = 25; //px
		const actualStripsWidth = pixelRatio * 25; //px
		const padding = 8; //px

		const satBoxWidth = widgetWidth - (2 * stripsWidth) - (4 * padding);
		const actualSatBoxWidth = pixelRatio * widgetWidth - (2 * actualStripsWidth) - (4 * padding);
		const satBoxHeight = 150;
		const actualSatBoxHeight = pixelRatio * satBoxHeight;

		this.domNode = $('.colorpicker-body');
		this.domNode.style.padding = `${padding}px`;
		dom.append(widget.getDomNode(), this.domNode);

		// Draw saturation selection box
		const satBox = this.drawSaturationBox(satBoxWidth, satBoxHeight, actualSatBoxWidth, actualSatBoxHeight);
		this._register(dom.addDisposableListener(satBox, 'click', e => {
			// View change triggers controller
			console.log('Saturation box clicked');
			this.widget.controller.selectColor();
		}));

		// Draw sliders
		this.drawPickerStrips(stripsWidth, satBoxHeight, actualStripsWidth, actualSatBoxHeight);
	}

	private drawSaturationBox(w: number, h: number, actualW: number, actualH: number): HTMLCanvasElement {
		// Create canvas, draw selected color
		const canvas = document.createElement('canvas');
		canvas.className = 'saturation-box';
		canvas.width = actualW;
		canvas.height = actualH;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';

		const ctx1 = canvas.getContext('2d');
		ctx1.rect(0, 0, actualW, actualH);
		ctx1.fillStyle = this.model.selectedColor;
		ctx1.fillRect(0, 0, actualW, actualH);

		// Create black and white gradients on top
		const ctx2 = document.createElement('canvas').getContext('2d');

		const whiteGradient = ctx2.createLinearGradient(0, 0, actualW, 0);
		whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx1.fillStyle = whiteGradient;
		ctx1.fillRect(0, 0, actualW, actualH);

		const blackGradient = ctx2.createLinearGradient(0, 0, 0, actualH);
		blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
		ctx1.fillStyle = blackGradient;
		ctx1.fillRect(0, 0, actualW, actualH);

		// Append to DOM
		dom.append(this.domNode, canvas);

		return canvas;
	}

	private drawPickerStrips(w: number, h: number, actualW: number, actualH: number): void {
		const widthVal = w + 'px';
		const heightVal = h + 'px';

		// Opacity strip
		const opacityWrapper = $('.opacity-strip-wrap');

		const opacityStrip = document.createElement('canvas');
		opacityStrip.className = 'opacity-strip';
		opacityStrip.width = actualW;
		opacityStrip.height = actualH;
		opacityStrip.style.width = widthVal;
		opacityStrip.style.height = heightVal;
		const opacityStripCtx = opacityStrip.getContext('2d');
		opacityStripCtx.rect(0, 0, actualW, actualH);
		const opacityGradient = opacityStripCtx.createLinearGradient(0, 0, 0, actualH);
		opacityGradient.addColorStop(0, this.model.selectedColor);
		opacityGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		opacityStripCtx.fillStyle = opacityGradient;
		opacityStripCtx.fill();

		dom.append(this.domNode, opacityWrapper);
		dom.append(opacityWrapper, opacityStrip);

		// Hue strip
		const hueStrip = document.createElement('canvas');
		hueStrip.className = 'hue-strip';
		hueStrip.width = actualW;
		hueStrip.height = actualH;
		hueStrip.style.width = widthVal;
		hueStrip.style.height = heightVal;
		const colorStripCtx = hueStrip.getContext('2d');
		colorStripCtx.rect(0, 0, actualW, actualH);
		const colorGradient = colorStripCtx.createLinearGradient(0, 0, 0, actualH);
		colorGradient.addColorStop(0, 'rgba(255, 0, 0, 1)');
		colorGradient.addColorStop(0.17, 'rgba(255, 255, 0, 1)');
		colorGradient.addColorStop(0.34, 'rgba(0, 255, 0, 1)');
		colorGradient.addColorStop(0.51, 'rgba(0, 255, 255, 1)');
		colorGradient.addColorStop(0.68, 'rgba(0, 0, 255, 1)');
		colorGradient.addColorStop(0.85, 'rgba(255, 0, 255, 1)');
		colorGradient.addColorStop(1, 'rgba(255, 0, 0, 1)');
		colorStripCtx.fillStyle = colorGradient;
		colorStripCtx.fill();

		dom.append(this.domNode, hueStrip);
	}

}