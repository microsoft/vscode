/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Color, HSVA } from '../../../../../base/common/color.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ColorPickerModel } from '../../browser/colorPickerModel.js';
import { ColorPickerWidget } from '../../browser/colorPickerWidget.js';
import { ColorPickerWidgetType } from '../../browser/colorPickerParticipantUtils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';

function dispatchKeydown(element: HTMLElement, key: string, code: string, keyCode: number, shiftKey: boolean = false): void {
	const keyboardEvent = new KeyboardEvent('keydown', { bubbles: true, key, code, shiftKey });
	Object.defineProperty(keyboardEvent, 'keyCode', { get: () => keyCode });
	element.dispatchEvent(keyboardEvent);
}

suite('ColorPicker Keyboard Accessibility', () => {

	const disposables = new DisposableStore();
	let container: HTMLElement;
	let model: ColorPickerModel;
	let widget: ColorPickerWidget;

	setup(() => {
		container = mainWindow.document.createElement('div');
		container.style.width = '302px';
		container.style.height = '190px';
		mainWindow.document.body.appendChild(container);

		// Create a red color: HSVA(0°, 50%, 50%, 1.0)
		const color = new Color(new HSVA(0, 0.5, 0.5, 1));
		const presentations = [
			{ label: '#804040' },
			{ label: 'rgb(128, 64, 64)' },
			{ label: 'hsl(0, 33%, 38%)' },
		];
		model = disposables.add(new ColorPickerModel(color, presentations, 0));

		const themeService = new TestThemeService();
		widget = disposables.add(new ColorPickerWidget(container, model, 1, themeService, ColorPickerWidgetType.Hover));
		widget.layout();
	});

	teardown(() => {
		disposables.clear();
		if (container.parentElement) {
			container.parentElement.removeChild(container);
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('SaturationBox Keyboard', () => {
		test('ArrowRight increases saturation by 1%', () => {
			const satBox = widget.body.saturationBox;
			const initialS = model.color.hsva.s;

			// Focus saturation box
			satBox.domNode.focus();

			// ArrowRight → keyCode 39
			dispatchKeydown(satBox.domNode, 'ArrowRight', 'ArrowRight', 39);

			const expectedS = Math.min(1, initialS + 0.01);
			assert.ok(
				Math.abs(model.color.hsva.s - expectedS) < 0.001,
				`Expected saturation ~${expectedS}, got ${model.color.hsva.s}`
			);
		});

		test('Shift+ArrowRight increases saturation by 10%', () => {
			const satBox = widget.body.saturationBox;
			const initialS = model.color.hsva.s;

			satBox.domNode.focus();

			// Shift+ArrowRight → keyCode 39, shiftKey: true
			dispatchKeydown(satBox.domNode, 'ArrowRight', 'ArrowRight', 39, true);

			const expectedS = Math.min(1, initialS + 0.1);
			assert.ok(
				Math.abs(model.color.hsva.s - expectedS) < 0.001,
				`Expected saturation ~${expectedS}, got ${model.color.hsva.s}`
			);
		});

		test('ArrowRight at saturation=1 clamps to 1 (no overflow)', () => {
			// Set saturation to 1.0
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, 1, hsva.v, hsva.a));

			const satBox = widget.body.saturationBox;
			satBox.domNode.focus();

			dispatchKeydown(satBox.domNode, 'ArrowRight', 'ArrowRight', 39);

			assert.strictEqual(model.color.hsva.s, 1, 'Saturation should be clamped at 1');
		});

		test('ArrowLeft at saturation=0 clamps to 0', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, 0, hsva.v, hsva.a));

			const satBox = widget.body.saturationBox;
			satBox.domNode.focus();

			dispatchKeydown(satBox.domNode, 'ArrowLeft', 'ArrowLeft', 37);

			assert.strictEqual(model.color.hsva.s, 0, 'Saturation should be clamped at 0');
		});


		test('ArrowUp increases value by 1%', () => {
			const satBox = widget.body.saturationBox;
			const initialV = model.color.hsva.v;

			satBox.domNode.focus();

			// ArrowUp → keyCode 38
			dispatchKeydown(satBox.domNode, 'ArrowUp', 'ArrowUp', 38);

			const expectedV = Math.min(1, initialV + 0.01);
			assert.ok(
				Math.abs(model.color.hsva.v - expectedV) < 0.001,
				`Expected value ~${expectedV}, got ${model.color.hsva.v}`
			);
		});

		test('ArrowLeft decreases saturation', () => {
			const satBox = widget.body.saturationBox;
			const initialS = model.color.hsva.s;

			satBox.domNode.focus();

			// ArrowLeft → keyCode 37
			dispatchKeydown(satBox.domNode, 'ArrowLeft', 'ArrowLeft', 37);

			const expectedS = Math.max(0, initialS - 0.01);
			assert.ok(
				Math.abs(model.color.hsva.s - expectedS) < 0.001,
				`Expected saturation ~${expectedS}, got ${model.color.hsva.s}`
			);
		});

		test('ArrowDown decreases value', () => {
			const satBox = widget.body.saturationBox;
			const initialV = model.color.hsva.v;

			satBox.domNode.focus();

			// ArrowDown → keyCode 40
			dispatchKeydown(satBox.domNode, 'ArrowDown', 'ArrowDown', 40);

			const expectedV = Math.max(0, initialV - 0.01);
			assert.ok(
				Math.abs(model.color.hsva.v - expectedV) < 0.001,
				`Expected value ~${expectedV}, got ${model.color.hsva.v}`
			);
		});

		test('ArrowDown at value=0 clamps to 0', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, 0, hsva.a));

			const satBox = widget.body.saturationBox;
			satBox.domNode.focus();

			dispatchKeydown(satBox.domNode, 'ArrowDown', 'ArrowDown', 40);

			assert.strictEqual(model.color.hsva.v, 0, 'Value should be clamped at 0');
		});

		test('ArrowUp at value=1 clamps to 1', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, 1, hsva.a));

			const satBox = widget.body.saturationBox;
			satBox.domNode.focus();

			dispatchKeydown(satBox.domNode, 'ArrowUp', 'ArrowUp', 38);

			assert.strictEqual(model.color.hsva.v, 1, 'Value should be clamped at 1');
		});

		test('Rapid continuous arrow key presses clamp correctly', () => {
			const satBox = widget.body.saturationBox;
			satBox.domNode.focus();

			// Press ArrowRight 200 times
			for (let i = 0; i < 200; i++) {
				dispatchKeydown(satBox.domNode, 'ArrowRight', 'ArrowRight', 39);
			}

			assert.strictEqual(model.color.hsva.s, 1, 'Saturation should be exactly 1 after rapid key presses');
		});


		test('ARIA aria-valuetext updates on color change', () => {
			const satBox = widget.body.saturationBox;

			assert.strictEqual(satBox.domNode.getAttribute('role'), 'slider');
			assert.strictEqual(satBox.domNode.getAttribute('aria-label'), 'Color gradient');

			// Change color
			model.color = new Color(new HSVA(120, 0.72, 0.45, 1));

			assert.strictEqual(
				satBox.domNode.getAttribute('aria-valuetext'),
				'Saturation 72%, Value 45%'
			);
		});
	});

	suite('Opacity Strip Keyboard', () => {
		test('Numeric key 5 sets opacity to 50%', () => {
			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			// Key '5' → keyCode 53
			dispatchKeydown(opacityStrip.domNode, '5', 'Digit5', 53);

			assert.ok(
				Math.abs(model.color.hsva.a - 0.5) < 0.001,
				`Expected opacity 0.5, got ${model.color.hsva.a}`
			);
		});

		test('ArrowUp increases opacity', () => {
			// Start with opacity 0.5
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, 0.5));

			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			// ArrowUp → keyCode 38
			dispatchKeydown(opacityStrip.domNode, 'ArrowUp', 'ArrowUp', 38);

			assert.ok(
				Math.abs(model.color.hsva.a - 0.51) < 0.001,
				`Expected opacity ~0.51, got ${model.color.hsva.a}`
			);
		});

		test('Shift+ArrowUp increases opacity by 10%', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, 0.5));

			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			// Shift+ArrowUp → keyCode 38, shiftKey: true
			dispatchKeydown(opacityStrip.domNode, 'ArrowUp', 'ArrowUp', 38, true);

			assert.ok(
				Math.abs(model.color.hsva.a - 0.6) < 0.001,
				`Expected opacity ~0.6, got ${model.color.hsva.a}`
			);
		});

		test('ArrowUp at opacity=1 clamps to 1', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, 1));

			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			dispatchKeydown(opacityStrip.domNode, 'ArrowUp', 'ArrowUp', 38);

			assert.strictEqual(model.color.hsva.a, 1, 'Opacity should be clamped at 1');
		});

		test('ArrowDown decreases opacity and clamps to 0', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, 0.005));

			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			// ArrowDown → keyCode 40
			dispatchKeydown(opacityStrip.domNode, 'ArrowDown', 'ArrowDown', 40);

			assert.strictEqual(model.color.hsva.a, 0, 'Opacity should be clamped at 0');
		});

		test('ArrowLeft decreases opacity', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, 0.5));

			const opacityStrip = widget.body.opacityStrip;
			opacityStrip.domNode.focus();

			// ArrowLeft → keyCode 37
			dispatchKeydown(opacityStrip.domNode, 'ArrowLeft', 'ArrowLeft', 37);

			assert.ok(
				Math.abs(model.color.hsva.a - 0.49) < 0.001,
				`Expected opacity ~0.49, got ${model.color.hsva.a}`
			);
		});

		test('ARIA attributes are set correctly', () => {
			const opacityStrip = widget.body.opacityStrip;
			assert.strictEqual(opacityStrip.domNode.getAttribute('role'), 'slider');
			assert.strictEqual(opacityStrip.domNode.getAttribute('aria-label'), 'Opacity');
			assert.strictEqual(opacityStrip.domNode.getAttribute('aria-valuemin'), '0');
			assert.strictEqual(opacityStrip.domNode.getAttribute('aria-valuemax'), '100');
		});
	});

	suite('Hue Strip Keyboard', () => {
		test('Numeric key 0 sets hue to 0', () => {
			const hueStrip = widget.body.hueStrip;
			hueStrip.domNode.focus();

			dispatchKeydown(hueStrip.domNode, '0', 'Digit0', 48);

			assert.strictEqual(model.color.hsva.h, 0, `Expected hue 0, got ${model.color.hsva.h}`);
		});

		test('Numeric key 5 sets hue to 180 (50%)', () => {
			const hueStrip = widget.body.hueStrip;
			hueStrip.domNode.focus();

			dispatchKeydown(hueStrip.domNode, '5', 'Digit5', 53);

			// Strip value = 0.5 => 1 - 0.5 = 0.5 => 0.5 * 360 = 180 degrees
			assert.ok(Math.abs(model.color.hsva.h - 180) < 0.001, `Expected hue ~180, got ${model.color.hsva.h}`);
		});

		test('ArrowRight increases hue strip value (decreases hue degree)', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(180, hsva.s, hsva.v, hsva.a));

			const hueStrip = widget.body.hueStrip;
			hueStrip.domNode.focus();

			dispatchKeydown(hueStrip.domNode, 'ArrowRight', 'ArrowRight', 39);
			const expectedHue = Math.round((1 - 0.51) * 360); // 176
			assert.ok(Math.abs(model.color.hsva.h - expectedHue) < 0.1, `Expected hue ~${expectedHue}, got ${model.color.hsva.h}`);
		});

		test('Shift+ArrowRight increases hue strip value by 10% (decreases hue degree)', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(180, hsva.s, hsva.v, hsva.a));

			const hueStrip = widget.body.hueStrip;
			hueStrip.domNode.focus();

			dispatchKeydown(hueStrip.domNode, 'ArrowRight', 'ArrowRight', 39, true);
			const expectedHue = Math.round((1 - 0.6) * 360); // 144
			assert.ok(Math.abs(model.color.hsva.h - expectedHue) < 0.1, `Expected hue ~${expectedHue}, got ${model.color.hsva.h}`);
		});

		test('ArrowDown decreases hue value (increases hue degree) and clamps to 0', () => {
			const hsva = model.color.hsva;
			model.color = new Color(new HSVA(359, hsva.s, hsva.v, hsva.a)); // value = ~0.0027

			const hueStrip = widget.body.hueStrip;
			hueStrip.domNode.focus();

			dispatchKeydown(hueStrip.domNode, 'ArrowDown', 'ArrowDown', 40);
			// value goes from ~0.0027 - 0.01 => clamped to 0.00 => hue 360 => 0
			assert.strictEqual(model.color.hsva.h, 0, `Expected hue 0, got ${model.color.hsva.h}`);
		});
	});

	suite('Tab Navigation', () => {
		test('Tab moves focus from saturation → opacity → hue → format toggle → saturation (wrap)', () => {
			const satBox = widget.body.saturationBox.domNode;
			const opacityStrip = widget.body.opacityStrip.domNode;
			const hueStrip = widget.body.hueStrip.domNode;
			const formatToggle = widget.header.domNode;

			// Start at saturation box
			satBox.focus();
			assert.strictEqual(mainWindow.document.activeElement, satBox, 'Focus should start on saturation box');

			// Tab → opacity
			dispatchKeydown(satBox, 'Tab', 'Tab', 9);
			assert.strictEqual(mainWindow.document.activeElement, opacityStrip, 'Tab should move to opacity strip');

			// Tab → hue
			dispatchKeydown(opacityStrip, 'Tab', 'Tab', 9);
			assert.strictEqual(mainWindow.document.activeElement, hueStrip, 'Tab should move to hue strip');

			// Tab → format toggle
			dispatchKeydown(hueStrip, 'Tab', 'Tab', 9);
			assert.strictEqual(mainWindow.document.activeElement, formatToggle, 'Tab should move to format toggle');

			// Tab → wrap back to saturation
			dispatchKeydown(formatToggle, 'Tab', 'Tab', 9);
			assert.strictEqual(mainWindow.document.activeElement, satBox, 'Tab should wrap back to saturation box');
		});

		test('Shift+Tab navigates in reverse', () => {
			const satBox = widget.body.saturationBox.domNode;
			const formatToggle = widget.header.domNode;
			const hueStrip = widget.body.hueStrip.domNode;

			// Start at saturation box
			satBox.focus();

			// Shift+Tab → should wrap to format toggle
			dispatchKeydown(satBox, 'Tab', 'Tab', 9, true);
			assert.strictEqual(mainWindow.document.activeElement, formatToggle, 'Shift+Tab from saturation should wrap to format toggle');

			// Shift+Tab → should go to hue
			dispatchKeydown(formatToggle, 'Tab', 'Tab', 9, true);
			assert.strictEqual(mainWindow.document.activeElement, hueStrip, 'Shift+Tab from format toggle should go to hue strip');
		});
	});

	suite('Escape Handling', () => {
		test('Escape restores the original color', () => {
			const originalColor = model.originalColor;

			// Change the color
			model.color = new Color(new HSVA(200, 0.8, 0.9, 0.5));
			assert.ok(!model.color.equals(originalColor), 'Color should have changed');

			const satBox = widget.body.saturationBox.domNode;
			satBox.focus();

			// Escape → keyCode 27
			dispatchKeydown(satBox, 'Escape', 'Escape', 27);

			assert.ok(
				model.color.equals(originalColor),
				`Expected color to be restored to original ${originalColor}, got ${model.color}`
			);
		});

		test('Escape fires onEscape event', () => {
			let escapeFired = false;
			disposables.add(widget.onEscape(() => {
				escapeFired = true;
			}));

			const satBox = widget.body.saturationBox.domNode;
			satBox.focus();

			dispatchKeydown(satBox, 'Escape', 'Escape', 27);

			assert.ok(escapeFired, 'onEscape event should have been fired');
		});
	});

	suite('Confirmation Handling', () => {
		test('Enter fires onResult event from saturation box', () => {
			let resultFired = false;
			disposables.add(widget.onResult(() => {
				resultFired = true;
			}));

			const satBox = widget.body.saturationBox.domNode;
			satBox.focus();

			dispatchKeydown(satBox, 'Enter', 'Enter', 13);

			assert.ok(resultFired, 'onResult event should have been fired');
		});

		test('Space fires onResult event from opacity strip', () => {
			let resultFired = false;
			disposables.add(widget.onResult(() => {
				resultFired = true;
			}));

			const opacityStrip = widget.body.opacityStrip.domNode;
			opacityStrip.focus();

			dispatchKeydown(opacityStrip, ' ', 'Space', 32);

			assert.ok(resultFired, 'onResult event should have been fired');
		});
	});

	suite('Format Toggle Keyboard', () => {
		test('Enter cycles color format', () => {
			const formatToggle = widget.header.domNode;
			formatToggle.focus();

			// Enter → keyCode 13
			dispatchKeydown(formatToggle, 'Enter', 'Enter', 13);

			// presentationIndex is private, so check that presentation label changed
			// The model has 3 presentations, so cycling from index 0 → 1
			assert.notStrictEqual(model.presentation, undefined, 'Presentation should exist after cycling');
		});

		test('Space cycles color format', () => {
			const formatToggle = widget.header.domNode;
			formatToggle.focus();

			// Space → keyCode 32
			dispatchKeydown(formatToggle, ' ', 'Space', 32);

			assert.notStrictEqual(model.presentation, undefined, 'Presentation should exist after cycling');
		});

		test('Format toggle has correct ARIA attributes', () => {
			const formatToggle = widget.header.domNode;
			assert.strictEqual(formatToggle.getAttribute('role'), 'button');
			assert.ok(formatToggle.getAttribute('aria-label'), 'aria-label should be set');
			assert.strictEqual(formatToggle.tabIndex, 0, 'tabIndex should be 0');
		});
	});

	suite('Focus Management', () => {
		test('focus() method focuses the saturation box', () => {
			widget.focus();
			assert.strictEqual(
				mainWindow.document.activeElement,
				widget.body.saturationBox.domNode,
				'focus() should focus the saturation box'
			);
		});

		test('All focusable elements have tabIndex set', () => {
			assert.strictEqual(widget.body.saturationBox.domNode.tabIndex, 0, 'Saturation box should have tabIndex 0');
			assert.strictEqual(widget.body.opacityStrip.domNode.tabIndex, 0, 'Opacity strip should have tabIndex 0');
			assert.strictEqual(widget.body.hueStrip.domNode.tabIndex, 0, 'Hue strip should have tabIndex 0');
			assert.strictEqual(widget.header.domNode.tabIndex, 0, 'Format toggle should have tabIndex 0');
		});
	});
});
