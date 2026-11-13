/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, registerWindow } from '../../../../../base/browser/dom.js';
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
import { IEditorPane } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ImageCarouselEditorInput } from '../../../imageCarousel/browser/imageCarouselEditorInput.js';
import { createScreenshotToolImage, getScreenshotToolImageData, ScreenshotToolEntryPoint, ScreenshotToolResult, ScreenshotToolSurface } from '../../browser/screenshotTool.js';
import { resolveScreenshotSelection } from '../../browser/screenshotSelection.js';
import { ScreenshotToolService } from '../../browser/screenshotToolService.js';
import { TestScreenshotToolTelemetryService } from './screenshotToolTestUtils.js';

suite('ScreenshotTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a press without travel selects everything and a drag selects an area clamped to the bounds', () => {
		const windowBounds = { x: 0, y: 0, width: 800, height: 600 };
		const offsetBounds = { x: 100, y: 100, width: 400, height: 300 };
		assert.deepStrictEqual([
			resolveScreenshotSelection({ x: 100, y: 100 }, { x: 103, y: 97 }, windowBounds),
			resolveScreenshotSelection({ x: 300, y: 200 }, { x: 100, y: 120 }, windowBounds),
			resolveScreenshotSelection({ x: 700, y: 500 }, { x: 900, y: 700 }, windowBounds),
			resolveScreenshotSelection({ x: 790, y: 590 }, { x: 900, y: 700 }, windowBounds),
			resolveScreenshotSelection({ x: 450, y: 350 }, { x: 20, y: 700 }, offsetBounds),
		], [
			{ kind: 'all' },
			{ kind: 'area', rect: { x: 100, y: 120, width: 200, height: 80 } },
			{ kind: 'area', rect: { x: 700, y: 500, width: 100, height: 100 } },
			{ kind: 'area', rect: { x: 790, y: 590, width: 10, height: 10 } },
			{ kind: 'area', rect: { x: 100, y: 350, width: 350, height: 50 } },
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

		function createService(options: { supported?: boolean; editorService?: Partial<IEditorService> } = {}) {
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			const telemetry = new TestScreenshotToolTelemetryService();
			const accessibility = new TestAccessibility();
			const captures: (Window | undefined)[] = [];
			const focusedWindows: Window[] = [];
			const windowImage = createImage(mainWindow.innerWidth, mainWindow.innerHeight, '#0000ff');
			const service = store.add(new class extends ScreenshotToolService {
				override get isSupported(): boolean { return options.supported ?? true; }
			}(
				new TestConfigurationService(),
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
				upcastPartial<IEditorService>(options.editorService ?? {}),
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
				? { kind: result.kind, mode: result.mode, size: `${result.image.width}x${result.image.height}` }
				: result;
		}

		/** Waits until a markup has loaded its screenshot, which sizes its canvas. */
		async function waitForMarkUp(container: HTMLElement): Promise<HTMLElement> {
			const loaded = new DeferredPromise<HTMLElement>();
			const check = () => {
				const markUp = container.querySelector<HTMLElement>('.screenshot-annotation-editor');
				if (markUp?.querySelector('canvas')?.style.width) {
					void loaded.complete(markUp);
				}
			};
			const observer = new MutationObserver(check);
			observer.observe(container, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
			check();
			try {
				return await loaded.p;
			} finally {
				observer.disconnect();
			}
		}

		test('reports how an entry point ended only where the tool is supported', () => {
			const reports = [true, false].map(supported => {
				const { service, telemetry } = createService({ supported });
				service.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAddContext, outcome: 'attached', mode: 'window', durationMs: 5 });
				return { supported: service.isSupported, captures: telemetry.captures };
			});
			assert.deepStrictEqual(reports, [
				{ supported: true, captures: [{ entryPoint: 'chatAddContext', outcome: 'attached', mode: 'window' }] },
				{ supported: false, captures: [] },
			]);
		});

		test('a click captures the target window, which is attached without another step', async () => {
			const { service, container, captures, accessibility } = createService();
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 20, 20);
			pointer(overlay, 'pointerup', 22, 21);
			assert.deepStrictEqual({ result: summarize(await result), captures, overlay: overlay.isConnected, editors: container.querySelectorAll('.screenshot-annotation-editor').length, announced: accessibility.messages.at(-1) }, {
				result: { kind: 'captured', mode: 'window', size: `${mainWindow.innerWidth}x${mainWindow.innerHeight}` },
				captures: [mainWindow],
				overlay: false,
				editors: 0,
				announced: 'Screenshot captured.',
			});
		});

		test('a drag captures that area of the window', async () => {
			const { service, container, captures } = createService();
			const result = service.capture(mainWindow);
			const overlay = getOverlay(container);
			pointer(overlay, 'pointerdown', 50, 50);
			pointer(overlay, 'pointermove', 150, 120);
			pointer(overlay, 'pointerup', 150, 120);
			assert.deepStrictEqual({ result: summarize(await result), captures }, {
				result: { kind: 'captured', mode: 'area', size: '100x70' },
				captures: [mainWindow],
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
				result: { kind: 'captured', mode: 'window', size: `${mainWindow.innerWidth}x${mainWindow.innerHeight}` },
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

		test('cancels when its target window closes, which ends its session', async () => {
			const { service, container } = createService();
			const targetWindow = upcastPartial<CodeWindow>({
				vscodeWindowId: 1000,
				document: mainWindow.document.implementation.createHTMLDocument(),
				addEventListener: () => { },
				removeEventListener: () => { },
			});
			const registration = registerWindow(targetWindow);
			const active: boolean[] = [];
			store.add(service.onDidChangeActive(event => active.push(event.active)));
			const result = service.capture(targetWindow);
			const overlay = getOverlay(container);
			registration.dispose();
			assert.deepStrictEqual({ result: await result, overlay: overlay.isConnected, active }, {
				result: { kind: 'cancelled', mode: 'none' },
				overlay: false,
				active: [true, false],
			});
		});

		test('a markup keeps its changes when it ends, and the next one restores them', async () => {
			const { service, container, telemetry } = createService();
			const active: boolean[] = [];
			store.add(service.onDidChangeActive(event => active.push(event.active)));
			const original = await createScreenshotToolImage(createImage(40, 30, '#00ff00'), 'image/png');
			const first = store.add(service.markUp(container, { original, annotationState: undefined }, ScreenshotToolSurface.Chat));
			const markUp = await waitForMarkUp(container);
			const hint = mainWindow.document.getElementById(markUp.getAttribute('aria-describedby')!)?.textContent;
			const labels = [...markUp.querySelectorAll<HTMLElement>('.tool-btn, .monaco-button')].map(element => element.getAttribute('aria-label') ?? element.textContent);
			markUp.querySelector<HTMLElement>('.crop-btn')!.click();
			[...markUp.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === 'Apply')!.click();
			key(markUp, 'Escape', 27);
			const edit = await first.result;

			// Done without changes keeps the screenshot as it is.
			const second = store.add(service.markUp(container, Promise.resolve(edit!), ScreenshotToolSurface.Chat));
			[...(await waitForMarkUp(container)).querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === 'Done')!.click();
			assert.deepStrictEqual({
				label: markUp.getAttribute('aria-label'),
				hint,
				labels,
				edit: edit && { annotated: edit.annotated, size: `${edit.image.width}x${edit.image.height}`, actions: edit.annotationState?.actions.length, original: edit.original === original },
				unchanged: await second.result,
				open: container.querySelectorAll('.screenshot-annotation-editor').length,
				// Like captures, markups let the issue reporter hide its floating bar.
				active,
				edits: telemetry.edits,
			}, {
				label: 'Mark Up Image',
				hint: 'Draw on the image or crop it, then select Done to apply your changes.',
				labels: ['Select / Move', 'Pan', 'Crop', 'Draw', 'Rectangle', 'Ellipse', 'Arrow', 'Eraser', 'Text', 'Undo', 'Redo', 'Cancel', 'Apply', 'Done'],
				edit: { annotated: true, size: '40x30', actions: 1, original: true },
				unchanged: undefined,
				open: 0,
				active: [true, false, true, false],
				edits: [
					{ surface: 'chat', changed: true, annotated: true },
					{ surface: 'chat', changed: false, annotated: true },
				],
			});
		});

		test('edits a screenshot in the Images Preview, which resolves once the preview closes', async () => {
			const opened: ImageCarouselEditorInput[] = [];
			const { service, container, telemetry } = createService({
				editorService: {
					openEditor: async (input: unknown) => {
						opened.push(input as ImageCarouselEditorInput);
						return upcastPartial<IEditorPane>({});
					},
				} as Partial<IEditorService>,
			});
			const original = await createScreenshotToolImage(createImage(40, 30, '#00ff00'), 'image/png');
			let resolved = false;
			const edited = service.edit({ original, annotationState: undefined }, ScreenshotToolSurface.IssueReporter).then(edit => {
				resolved = true;
				return edit;
			});
			const [input] = opened;
			const [image] = input.collection.sections[0].images;
			const preview = image.markUp!(container);
			const markUp = await waitForMarkUp(container);
			markUp.querySelector<HTMLElement>('.crop-btn')!.click();
			[...markUp.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === 'Apply')!.click();
			[...markUp.querySelectorAll<HTMLElement>('.monaco-button')].find(element => element.textContent === 'Done')!.click();
			const shown = await preview.result;
			const resolvedBeforeClose = resolved;
			input.dispose();
			const edit = await edited;
			preview.dispose();
			assert.deepStrictEqual({
				input: { title: input.getName(), markUpOnly: input.markUpOnly, image: { name: image.name, mimeType: image.mimeType, size: image.data?.byteLength === getScreenshotToolImageData(original).data.byteLength } },
				shown: shown && { mimeType: shown.mimeType, matchesEdit: shown.data.byteLength === getScreenshotToolImageData(edit!.image).data.byteLength },
				resolvedBeforeClose,
				edit: edit && { annotated: edit.annotated, original: edit.original === original },
				edits: telemetry.edits,
			}, {
				input: { title: 'Edit Screenshot', markUpOnly: true, image: { name: 'Screenshot', mimeType: 'image/png', size: true } },
				shown: { mimeType: 'image/png', matchesEdit: true },
				resolvedBeforeClose: false,
				edit: { annotated: true, original: true },
				edits: [{ surface: 'issueReporter', changed: true, annotated: true }],
			});
		});
	});
});
