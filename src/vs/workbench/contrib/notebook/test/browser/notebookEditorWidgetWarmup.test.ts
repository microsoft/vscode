/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { ISizeService } from '../../../../../platform/theme/common/sizeService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotebookRendererMessagingService } from '../../common/notebookRendererMessagingService.js';
import { INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { TestNotebookExecutionStateService } from './testNotebookEditor.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { INotebookService } from '../../common/notebookService.js';
import { ICommentService } from '../../../comments/browser/commentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { CellKind, ICellDto2 } from '../../common/notebookCommon.js';
import { ICommonCellInfo, INotebookEditorViewState } from '../../browser/notebookBrowser.js';
import { INotebookEditorService } from '../../browser/services/notebookEditorService.js';
import { NotebookEditorWidget, getDefaultNotebookCreationOptions } from '../../browser/notebookEditorWidget.js';
import { BackLayerWebView } from '../../browser/view/renderers/backLayerWebView.js';
import { IMarkupCellInitialization } from '../../browser/view/renderers/webviewMessages.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { NotebookPerfMarks } from '../../common/notebookPerformance.js';

suite('NotebookEditorWidget markdown renderer warmup', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstantiationService(): TestInstantiationService {
		const configurationService = new TestConfigurationService({ editor: { fontFamily: 'monospace', fontSize: 14 } });
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, disposables);
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(ISizeService, {
			_serviceBrand: undefined,
			onDidChangeSizes: Event.None,
			getSize: () => undefined,
		});
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { });
		instantiationService.stub(INotebookRendererMessagingService, new class extends mock<INotebookRendererMessagingService>() { });
		instantiationService.stub(INotebookExecutionService, new class extends mock<INotebookExecutionService>() { });
		instantiationService.stub(INotebookExecutionStateService, new TestNotebookExecutionStateService());
		instantiationService.stub(INotebookLoggingService, new NullLogService());
		instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() {
			override addNotebookEditor(): void { }
			override removeNotebookEditor(): void { }
		});
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidChangeOutputRenderers = Event.None;
		});
		instantiationService.stub(INotebookKernelService, new class extends mock<INotebookKernelService>() {
			override onDidAddKernel = Event.None;
			override onDidChangeSelectedNotebooks = Event.None;
			override onDidChangeSourceActions = Event.None;
			override getMatchingKernel() {
				return { selected: undefined, suggestions: [], all: [], hidden: [] };
			}
			override getSelectedOrSuggestedKernel() {
				return undefined;
			}
			override getSourceActions() {
				return [];
			}
			override getRunningSourceActions() {
				return [];
			}
			override getKernelDetectionTasks() {
				return [];
			}
		});
		instantiationService.stub(ICommentService, new class extends mock<ICommentService>() {
			override onDidUpdateCommentThreads = Event.None;
		});

		return instantiationService;
	}

	function createWidget(instantiationService: TestInstantiationService): NotebookEditorWidget {
		return disposables.add(instantiationService.createInstance(NotebookEditorWidget, {
			...getDefaultNotebookCreationOptions(),
			contributions: [],
			cellEditorContributions: [],
		}, undefined));
	}

	function createNotebookTextModel(instantiationService: TestInstantiationService, cells: [source: string, language: string, cellKind: CellKind][]): NotebookTextModel {
		return disposables.add(instantiationService.createInstance(NotebookTextModel, 'notebook', URI.parse('test://test'), cells.map((cell): ICellDto2 => {
			return {
				source: cell[0],
				mime: undefined,
				language: cell[1],
				cellKind: cell[2],
				outputs: [],
				metadata: undefined
			};
		}), {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }));
	}

	function injectMockWebview(widget: NotebookEditorWidget, initializeMarkupBehavior: (cells: readonly IMarkupCellInitialization[]) => Promise<void> = () => Promise.resolve()): {
		webview: BackLayerWebView<ICommonCellInfo>;
		element: HTMLElement;
		initializeMarkupCalls: IMarkupCellInitialization[][];
		updateScrollTopsCalls: { id: string; top: number }[][];
	} {
		const initializeMarkupCalls: IMarkupCellInitialization[][] = [];
		const updateScrollTopsCalls: { id: string; top: number }[][] = [];
		const element = document.createElement('div');
		const webview = {
			element,
			isResolved: () => true,
			dispose: () => { },
			updateScrollTops: (_outputs: unknown[], markupRequests: { id: string; top: number }[]) => {
				updateScrollTopsCalls.push(markupRequests);
			},
			initializeMarkup: (cells: readonly IMarkupCellInitialization[]) => {
				initializeMarkupCalls.push([...cells]);
				return initializeMarkupBehavior(cells);
			},
		} as unknown as BackLayerWebView<ICommonCellInfo>;

		const fields = widget as unknown as {
			_webview: BackLayerWebView<ICommonCellInfo> | null;
			_webviewResolvePromise: Promise<BackLayerWebView<ICommonCellInfo>> | undefined;
		};
		fields._webview = webview;
		fields._webviewResolvePromise = Promise.resolve(webview);

		return { webview, element, initializeMarkupCalls, updateScrollTopsCalls };
	}

	function attachModel(widget: NotebookEditorWidget, textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined): Promise<void> {
		const fields = widget as unknown as {
			_attachModel(textModel: NotebookTextModel, viewType: string, viewState: INotebookEditorViewState | undefined, perf?: NotebookPerfMarks): Promise<void>;
		};
		return fields._attachModel(textModel, 'notebook', viewState);
	}

	async function waitForAttach(widget: NotebookEditorWidget, timeoutMs: number): Promise<void> {
		let listener: IDisposable | undefined;
		try {
			return await new Promise<void>((resolve, reject) => {
				listener = widget.onDidAttachViewModel(() => resolve());
				setTimeout(() => reject(new Error(`view model was not attached within ${timeoutMs}ms`)), timeoutMs);
			});
		} finally {
			listener?.dispose();
		}
	}

	function viewStateWithHeights(heights: { [key: number]: number }): INotebookEditorViewState {
		return {
			editingCells: {},
			collapsedInputCells: {},
			collapsedOutputCells: {},
			cellLineNumberStates: {},
			editorViewStates: {},
			cellTotalHeights: heights,
		};
	}

	test('attaches the view model without waiting for the webview when the viewport has no markdown cells', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		const webviewMock = injectMockWebview(widget);
		const textModel = createNotebookTextModel(instantiationService, [['print(1)', 'python', CellKind.Code]]);

		const attached = waitForAttach(widget, 5000);
		await attachModel(widget, textModel, viewStateWithHeights({ 0: 100 }));

		await attached;
		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 0, 'markdown warmup must be skipped when there is no markdown cell in the viewport');
		assert.strictEqual(webviewMock.element.style.visibility, 'visible');
	});

	test('attaches the view model once the markdown cells are warmed up', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		const webviewMock = injectMockWebview(widget);
		const textModel = createNotebookTextModel(instantiationService, [
			['# markdown', 'markdown', CellKind.Markup],
			['print(1)', 'python', CellKind.Code],
		]);

		const attached = waitForAttach(widget, 5000);
		await attachModel(widget, textModel, undefined);

		await attached;
		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 1);
		assert.strictEqual(webviewMock.initializeMarkupCalls[0].length, 1, 'the markdown cell of the first viewport must be pre-rendered');
		assert.strictEqual(webviewMock.element.style.visibility, 'visible');
	});

	test('attaches the view model when the markdown warmup does not complete', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		const webviewMock = injectMockWebview(widget, () => new Promise<void>(() => { /* the webview never finishes loading the markdown renderer */ }));
		const textModel = createNotebookTextModel(instantiationService, [
			['# markdown', 'markdown', CellKind.Markup],
			['print(1)', 'python', CellKind.Code],
		]);

		const attached = waitForAttach(widget, 10000);
		await attachModel(widget, textModel, undefined);

		await attached;
		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 1, 'the warmup request was sent to the webview');
		assert.strictEqual(webviewMock.element.style.visibility, 'visible');
	});

	test('completes the warmup in the background when the webview resolves after the timeout', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		const webviewMock = injectMockWebview(widget);
		const textModel = createNotebookTextModel(instantiationService, [
			['# markdown', 'markdown', CellKind.Markup],
			['print(1)', 'python', CellKind.Code],
		]);

		// the webview does not resolve before the timeout fires
		const webviewResolution = new DeferredPromise<BackLayerWebView<ICommonCellInfo>>();
		const fields = widget as unknown as { _webviewResolvePromise: Promise<BackLayerWebView<ICommonCellInfo>> | undefined };
		fields._webviewResolvePromise = webviewResolution.p;

		const attached = waitForAttach(widget, 10000);
		await attachModel(widget, textModel, undefined);
		await attached;
		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 0, 'the warmup request is only sent once the webview resolved');

		webviewResolution.complete(webviewMock.webview);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 1, 'the warmup completes in the background once the webview resolved');
		assert.strictEqual(webviewMock.updateScrollTopsCalls.length, 1, 'the markdown cells are positioned once the warmup completed');
	});

	test('positions the markdown cells when the warmup acknowledgement arrives after the timeout', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		const warmupAck = new DeferredPromise<void>();
		const webviewMock = injectMockWebview(widget, () => warmupAck.p);
		const textModel = createNotebookTextModel(instantiationService, [
			['# markdown', 'markdown', CellKind.Markup],
			['print(1)', 'python', CellKind.Code],
		]);

		const attached = waitForAttach(widget, 10000);
		await attachModel(widget, textModel, undefined);
		await attached;
		assert.strictEqual(webviewMock.initializeMarkupCalls.length, 1, 'the warmup request was sent to the webview');
		assert.strictEqual(webviewMock.updateScrollTopsCalls.length, 0, 'the offset update waits for the warmup acknowledgement');

		warmupAck.complete();
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.strictEqual(webviewMock.updateScrollTopsCalls.length, 1, 'the warmup completes in the background once the acknowledgement arrived');
	});

	test('does not attach the view model when the webview fails to resolve', async () => {
		const instantiationService = createInstantiationService();
		const widget = createWidget(instantiationService);
		injectMockWebview(widget);
		const textModel = createNotebookTextModel(instantiationService, [
			['# markdown', 'markdown', CellKind.Markup],
			['print(1)', 'python', CellKind.Code],
		]);

		const fields = widget as unknown as { _webviewResolvePromise: Promise<never> };
		fields._webviewResolvePromise = Promise.reject(new Error('Could not initialize webview'));

		let didAttach = false;
		const listener = widget.onDidAttachViewModel(() => { didAttach = true; });

		try {
			await assert.rejects(attachModel(widget, textModel, undefined), /Could not initialize webview/);
		} finally {
			listener.dispose();
		}

		assert.strictEqual(didAttach, false, 'the view model must not be attached when the webview failed to resolve');
	});
});
