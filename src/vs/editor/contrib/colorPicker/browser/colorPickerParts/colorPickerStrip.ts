/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { ColorPickerWidgetType } from '../colorPickerParticipantUtils.js';

const $ = dom.$;

export abstract class Strip extends Disposable {

	protected domNode: HTMLElement;
	protected overlay: HTMLElement;
	protected slider: HTMLElement;
	private height!: number;

	private readonly _onDidChange = new Emitter<number>();
	readonly onDidChange: Event<number> = this._onDidChange.event;

	private readonly _onColorFlushed = new Emitter<void>();
	readonly onColorFlushed: Event<void> = this._onColorFlushed.event;

	constructor(container: HTMLElement, protected model: ColorPickerModel, type: ColorPickerWidgetType) {
		super();
		if (type === ColorPickerWidgetType.Standalone) {
			this.domNode = dom.append(container, $('.standalone-strip'));
			this.overlay = dom.append(this.domNode, $('.standalone-overlay'));
		} else {
			this.domNode = dom.append(container, $('.strip'));
			this.overlay = dom.append(this.domNode, $('.overlay'));
		}
		this.slider = dom.append(this.domNode, $('.slider'));
		this.slider.style.top = `0px`;

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(model.onDidChangeColor(this.onDidChangeColor, this));
		this.layout();
	}

	layout(): void {
		this.height = this.domNode.offsetHeight - this.slider.offsetHeight;

		const value = this.getValue(this.model.color);
		this.updateSliderPosition(value);
	}

	protected onDidChangeColor(color: Color) {
		const value = this.getValue(color);
		this.updateSliderPosition(value);
	}

	private onPointerDown(e: PointerEvent): void {
		if (!e.target || !(e.target instanceof Element)) {
			return;
		}
		const monitor = this._register(new GlobalPointerMoveMonitor());
		const origin = dom.getDomNodePagePosition(this.domNode);
		this.domNode.classList.add('grabbing');

		if (e.target !== this.slider) {
			this.onDidChangeTop(e.offsetY);
		}

		monitor.startMonitoring(e.target, e.pointerId, e.buttons, event => this.onDidChangeTop(event.pageY - origin.top), () => null);

		const pointerUpListener = dom.addDisposableListener(e.target.ownerDocument, dom.EventType.POINTER_UP, () => {
			this._onColorFlushed.fire();
			pointerUpListener.dispose();
			monitor.stopMonitoring(true);
			this.domNode.classList.remove('grabbing');
		}, true);
	}

	private onDidChangeTop(top: number): void {
		const value = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.updateSliderPosition(value);
		this._onDidChange.fire(value);
	}

	private updateSliderPosition(value: number): void {
		this.slider.style.top = `${(1 - value) * this.height}px`;
	}

	protected abstract getValue(color: Color): number;
}

export class OpacityStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerWidgetType) {
		super(container, model, type);
		this.domNode.classList.add('opacity-strip');

		this.onDidChangeColor(this.model.color);
	}

	protected override onDidChangeColor(color: Color): void {
		super.onDidChangeColor(color);
		const { r, g, b } = color.rgba;
		const opaque = new Color(new RGBA(r, g, b, 1));
		const transparent = new Color(new RGBA(r, g, b, 0));

		this.overlay.style.background = `linear-gradient(to bottom, ${opaque} 0%, ${transparent} 100%)`;
	}

	protected getValue(color: Color): number {
		return color.hsva.a;
	}
}

export class HueStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerWidgetType) {
		super(container, model, type);
		this.domNode.classList.add('hue-strip');
	}

	protected getValue(color: Color): number {
		return 1 - (color.hsva.h / 360);
	}
}
