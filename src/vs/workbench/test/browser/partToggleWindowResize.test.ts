/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDimension } from '../../../base/browser/dom.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { IWindowResizeAnchor, IWindowResizeDelta } from '../../../platform/native/common/native.js';
import { IPartToggleSize, IPartToggleWindowResize, PartToggleWindowResizeController } from '../../browser/partToggleWindowResize.js';
import { Parts } from '../../services/layout/browser/layoutService.js';

suite('PartToggleWindowResizeController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const originalEditor = { width: 700, height: 400 };

	function request(delta: IWindowResizeDelta, editorSize = originalEditor, part = Parts.PANEL_PART): IPartToggleWindowResize {
		return {
			part, delta, editorSize, anchor: { right: part === Parts.SIDEBAR_PART, bottom: false },
			partSizes: [{ part, size: Math.abs(delta.width || delta.height), horizontal: delta.height !== 0 }]
		};
	}

	function setup(resizeWindow: (delta: IWindowResizeDelta, anchor: IWindowResizeAnchor) => Promise<IDimension | undefined>) {
		const emitter = store.add(new Emitter<IDimension>());
		const restored: IDimension[] = [];
		const restoredParts: (readonly IPartToggleSize[])[] = [];
		const warnings: string[] = [];
		let dimension: IDimension = { width: 1000, height: 700 };
		let canResize = true;
		const logService = store.add(new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}());
		const controller = store.add(new PartToggleWindowResizeController({
			onDidLayout: emitter.event,
			getDimension: () => dimension,
			canResize: () => canResize,
			restoreSizes: (size, partSizes) => {
				restored.push(size);
				restoredParts.push(partSizes);
			}
		}, { resizeMainWindow: resizeWindow }, logService));
		return {
			controller, restored, restoredParts, warnings, emitter,
			setCanResize: (value: boolean) => { canResize = value; },
			layout: (value: IDimension) => {
				dimension = value;
				emitter.fire(value);
			}
		};
	}

	test('observes layout that arrives during IPC', async () => {
		const target = { width: 1000, height: 400 };
		const harness = setup(async () => {
			harness.layout(target);
			return target;
		});
		await harness.controller.resize(request({ width: 0, height: -300 }));
		assert.deepStrictEqual(
			{ restored: harness.restored, warnings: harness.warnings, listeners: harness.emitter.hasListeners() },
			{ restored: [originalEditor], warnings: [], listeners: false }
		);
	});

	test('rapid hide/show keeps the original snapshot and waits for each target', async () => {
		const firstStarted = new DeferredPromise<void>();
		const secondStarted = new DeferredPromise<void>();
		const firstResult = new DeferredPromise<IDimension>();
		const secondResult = new DeferredPromise<IDimension>();
		const calls: IWindowResizeDelta[] = [];
		const harness = setup(delta => {
			calls.push(delta);
			if (calls.length === 1) {
				void firstStarted.complete();
				return firstResult.p;
			}
			void secondStarted.complete();
			return secondResult.p;
		});

		const hiding = harness.controller.resize(request({ width: 0, height: -300 }));
		const showing = harness.controller.resize(request({ width: 0, height: 300 }, { width: 700, height: 700 }));
		await firstStarted.p;
		await firstResult.complete({ width: 1000, height: 400 });
		// Neither an unchanged visibility event nor an intermediate resize completes the request.
		harness.layout({ width: 1000, height: 700 });
		harness.layout({ width: 1000, height: 550 });
		assert.deepStrictEqual({ calls, restored: harness.restored }, { calls: [{ width: 0, height: -300 }], restored: [] });
		harness.layout({ width: 1000, height: 400 });
		await secondStarted.p;
		harness.layout({ width: 1000, height: 700 });
		await secondResult.complete({ width: 1000, height: 700 });
		await Promise.all([hiding, showing]);
		assert.deepStrictEqual(
			{ calls, restored: harness.restored, listeners: harness.emitter.hasListeners() },
			{ calls: [{ width: 0, height: -300 }, { width: 0, height: 300 }], restored: [originalEditor], listeners: false }
		);
	});

	test('show/hide uses the intended part size rather than its temporarily squeezed size', async () => {
		const calls: IWindowResizeDelta[] = [];
		const harness = setup(async delta => {
			calls.push(delta);
			const target = { width: 1000, height: calls.length === 1 ? 1000 : 700 };
			harness.layout(target);
			return target;
		});
		await Promise.all([
			harness.controller.resize(request({ width: 0, height: 300 })),
			harness.controller.resize(request({ width: 0, height: -100 }, { width: 700, height: 200 }))
		]);
		assert.deepStrictEqual(
			{ calls, restored: harness.restored },
			{ calls: [{ width: 0, height: 300 }, { width: 0, height: -300 }], restored: [originalEditor] }
		);
	});

	test('overlapping parts retain independent sizes and anchors', async () => {
		const calls: { delta: IWindowResizeDelta; anchor: IWindowResizeAnchor }[] = [];
		const harness = setup(async (delta, anchor) => {
			calls.push({ delta, anchor });
			const target = { width: calls.length === 1 ? 1000 : 750, height: 400 };
			harness.layout(target);
			return target;
		});

		await Promise.all([
			harness.controller.resize(request({ width: 0, height: -300 })),
			harness.controller.resize(request({ width: -250, height: 0 }, { width: 700, height: 700 }, Parts.SIDEBAR_PART))
		]);
		assert.deepStrictEqual(
			{ calls, restored: harness.restored },
			{
				calls: [
					{ delta: { width: 0, height: -300 }, anchor: { right: false, bottom: false } },
					{ delta: { width: -250, height: 0 }, anchor: { right: true, bottom: false } }
				],
				restored: [originalEditor]
			}
		);
	});

	test('restores surrounding parts from before they were temporarily squeezed', async () => {
		const harness = setup(async () => ({ width: 1000, height: 700 }));
		const first = request({ width: 300, height: 0 });
		const sidebarSize = { part: Parts.SIDEBAR_PART, size: 300, horizontal: false };
		await Promise.all([
			harness.controller.resize({ ...first, partSizes: [...first.partSizes, sidebarSize] }),
			harness.controller.resize(request({ width: -170, height: 0 }, { width: 400, height: 400 }, Parts.SIDEBAR_PART))
		]);
		assert.deepStrictEqual(
			{ editor: harness.restored, parts: harness.restoredParts },
			{ editor: [originalEditor], parts: [[...first.partSizes, sidebarSize]] }
		);
	});

	test('timeout logs a warning and removes listeners', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const harness = setup(async () => ({ width: 1000, height: 400 }));
		await harness.controller.resize(request({ width: 0, height: -300 }));
		assert.deepStrictEqual(
			{ restored: harness.restored, warnings: harness.warnings, listeners: harness.emitter.hasListeners() },
			{ restored: [], warnings: ['[layout] Timed out waiting for the window resize'], listeners: false }
		);
	}));

	test('IPC failure is logged and a subsequent toggle gets a fresh snapshot', async () => {
		let calls = 0;
		const harness = setup(async () => {
			if (++calls === 1) {
				throw new Error('IPC failed');
			}
			return { width: 1000, height: 700 };
		});
		await harness.controller.resize(request({ width: 0, height: -300 }));
		const nextEditor = { width: 700, height: 600 };
		await harness.controller.resize(request({ width: 0, height: 100 }, nextEditor));
		assert.deepStrictEqual(
			{ restored: harness.restored, warnings: harness.warnings, listeners: harness.emitter.hasListeners() },
			{ restored: [nextEditor], warnings: ['[layout] resizeWindowToKeepEditorSize failed'], listeners: false }
		);
	});

	test('unchanged or unsupported native resize does not restore the editor or leave listeners', async () => {
		const harness = setup(async () => undefined);
		await harness.controller.resize(request({ width: 0, height: -300 }));
		assert.deepStrictEqual(
			{ restored: harness.restored, warnings: harness.warnings, listeners: harness.emitter.hasListeners() },
			{ restored: [], warnings: [], listeners: false }
		);
	});

	test('disposal stops waiting and skips queued requests', async () => {
		const started = new DeferredPromise<void>();
		let calls = 0;
		const harness = setup(async () => {
			calls++;
			void started.complete();
			return { width: 1000, height: 400 };
		});
		const first = harness.controller.resize(request({ width: 0, height: -300 }));
		const second = harness.controller.resize(request({ width: 0, height: 300 }));
		await started.p;
		// Let the resolved IPC result install the layout listener.
		await Promise.resolve();
		harness.controller.dispose();
		await Promise.all([first, second]);
		assert.deepStrictEqual(
			{ calls, restored: harness.restored, warnings: harness.warnings, listeners: harness.emitter.hasListeners() },
			{ calls: 1, restored: [], warnings: [], listeners: false }
		);
	});

	test('window-state changes prevent queued resizing and editor restoration', async () => {
		let calls = 0;
		const harness = setup(async () => {
			calls++;
			harness.setCanResize(false);
			return { width: 1000, height: 700 };
		});
		await Promise.all([
			harness.controller.resize(request({ width: 0, height: -300 })),
			harness.controller.resize(request({ width: 0, height: 300 }))
		]);
		assert.deepStrictEqual({ calls, restored: harness.restored, warnings: harness.warnings }, { calls: 1, restored: [], warnings: [] });
	});

	test('accepts subpixel rounding in the reported CSS viewport dimensions', async () => {
		const harness = setup(async () => ({ width: 1000.5, height: 700.25 }));
		await harness.controller.resize(request({ width: 0, height: 300 }));
		assert.deepStrictEqual(harness.restored, [originalEditor]);
	});
});
