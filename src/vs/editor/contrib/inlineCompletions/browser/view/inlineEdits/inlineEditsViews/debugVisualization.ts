/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IReader, derived } from '../../../../../../../base/common/observable.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';

export interface IVisualizationEffect {
	visualize(): IDisposable;
}

export function setVisualization(data: object, visualization: IVisualizationEffect): void {
	// eslint-disable-next-line local/code-no-any-casts
	(data as any)['$$visualization'] = visualization;
}

export function debugLogRects(rects: Record<string, Rect> | Rect[], elem: HTMLElement): object {
	if (Array.isArray(rects)) {
		const record: Record<string, Rect> = {};
		rects.forEach((rect, index) => {
			record[index.toString()] = rect;
		});
		rects = record;
	}

	setVisualization(rects, new ManyRectVisualizer(rects, elem));
	return rects;
}

export function debugLogRect(rect: Rect, elem: HTMLElement, name: string): Rect {
	setVisualization(rect, new HtmlRectVisualizer(rect, elem, name));
	return rect;
}

export function debugLogHorizontalOffsetRange(rect: Rect, elem: HTMLElement, name: string): Rect {
	setVisualization(rect, new HtmlHorizontalOffsetRangeVisualizer(rect, elem, name, 0, 'above'));
	return rect;
}

export function debugLogHorizontalOffsetRanges(rects: Record<string, Rect> | Rect[], elem: HTMLElement): object {
	if (Array.isArray(rects)) {
		const record: Record<string, Rect> = {};
		rects.forEach((rect, index) => {
			record[index.toString()] = rect;
		});
		rects = record;
	}

	setVisualization(rects, new ManyHorizontalOffsetRangeVisualizer(rects, elem));
	return rects;
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

class ManyHorizontalOffsetRangeVisualizer implements IVisualizationEffect {
	constructor(
		private readonly _rects: Record<string, Rect>,
		private readonly _elem: HTMLElement
	) { }

	visualize(): IDisposable {
		const d: IDisposable[] = [];
		const keys = Object.keys(this._rects);
		keys.forEach((key, index) => {
			// Stagger labels: odd indices go above, even indices go below
			const labelPosition = index % 2 === 0 ? 'above' : 'below';
			const v = new HtmlHorizontalOffsetRangeVisualizer(this._rects[key], this._elem, key, index * 12, labelPosition);
			d.push(v.visualize());
		});

		return {
			dispose: () => {
				d.forEach(d => d.dispose());
			}
		};
	}
}

class HtmlHorizontalOffsetRangeVisualizer implements IVisualizationEffect {
	constructor(
		private readonly _rect: Rect,
		private readonly _elem: HTMLElement,
		private readonly _name: string,
		private readonly _verticalOffset: number = 0,
		private readonly _labelPosition: 'above' | 'below' = 'above'
	) { }

	visualize(): IDisposable {
		const container = document.createElement('div');
		container.style.position = 'fixed';
		container.style.pointerEvents = 'none';
		container.style.zIndex = '100000';

		// Create horizontal line
		const horizontalLine = document.createElement('div');
		horizontalLine.style.position = 'absolute';
		horizontalLine.style.height = '2px';
		horizontalLine.style.backgroundColor = 'green';
		horizontalLine.style.top = '50%';
		horizontalLine.style.transform = 'translateY(-50%)';

		// Create start vertical bar
		const startBar = document.createElement('div');
		startBar.style.position = 'absolute';
		startBar.style.width = '2px';
		startBar.style.height = '8px';
		startBar.style.backgroundColor = 'green';
		startBar.style.left = '0';
		startBar.style.top = '50%';
		startBar.style.transform = 'translateY(-50%)';

		// Create end vertical bar
		const endBar = document.createElement('div');
		endBar.style.position = 'absolute';
		endBar.style.width = '2px';
		endBar.style.height = '8px';
		endBar.style.backgroundColor = 'green';
		endBar.style.right = '0';
		endBar.style.top = '50%';
		endBar.style.transform = 'translateY(-50%)';

		// Create label
		const label = document.createElement('div');
		label.textContent = this._name;
		label.style.position = 'absolute';

		// Position label above or below the line to avoid overlaps
		if (this._labelPosition === 'above') {
			label.style.bottom = '12px';
		} else {
			label.style.top = '12px';
		}

		label.style.left = '2px'; // Slight offset from start
		label.style.color = 'green';
		label.style.fontSize = '10px';
		label.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
		label.style.padding = '1px 3px';
		label.style.border = '1px solid green';
		label.style.borderRadius = '2px';
		label.style.whiteSpace = 'nowrap';
		label.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
		label.style.fontFamily = 'monospace';

		container.appendChild(horizontalLine);
		container.appendChild(startBar);
		container.appendChild(endBar);
		container.appendChild(label);

		const updatePosition = () => {
			const elemRect = this._elem.getBoundingClientRect();
			const centerY = this._rect.top + (this._rect.height / 2) + this._verticalOffset;
			const left = elemRect.left + this._rect.left;
			const width = this._rect.width;

			container.style.left = left + 'px';
			container.style.top = (elemRect.top + centerY) + 'px';
			container.style.width = width + 'px';
			container.style.height = '8px';

			horizontalLine.style.width = width + 'px';
		};

		// This is for debugging only
		// eslint-disable-next-line no-restricted-syntax
		document.body.appendChild(container);
		updatePosition();

		const observer = new ResizeObserver(updatePosition);
		observer.observe(this._elem);

		return {
			dispose: () => {
				observer.disconnect();
				container.remove();
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
		div.style.boxSizing = 'border-box';
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
	derived({ name: 'debugReadDisposable' }, (_reader) => {
		_reader.store.add(d);
		return undefined;
	}).read(reader);
}
