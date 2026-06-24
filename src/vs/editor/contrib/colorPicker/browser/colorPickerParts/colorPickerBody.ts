/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Color, HSVA } from '../../../../../base/common/color.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { SaturationBox } from './colorPickerSaturationBox.js';
import { InsertButton } from './colorPickerInsertButton.js';
import { HueStrip, OpacityStrip, Strip } from './colorPickerStrip.js';
import { ColorPickerWidgetType } from '../colorPickerParticipantUtils.js';

const $ = dom.$;

export class ColorPickerBody extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _saturationBox: SaturationBox;
	private readonly _hueStrip: Strip;
	private readonly _opacityStrip: Strip;
	private readonly _insertButton: InsertButton | null = null;

	constructor(container: HTMLElement, private readonly model: ColorPickerModel, private pixelRatio: number, type: ColorPickerWidgetType) {
		super();

		this._domNode = $('.colorpicker-body');
		dom.append(container, this._domNode);

		this._saturationBox = new SaturationBox(this._domNode, this.model, this.pixelRatio);
		this._register(this._saturationBox);
		this._register(this._saturationBox.onDidChange(this.onDidSaturationValueChange, this));
		this._register(this._saturationBox.onColorFlushed(this.flushColor, this));

		this._opacityStrip = new OpacityStrip(this._domNode, this.model, type);
		this._register(this._opacityStrip);
		this._register(this._opacityStrip.onDidChange(this.onDidOpacityChange, this));
		this._register(this._opacityStrip.onColorFlushed(this.flushColor, this));

		this._hueStrip = new HueStrip(this._domNode, this.model, type);
		this._register(this._hueStrip);
		this._register(this._hueStrip.onDidChange(this.onDidHueChange, this));
		this._register(this._hueStrip.onColorFlushed(this.flushColor, this));

		if (type === ColorPickerWidgetType.Standalone) {
			this._insertButton = this._register(new InsertButton(this._domNode));
			this._domNode.classList.add('standalone-colorpicker');
		}
	}

	private flushColor(): void {
		this.model.flushColor();
	}

	private onDidSaturationValueChange({ s, v }: { s: number; v: number }): void {
		const hsva = this.model.color.hsva;
		this.model.color = new Color(new HSVA(hsva.h, s, v, hsva.a));
	}

	private onDidOpacityChange(a: number): void {
		const hsva = this.model.color.hsva;
		this.model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, a));
	}

	private onDidHueChange(value: number): void {
		const hsva = this.model.color.hsva;
		const h = (1 - value) * 360;

		this.model.color = new Color(new HSVA(h === 360 ? 0 : h, hsva.s, hsva.v, hsva.a));
	}

	get domNode() {
		return this._domNode;
	}

	get saturationBox() {
		return this._saturationBox;
	}

	get opacityStrip() {
		return this._opacityStrip;
	}

	get hueStrip() {
		return this._hueStrip;
	}

	get enterButton() {
		return this._insertButton;
	}

	layout(): void {
		this._saturationBox.layout();
		this._opacityStrip.layout();
		this._hueStrip.layout();
	}
}
