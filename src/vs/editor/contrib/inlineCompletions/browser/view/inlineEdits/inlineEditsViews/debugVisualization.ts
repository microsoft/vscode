/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IReader, derivedWithStore } from '../../../../../../../base/common/observable.js';
import { Rect } from '../../../../../../browser/rect.js';

export interface IVisualizationEffect {
	visualize(): IDisposable;
}

export function setVisualization(data: object, visualization: IVisualizationEffect): void {
	(data as any)['$$visualization'] = visualization;
}

export function debugLogRects(rects: Record<string, Rect>, elem: HTMLElement): object {
	setVisualization(rects, new ManyRectVisualizer(rects, elem));
	return rects;
}

export function debugLogRect(rect: Rect, elem: HTMLElement, name: string): Rect {
	setVisualization(rect, new HtmlRectVisualizer(rect, elem, name));
	return rect;
}

class ManyRectVisualizer implements IVisualizationEffect {
	constructor(
		private readonly _rects: Record<string, Rect>,
		private readonly _elem: HTMLElement
	) { }

	visualize(): IDisposable {
		const d: IDisposable[] = [];
		for (const key in this._rects) {
			const v = new HtmlRectVisualizer(this._rects[key], this._elem, key);
			d.push(v.visualize());
		}

		return {
			dispose: () => {
				d.forEach(d => d.dispose());
			}
		};
	}
}

class HtmlRectVisualizer implements IVisualizationEffect {
	constructor(
		private readonly _rect: Rect,
		private readonly _elem: HTMLElement,
		private readonly _name: string
	) { }

	visualize(): IDisposable {
		const div = document.createElement('div');
		div.style.position = 'fixed';
		div.style.border = '1px solid red';
		div.style.pointerEvents = 'none';
		div.style.zIndex = '100000';

		const label = document.createElement('div');
		label.textContent = this._name;
		label.style.position = 'absolute';
		label.style.top = '-20px';
		label.style.left = '0';
		label.style.color = 'red';
		label.style.fontSize = '12px';
		label.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
		div.appendChild(label);

		const updatePosition = () => {
			const elemRect = this._elem.getBoundingClientRect();
			console.log(elemRect);
			div.style.left = (elemRect.left + this._rect.left) + 'px';
			div.style.top = (elemRect.top + this._rect.top) + 'px';
			div.style.width = this._rect.width + 'px';
			div.style.height = this._rect.height + 'px';
		};

		// This is for debugging only
		// eslint-disable-next-line no-restricted-syntax
		document.body.appendChild(div);
		updatePosition();

		const observer = new ResizeObserver(updatePosition);
		observer.observe(this._elem);

		return {
			dispose: () => {
				observer.disconnect();
				div.remove();
			}
		};
	}
}

export function debugView(value: unknown, reader: IReader): void {
	if (typeof value === 'object' && value && '$$visualization' in value) {
		const vis = value['$$visualization'] as IVisualizationEffect;
		debugReadDisposable(vis.visualize(), reader);
	}
}

function debugReadDisposable(d: IDisposable, reader: IReader): void {
	derivedWithStore((_reader, store) => {
		store.add(d);
		return undefined;
	}).read(reader);
}
