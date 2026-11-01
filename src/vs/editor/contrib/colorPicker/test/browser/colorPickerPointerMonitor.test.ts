/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { DisposableTracker, setDisposableTracker } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ColorPickerModel } from '../../browser/colorPickerModel.js';
import { ColorPickerWidgetType } from '../../browser/colorPickerParticipantUtils.js';
import { SaturationBox } from '../../browser/colorPickerParts/colorPickerSaturationBox.js';
import { HueStrip, OpacityStrip } from '../../browser/colorPickerParts/colorPickerStrip.js';

suite('Color picker pointer monitors', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let tracker: DisposableTracker;
	let container: HTMLElement;

	setup(() => {
		tracker = new DisposableTracker();
		setDisposableTracker(tracker);
		container = document.createElement('div');
		container.style.cssText = 'width: 200px; height: 200px;';
		document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
		setDisposableTracker(null);
	});

	const controls = [
		{ name: 'saturation box', selector: '.saturation-wrap', create: (element: HTMLElement, model: ColorPickerModel) => new SaturationBox(element, model, 1) },
		{ name: 'hue strip', selector: '.strip', create: (element: HTMLElement, model: ColorPickerModel) => new HueStrip(element, model, ColorPickerWidgetType.Hover) },
		{ name: 'opacity strip', selector: '.strip', create: (element: HTMLElement, model: ColorPickerModel) => new OpacityStrip(element, model, ColorPickerWidgetType.Hover) },
	];

	for (const control of controls) {
		test(`${control.name} releases drag resources after every pointer-up`, () => {
			const model = disposables.add(new ColorPickerModel(Color.red, [], 0));
			const widget = disposables.add(control.create(container, model));
			const target = container.querySelector<HTMLElement>(control.selector)!;
			let flushed = 0;
			disposables.add(widget.onColorFlushed(() => flushed++));
			const initialCount = tracker.getTrackedDisposables().length;

			for (let i = 0; i < 5; i++) {
				target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, buttons: 1 }));
				document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
			}

			assert.deepStrictEqual({ tracked: tracker.getTrackedDisposables().length, flushed }, { tracked: initialCount, flushed: 5 });
		});
	}
});
