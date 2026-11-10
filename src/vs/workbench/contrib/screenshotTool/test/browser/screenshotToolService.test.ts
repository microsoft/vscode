/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { createScreenshotToolImage, SCREENSHOT_TOOL_ENABLED_SETTING_ID, ScreenshotToolEntryPoint, ScreenshotToolResult, ScreenshotToolSurface } from '../../browser/screenshotTool.js';
import { resolveScreenshotSelection } from '../../browser/screenshotSelection.js';
import { ScreenshotToolService } from '../../browser/screenshotToolService.js';
import { TestScreenshotToolTelemetryService } from './screenshotToolTestUtils.js';

suite('ScreenshotTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a press without travel is a click and a drag is an area clamped to the window', () => {
		const bounds = { width: 800, height: 600 };
		assert.deepStrictEqual([
			resolveScreenshotSelection({ x: 100, y: 100 }, { x: 103, y: 97 }, bounds),
			resolveScreenshotSelection({ x: 300, y: 200 }, { x: 100, y: 120 }, bounds),
			resolveScreenshotSelection({ x: 700, y: 500 }, { x: 900, y: 700 }, bounds),
			resolveScreenshotSelection({ x: 790, y: 590 }, { x: 900, y: 700 }, bounds),
		], [
			{ kind: 'click', x: 100, y: 100 },
			{ kind: 'area', rect: { x: 100, y: 120, width: 200, height: 80 } },
			{ kind: 'area', rect: { x: 700, y: 500, width: 100, height: 100 } },
			{ kind: 'area', rect: { x: 790, y: 590, width: 10, height: 10 } },
		]);
	});

	suite('service', () => {

		class TestAccessibility extends TestAccessibilityService {
			readonly messages: string[] = [];
			override status(message: string): void { this.messages.push(message); }
			override alert(message: string): void { this.messages.push(message); }
		}

		function createImage(width: number, height: number, color: string): VSBuffer {
			const canvas = $<HTMLCanvasElement>('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d')!;
			context.fillStyle = color;
			context.fillRect(0, 0, width, height);
			return decodeBase64(canvas.toDataURL('image/png').split(',')[1]);
		}

		function createService(options: { enabled?: boolean; supported?: boolean } = {}) {
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			const telemetry = new TestScreenshotToolTelemetryService();
			const accessibility = new TestAccessibility();
			const captures: (Window | undefined)[] = [];
			const focusedWindows: Window[] = [];
			const windowImage = createImage(mainWindow.innerWidth, mainWindow.innerHeight, '#0000ff');
			const service = store.add(new class extends ScreenshotToolService {
				protected override get isSupported(): boolean { return options.supported ?? true; }
			}(
				new TestConfigurationService({ [SCREENSHOT_TOOL_ENABLED_SETTING_ID]: options.enabled ?? true }),
				telemetry,
				new class extends mock<IHostService>() {
					override async getScreenshot(_rect?: unknown, targetWindow?: Window) {
						captures.push(targetWindow);
						return windowImage;
					}
					override async focus(targetWindow: Window) {
						focusedWindows.push(targetWindow);
					}
				}(),
				new class extends mock<IWorkbenchLayoutService>() {
					override getContainer() { return container; }
				}(),
				accessibility,
				new MockKeybindingService(),
				new MockContextKeyService(),
				new NullLogService(),
			));
			return { service, telemetry, accessibility, container, captures, focusedWindows };
		}

		function getOverlay(container: HTMLElement): HTMLElement {
			return container.querySelector<HTMLElement>('.screenshot-tool-overlay')!;
		}

		function pointer(element: HTMLElement, type: string, x: number, y: number): void {
			element.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
		}

		function key(element: HTMLElement, keyName: string, keyCode: number): void {
			element.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, keyCode, bubbles: true, cancelable: true }));
		}

		function summarize(result: ScreenshotToolResult) {
			return result.kind === 'captured'
				? { kind: result.kind, mode: result.mode, size: `${result.image.width}x${result.image.height}`, includesLayerContent: result.includesLayerContent }
				: result;
		}

		/** Waits until the edit dialog has loaded its screenshot, which sizes its canvas. */
		async function waitForDialog(container: HTMLElement): Promise<HTMLElement> {
			const dialog = container.querySelector<HTMLElement>('.screenshot-annotation-editor')!;
			const canvas = dialog.querySelector('canvas')!;
			if (!canvas.style.width) {
				const sized = new DeferredPromise<void>();
				const observer = new MutationObserver(() => {
					if (canvas.style.width) {
						void sized.complete();
					}
				});
				observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
				await sized.p;
				observer.disconnect();
			}
			return dialog;
		}

		test('logs the experiment trigger in both arms before reading the setting, and nothing where unsupported', () => {
			const arms = [{ enabled: false }, { enabled: true }, { enabled: true, supported: false }].map(options => {
				const { service, telemetry } = createService(options);
				const usesTool = service.shouldUseTool();
				service.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAddContext, outcome: 'attached', mode: 'window', durationMs: 5, usedTool: usesTool });
				return { usesTool, triggers: telemetry.triggers, captures: telemetry.captures };
			});
			assert.deepStrictEqual(arms, [
				{ usesTool: false, triggers: ['config.workbench.screenshotTool.enabled'], captures: [{ entryPoint: 'chatAddContext', outcome: 'attached', mode: 'window', usedTool: false }] },
				{ usesTool: true, triggers: ['config.workbench.screenshotTool.enabled'], captures: [{ entryPoint: 'chatAddContext', outcome: 'attached', mode: 'window', usedTool: true }] },
				{ usesTool: false, triggers: [], captures: [] },
			]);
		});

		test('a click captures the target window, which is attached without another step', async () => {
			const { service, container, captures, accessibility } = createService();
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 20, 20);
			pointer(overlay, 'pointerup', 22, 21);
			assert.deepStrictEqual({ result: summarize(await result), captures, overlay: overlay.isConnected, editors: container.querySelectorAll('.screenshot-annotation-editor').length, announced: accessibility.messages.at(-1) }, {
				result: { kind: 'captured', mode: 'window', size: `${mainWindow.innerWidth}x${mainWindow.innerHeight}`, includesLayerContent: false },
				captures: [mainWindow],
				overlay: false,
				editors: 0,
				announced: 'Screenshot captured.',
			});
		});

		test('a drag captures an area with the part of a page layer that it covers', async () => {
			const { service, container } = createService();
			const page = $('div');
			page.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 200px; height: 100px;';
			container.appendChild(page);
			store.add(service.registerLayer({ element: page, capturesOnClick: true, capture: async () => ({ data: createImage(200, 100, '#ff0000'), mimeType: 'image/png' }) }));
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 50, 50);
			pointer(overlay, 'pointermove', 150, 120);
			pointer(overlay, 'pointerup', 150, 120);
			assert.deepStrictEqual(summarize(await result), { kind: 'captured', mode: 'area', size: '100x70', includesLayerContent: true });
		});

		test('a click on a page layer captures only the page', async () => {
			const { service, container, captures } = createService();
			const page = $('div');
			page.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 200px; height: 100px;';
			container.appendChild(page);
			store.add(service.registerLayer({ element: page, capturesOnClick: true, capture: async () => ({ data: createImage(200, 100, '#ff0000'), mimeType: 'image/png' }) }));
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 150, 150);
			pointer(overlay, 'pointerup', 150, 150);
			assert.deepStrictEqual({ result: summarize(await result), captures }, {
				result: { kind: 'captured', mode: 'page', size: '200x100', includesLayerContent: true },
				captures: [],
			});
		});

		test('Enter captures the window and focus returns', async () => {
			const { service, container } = createService();
			const button = $('button');
			container.appendChild(button);
			button.focus();
			const result = service.capture(mainWindow);
			key(getOverlay(container), 'Enter', 13);
			assert.deepStrictEqual({ result: summarize(await result), focused: mainWindow.document.activeElement === button }, {
				result: { kind: 'captured', mode: 'window', size: `${mainWindow.innerWidth}x${mainWindow.innerHeight}`, includesLayerContent: false },
				focused: true,
			});
		});

		test('Escape cancels before capturing and announces it', async () => {
			const { service, container, accessibility, captures } = createService();
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			const focusedOverlay = mainWindow.document.activeElement === overlay;
			key(overlay, 'Escape', 27);
			assert.deepStrictEqual({ result: await result, focusedOverlay, captures, overlay: overlay.isConnected, messages: accessibility.messages }, {
				result: { kind: 'cancelled', mode: 'none' },
				focusedOverlay: true,
				captures: [],
				overlay: false,
				messages: ['Screenshot mode. Click to capture the window, or drag to capture an area. Press Enter to capture the window or Escape to cancel.', 'Screenshot cancelled.'],
			});
		});

		test('started from another window, the tool focuses its target window and then returns focus', async () => {
			const { service, container, focusedWindows } = createService();
			const button = $('button');
			container.appendChild(button);
			button.focus();
			const targetWindow = upcastPartial<CodeWindow>({ document: mainWindow.document.implementation.createHTMLDocument() });
			const result = service.capture(targetWindow);
			const focusedDuringSession = [...focusedWindows];
			key(getOverlay(container), 'Escape', 27);
			assert.deepStrictEqual({ result: await result, focusedDuringSession, focusedWindows, focused: mainWindow.document.activeElement === button }, {
				result: { kind: 'cancelled', mode: 'none' },
				focusedDuringSession: [targetWindow],
				focusedWindows: [targetWindow, mainWindow],
				focused: true,
			});
		});

		test('editing keeps changes when the dialog closes, without a Save button', async () => {
			const { service, container, telemetry } = createService();
			const button = $('button');
			container.appendChild(button);
			button.focus();
			const original = await createScreenshotToolImage(createImage(40, 30, '#00ff00'), 'image/png');
			const edited = service.edit(mainWindow, { original, annotationState: undefined }, ScreenshotToolSurface.Chat);
			const dialog = await waitForDialog(container);
			const title = mainWindow.document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent;
			const labels = [...dialog.querySelectorAll<HTMLElement>('.tool-btn, .monaco-button')].map(element => element.getAttribute('aria-label') ?? element.textContent);
			dialog.querySelector<HTMLElement>('.crop-btn')!.click();
			[...dialog.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === 'Apply')!.click();
			key(dialog, 'Escape', 27);
			const edit = await edited;

			// Reopening restores the annotations, and closing without changes keeps the screenshot as it is.
			const reopened = service.edit(mainWindow, edit!, ScreenshotToolSurface.Chat);
			key(await waitForDialog(container), 'Escape', 27);
			assert.deepStrictEqual({
				title,
				labels,
				edit: edit && { annotated: edit.annotated, size: `${edit.image.width}x${edit.image.height}`, actions: edit.annotationState?.actions.length, original: edit.original === original },
				reopened: await reopened,
				open: container.querySelectorAll('.screenshot-annotation-backdrop').length,
				focused: mainWindow.document.activeElement === button,
				edits: telemetry.edits,
			}, {
				title: 'Edit Screenshot',
				labels: ['Select / Move', 'Pan', 'Crop', 'Draw', 'Rectangle', 'Ellipse', 'Arrow', 'Eraser', 'Text', 'Undo', 'Redo', 'Cancel', 'Apply', 'Close'],
				edit: { annotated: true, size: '40x30', actions: 1, original: true },
				reopened: undefined,
				open: 0,
				focused: true,
				edits: [
					{ surface: 'chat', changed: true, annotated: true },
					{ surface: 'chat', changed: false, annotated: true },
				],
			});
		});
	});
});
