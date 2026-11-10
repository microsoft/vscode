/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { SCREENSHOT_TOOL_ENABLED_SETTING_ID, ScreenshotToolEntryPoint, ScreenshotToolResult } from '../../browser/screenshotTool.js';
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
			private readonly _onDidAnnounce = store.add(new Emitter<string>());
			readonly onDidAnnounce = this._onDidAnnounce.event;
			override status(message: string): void { this.announce(message); }
			override alert(message: string): void { this.announce(message); }
			private announce(message: string): void {
				this.messages.push(message);
				this._onDidAnnounce.fire(message);
			}
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

		/** Waits for the capture to open in the annotation editor, which the tool announces, and closes it. */
		async function finishInEditor(accessibility: TestAccessibility, container: HTMLElement, button: 'Attach' | 'Cancel'): Promise<void> {
			await Event.toPromise(Event.filter(accessibility.onDidAnnounce, message => message === 'Screenshot captured.'));
			const editor = container.querySelector<HTMLElement>('.screenshot-annotation-editor')!;
			[...editor.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === button)!.click();
		}

		function summarize(result: ScreenshotToolResult) {
			return result.kind === 'attach'
				? { kind: result.kind, mode: result.mode, size: `${result.image.width}x${result.image.height}`, annotated: result.annotated, includesLayerContent: result.includesLayerContent, sameAsOriginal: result.image === result.original }
				: result;
		}

		test('logs the experiment trigger in both arms before reading the setting, and nothing where unsupported', () => {
			const arms = [{ enabled: false }, { enabled: true }, { enabled: true, supported: false }].map(options => {
				const { service, telemetry } = createService(options);
				const usesTool = service.shouldUseTool();
				service.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAddContext, outcome: 'attached', mode: 'window', annotated: false, durationMs: 5, usedTool: usesTool });
				return { usesTool, triggers: telemetry.triggers, captures: telemetry.captures };
			});
			assert.deepStrictEqual(arms, [
				{ usesTool: false, triggers: ['config.workbench.screenshotTool.enabled'], captures: [{ entryPoint: 'chatAddContext', outcome: 'attached', mode: 'window', annotated: false, usedTool: false }] },
				{ usesTool: true, triggers: ['config.workbench.screenshotTool.enabled'], captures: [{ entryPoint: 'chatAddContext', outcome: 'attached', mode: 'window', annotated: false, usedTool: true }] },
				{ usesTool: false, triggers: [], captures: [] },
			]);
		});

		test('a click captures the target window and attaches it unchanged', async () => {
			const { service, container, captures, accessibility } = createService();
			const result = service.captureAndAnnotate(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 20, 20);
			pointer(overlay, 'pointerup', 22, 21);
			await finishInEditor(accessibility, container, 'Attach');
			assert.deepStrictEqual({ result: summarize(await result), captures, overlay: overlay.isConnected }, {
				result: { kind: 'attach', mode: 'window', size: `${mainWindow.innerWidth}x${mainWindow.innerHeight}`, annotated: false, includesLayerContent: false, sameAsOriginal: true },
				captures: [mainWindow],
				overlay: false,
			});
		});

		test('a drag captures an area with the part of a page layer that it covers', async () => {
			const { service, container, accessibility } = createService();
			const page = $('div');
			page.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 200px; height: 100px;';
			container.appendChild(page);
			store.add(service.registerLayer({ element: page, capturesOnClick: true, capture: async () => ({ data: createImage(200, 100, '#ff0000'), mimeType: 'image/png' }) }));
			const result = service.captureAndAnnotate(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 50, 50);
			pointer(overlay, 'pointermove', 150, 120);
			pointer(overlay, 'pointerup', 150, 120);
			await finishInEditor(accessibility, container, 'Attach');
			assert.deepStrictEqual(summarize(await result), { kind: 'attach', mode: 'area', size: '100x70', annotated: false, includesLayerContent: true, sameAsOriginal: true });
		});

		test('a click on a page layer captures only the page', async () => {
			const { service, container, captures, accessibility } = createService();
			const page = $('div');
			page.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 200px; height: 100px;';
			container.appendChild(page);
			store.add(service.registerLayer({ element: page, capturesOnClick: true, capture: async () => ({ data: createImage(200, 100, '#ff0000'), mimeType: 'image/png' }) }));
			const result = service.captureAndAnnotate(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 150, 150);
			pointer(overlay, 'pointerup', 150, 150);
			await finishInEditor(accessibility, container, 'Attach');
			assert.deepStrictEqual({ result: summarize(await result), captures }, {
				result: { kind: 'attach', mode: 'page', size: '200x100', annotated: false, includesLayerContent: true, sameAsOriginal: true },
				captures: [],
			});
		});

		test('Enter captures the window, Cancel in the editor cancels, and focus returns', async () => {
			const { service, container, accessibility } = createService();
			const button = $('button');
			container.appendChild(button);
			button.focus();
			const result = service.captureAndAnnotate(mainWindow);
			key(getOverlay(container), 'Enter', 13);
			await finishInEditor(accessibility, container, 'Cancel');
			assert.deepStrictEqual({ result: summarize(await result), messages: accessibility.messages.slice(1), focused: mainWindow.document.activeElement === button }, {
				result: { kind: 'cancelled', mode: 'window' },
				messages: ['Screenshot captured.', 'Screenshot cancelled.'],
				focused: true,
			});
		});

		test('Escape cancels before capturing and announces it', async () => {
			const { service, container, accessibility, captures } = createService();
			const result = service.captureAndAnnotate(mainWindow);
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
			const result = service.captureAndAnnotate(targetWindow);
			const focusedDuringSession = [...focusedWindows];
			key(getOverlay(container), 'Escape', 27);
			assert.deepStrictEqual({ result: await result, focusedDuringSession, focusedWindows, focused: mainWindow.document.activeElement === button }, {
				result: { kind: 'cancelled', mode: 'none' },
				focusedDuringSession: [targetWindow],
				focusedWindows: [targetWindow, mainWindow],
				focused: true,
			});
		});
	});
});
