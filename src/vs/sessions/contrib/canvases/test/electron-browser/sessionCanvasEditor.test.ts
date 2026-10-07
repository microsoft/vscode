/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IBrowserViewLoadError } from '../../../../../platform/browserView/common/browserView.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionCanvas } from '../../../../services/sessions/common/session.js';
import { ISessionCanvasService, SessionCanvasInput } from '../../common/sessionCanvas.js';
import { SessionCanvasEditor } from '../../electron-browser/sessionCanvasEditor.js';

suite('SessionCanvasEditor telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: {
		loadGate?: Promise<void>;
		loadError?: Error;
		pageError?: IBrowserViewLoadError;
	} = {}) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const completed = new DeferredPromise<void>();
		const events: ITelemetryData[] = [];
		const createRequests: Parameters<IBrowserViewWorkbenchService['createExternalBrowserView']>[] = [];
		const attached: IBrowserViewModel[] = [];
		const active = observableValue('activeCanvasOwner', true);
		const canvas: ISessionCanvas = {
			resource: URI.parse('test-canvas:/private'),
			instanceId: 'private-instance',
			title: 'Private canvas title',
			source: URI.parse('https://example.test/private-source'),
		};
		const input = store.add(new SessionCanvasInput({
			providerId: 'test-provider',
			session: URI.parse('test-session:/owner'),
			chat: URI.parse('test-chat:/owner'),
			canvas: canvas.resource,
		}, canvas));
		let modelDisposed = false;
		const onWillDispose = store.add(new Emitter<void>());
		const model = upcastPartial<IBrowserViewModel>({
			error: options.pageError,
			onDidChangeFocus: Event.None,
			onDidChangeLoadingState: Event.None,
			onDidNavigate: Event.None,
			onWillDispose: onWillDispose.event,
			layout: async () => { },
			dispose: () => {
				if (!modelDisposed) {
					modelDisposed = true;
					onWillDispose.fire();
				}
			},
		});
		instantiationService.stub(ITelemetryService, {
			publicLog2: (name: string, data?: ITelemetryData) => {
				if (name === 'agentCanvas.loadCompleted' && data) {
					events.push(data);
					completed.complete();
				}
			},
		});
		instantiationService.stub(ISessionCanvasService, {
			enabled: observableValue('canvasesEnabled', true),
			isActiveOwner: (_reference, reader) => active.read(reader),
		});
		instantiationService.stub(IAccessibleViewService, {});
		instantiationService.stub(IBrowserViewWorkbenchService, {
			createExternalBrowserView: async (...args) => {
				createRequests.push(args);
				await options.loadGate;
				if (options.loadError) {
					throw options.loadError;
				}
				return model;
			},
		});
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'),
			pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: model => { if (model) { attached.push(model); } },
			setVisible: () => { },
			layout: () => { },
			dispose: () => { },
		});
		const editor = store.add(instantiationService.createInstance(SessionCanvasEditor, new TestEditorGroupView(1)));
		editor.create($('div'));
		const open = () => editor.setInput(input, undefined, {}, CancellationToken.None);
		const telemetry = () => events.map(({ durationMs, ...data }) => ({
			...data,
			hasDuration: typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0,
		}));
		return { editor, input, canvas, active, open, completed, events, telemetry, createRequests, attached, isModelDisposed: () => modelDisposed };
	}

	test('waits for navigation and records one content-free successful load', async () => {
		const load = new DeferredPromise<void>();
		const harness = createHarness({ loadGate: load.p });
		await harness.open();
		assert.deepStrictEqual(harness.events, []);
		load.complete();
		await harness.completed.p;
		harness.input.setCanvas({ ...harness.canvas, title: 'Updated title' });

		assert.deepStrictEqual({
			telemetry: harness.telemetry(),
			createRequests: harness.createRequests,
			attached: harness.attached.length,
		}, {
			telemetry: [{ schemaVersion: 1, outcome: 'loaded', hasDuration: true }],
			createRequests: [['https://example.test/private-source', 'canvas']],
			attached: 1,
		});
	});

	test('reports rejected loads and page failures without error content', async () => {
		const privateError = new Error('Private URL, path, and content');
		const results = [];
		for (const options of [
			{ loadError: privateError },
			{ pageError: { errorCode: -105, errorDescription: 'Private error', url: 'https://example.test/private' } },
		]) {
			const harness = createHarness(options);
			await harness.open();
			await harness.completed.p;
			results.push(...harness.telemetry());
			harness.editor.dispose();
		}
		assert.deepStrictEqual(results, [
			{ schemaVersion: 1, outcome: 'error', hasDuration: true },
			{ schemaVersion: 1, outcome: 'error', hasDuration: true },
		]);
	});

	test('records cancellation separately from a load failure', async () => {
		const harness = createHarness({ loadError: new CancellationError() });
		await harness.open();
		await harness.completed.p;
		assert.deepStrictEqual({
			telemetry: harness.telemetry(), attached: harness.attached.length,
		}, {
			telemetry: [{ schemaVersion: 1, outcome: 'cancelled', hasDuration: true }], attached: 0,
		});
	});

	for (const interruption of ['superseded', 'ownerInactive', 'disposed'] as const) {
		test(`treats ${interruption} loads as interrupted and disposes the unattached view`, async () => {
			const gate = new DeferredPromise<void>();
			const harness = createHarness({ loadGate: gate.p });
			await harness.open();
			if (interruption === 'disposed') {
				harness.editor.dispose();
			} else if (interruption === 'ownerInactive') {
				harness.active.set(false, undefined);
			} else {
				harness.editor.clearInput();
			}
			gate.complete();
			await harness.completed.p;
			assert.deepStrictEqual({
				telemetry: harness.telemetry(), disposed: harness.isModelDisposed(), attached: harness.attached.length,
			}, {
				telemetry: [{ schemaVersion: 1, outcome: 'interrupted', hasDuration: true }], disposed: true, attached: 0,
			});
		});
	}
});
