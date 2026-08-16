/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { ValueWithChangeEvent } from '../../../base/common/event.js';
import { Disposable, DisposableStore, ImmortalReference, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { waitForState } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IInlineCompletionsService, InlineCompletionsService } from '../../../editor/browser/services/inlineCompletionsService.js';
import { IDiffProviderFactoryService } from '../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { ITextModel } from '../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../editor/common/services/resolverService.js';
import { TestDiffProviderFactoryService } from '../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { TestCommandService } from '../../../editor/test/browser/editorTestServices.js';
import { instantiateTextModel } from '../../../editor/test/common/testTextModel.js';
import { SMOOTH_SCROLLING_TIME } from '../../../editor/common/viewLayout/viewLayout.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../platform/clipboard/test/common/testClipboardService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../platform/opener/test/common/nullOpenerService.js';
import { IEditorProgressService } from '../../../platform/progress/common/progress.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

const LINE_COUNT = 200;
// The lines are long so that the content is also wider than the viewport.
const buildText = (word: string) => Array.from(
	{ length: LINE_COUNT },
	(_, i) => `const value${i} = '${word}'; // ${'pad '.repeat(40)}`
).join('\n');
const ORIGINAL = buildText('before');
const MODIFIED = buildText('after');

interface IScrollResult {
	/** How far the wheel tick scrolled once any animation finished. */
	readonly top: number;
	readonly left: number;
	/** How far it had already scrolled synchronously, before any animation ran. */
	readonly immediateTop: number;
}

suite('MultiDiffEditorWidget - scrolling settings', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstantiationService(store: DisposableStore, configuration: Record<string, unknown>) {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService(configuration),
		}, store);
		instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return { total: () => { }, worked: () => { }, done: () => { } }; }
		}());
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu() { }
		}());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() { }());
		// Editor services that `workbenchInstantiationService` does not cover, but that the
		// globally registered editor contributions need once every test file is loaded.
		instantiationService.stub(IClipboardService, new TestClipboardService());
		instantiationService.stub(ICommandService, instantiationService.createInstance(TestCommandService));
		instantiationService.stub(IOpenerService, { ...NullOpenerService });
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		instantiationService.stub(IInlineCompletionsService, store.add(instantiationService.createInstance(InlineCompletionsService)));
		return instantiationService;
	}

	/**
	 * A wheel tick, expressed the way `StandardWheelEvent` reads it: it prefers the legacy
	 * `wheelDelta*` properties over `delta*`, and Chrome leaves those at 0 on constructed
	 * events. One tick is 120, and scrolling down or right is negative.
	 */
	function createWheelEvent(down: number, right: number, altKey: boolean): WheelEvent {
		const event = new WheelEvent('wheel', { deltaY: down * 120, deltaX: right * 120, cancelable: true, altKey });
		Object.defineProperty(event, 'wheelDeltaY', { value: -down * 120 });
		Object.defineProperty(event, 'wheelDeltaX', { value: -right * 120 });
		return event;
	}

	/**
	 * Scrolls the multi diff editor with a single wheel tick and reports how far it moved.
	 * Every line differs, so no unchanged region is hidden and the content stays much
	 * larger than the viewport in both directions.
	 */
	async function scrollByOneWheelTick(configuration: Record<string, unknown>, down: number, right = 0, altKey = false): Promise<IScrollResult> {
		// Two stores so the widget is torn down before the services it was built from.
		const widgetStore = disposables.add(new DisposableStore());
		const serviceStore = disposables.add(new DisposableStore());
		try {
			return await measure(widgetStore, serviceStore, configuration, down, right, altKey);
		} finally {
			// Release this widget before the next call builds another one.
			widgetStore.dispose();
			serviceStore.dispose();
		}
	}

	async function measure(widgetStore: DisposableStore, serviceStore: DisposableStore, configuration: Record<string, unknown>, down: number, right: number, altKey: boolean): Promise<IScrollResult> {
		const instantiationService = createInstantiationService(serviceStore, configuration);

		const container = $('div');
		container.style.width = '600px';
		container.style.height = '300px';
		mainWindow.document.body.appendChild(container);

		// Standalone models, not registered with the model service: the text model resolver
		// would otherwise hand the same URI to a contribution and destroy them on release.
		const original = instantiateTextModel(instantiationService, ORIGINAL, 'typescript', undefined, URI.parse('test://original/values.ts'));
		const modified = instantiateTextModel(instantiationService, MODIFIED, 'typescript', undefined, URI.parse('test://modified/values.ts'));

		// Editor contributions such as the word highlighter resolve models by URI. Hand them
		// the models this test owns, through references that do not dispose them.
		const knownModels = new ResourceMap<ITextModel>();
		knownModels.set(original.uri, original);
		knownModels.set(modified.uri, modified);
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI) {
				const textEditorModel = knownModels.get(resource) ?? modified;
				return new ImmortalReference(<IResolvedTextEditorModel>{ textEditorModel });
			}
			override canHandleResource() { return true; }
			override registerTextModelContentProvider() { return Disposable.None; }
		}());

		const widget = instantiationService.createInstance(MultiDiffEditorWidget, container, {}, undefined);
		const diffItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original, modified }, { dispose() { } });
		const model: IMultiDiffEditorModel = { documents: ValueWithChangeEvent.const([diffItem]) };
		const viewModel = widget.createViewModel(model);

		// Tear down in this order: detach the model from the widget, then the view model,
		// then the widget, and only then the text models it was rendering.
		widgetStore.add(toDisposable(() => widget.setViewModel(undefined)));
		widgetStore.add(viewModel);
		widgetStore.add(widget);
		widgetStore.add(original);
		widgetStore.add(modified);
		widgetStore.add(toDisposable(() => container.remove()));

		widget.setViewModel(viewModel);
		widget.layout(new Dimension(600, 300));

		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		const scrollableElement = container.querySelector('.monaco-scrollable-element');
		assert.ok(scrollableElement, 'the multi diff editor should have a scrollable element');
		// The embedded editors report their size asynchronously. Wait for the content to
		// stop growing, so that it is larger than the viewport and can scroll.
		const content = container.querySelector<HTMLElement>('.scrollContent > div');
		assert.ok(content, 'the multi diff editor should have a content element');
		await waitUntilStable(() => content.clientHeight, height => height > 300, 'the diff content to be laid out');

		// Prime the wheel classifier. It is global and remembers the last five events, and
		// only a run of identical ticks makes it report a physical mouse wheel, which is
		// what enables smooth scrolling. Without this the result depends on the events
		// earlier tests dispatched.
		for (let i = 0; i < 4; i++) {
			scrollableElement.dispatchEvent(createWheelEvent(down, right, altKey));
		}
		const animated = configuration['editor.smoothScrolling'] === true;
		const before = await settle(widget, animated);

		scrollableElement.dispatchEvent(createWheelEvent(down, right, altKey));
		const immediateTop = widget.getViewState().scrollState.top - before.top;
		const after = await settle(widget, animated);
		return { top: after.top - before.top, left: after.left - before.left, immediateTop };
	}

	/** Waits for any smooth scroll animation to finish and reports the resting position. */
	async function settle(widget: MultiDiffEditorWidget, animated: boolean) {
		if (animated) {
			await timeout(SMOOTH_SCROLLING_TIME);
		}
		const position = () => widget.getViewState().scrollState;
		await waitUntilStable(() => `${position().top},${position().left}`, () => true, 'the scroll position to settle');
		return position();
	}

	/**
	 * Polls `read` until it satisfies `accept` and then stays unchanged for three
	 * samples, so that a value which has not started moving yet is not mistaken for a
	 * value that has come to rest.
	 */
	async function waitUntilStable<T>(read: () => T, accept: (value: T) => boolean, what: string) {
		let last: T | undefined;
		let stable = 0;
		for (let i = 0; i < 500; i++) {
			await timeout(10);
			const current = read();
			stable = (accept(current) && current === last) ? stable + 1 : 0;
			if (stable === 3) {
				return;
			}
			last = current;
		}
		assert.fail(`timed out waiting for ${what}`);
	}

	test('editor.mouseWheelScrollSensitivity is applied', async () => {
		const base = (await scrollByOneWheelTick({}, 1)).top;
		assert.ok(base > 2, `a wheel tick should scroll the multi diff editor, but it moved ${base}px`);

		const scaled = (await scrollByOneWheelTick({ 'editor.mouseWheelScrollSensitivity': 3 }, 1)).top;
		// The scroll target is rounded away from zero, so allow a couple of pixels of slack.
		assert.ok(Math.abs(scaled - base * 3) <= 2, `expected about ${base * 3}px, got ${scaled}px`);
	});

	test('editor.fastScrollSensitivity is applied', async () => {
		const base = (await scrollByOneWheelTick({}, 1)).top;
		assert.ok(base > 2, `a wheel tick should scroll the multi diff editor, but it moved ${base}px`);

		const scaled = (await scrollByOneWheelTick({ 'editor.fastScrollSensitivity': 2 }, 1, 0, true)).top;
		assert.ok(Math.abs(scaled - base * 2) <= 2, `expected about ${base * 2}px, got ${scaled}px`);
	});

	test('editor.scrollPredominantAxis is applied', async () => {
		// A tick that is mostly downwards, with a smaller sideways component.
		const predominant = await scrollByOneWheelTick({}, 1, 0.5);
		assert.ok(predominant.top > 2, `the tick should scroll down, but it moved ${predominant.top}px`);
		assert.strictEqual(predominant.left, 0, 'the smaller sideways component should be dropped');

		const bothAxes = await scrollByOneWheelTick({ 'editor.scrollPredominantAxis': false }, 1, 0.5);
		assert.ok(bothAxes.left > 2, `the tick should also scroll sideways, but it moved ${bothAxes.left}px`);
	});

	// Only the synchronous part is asserted here. The animation itself is driven by
	// `requestAnimationFrame`, which does not run in the hidden window the Electron test
	// runner uses, so where the animation ends is not observable in every environment.
	test('editor.smoothScrolling is applied', async () => {
		const instant = await scrollByOneWheelTick({}, 1);
		assert.ok(instant.immediateTop > 2, `without smooth scrolling the tick should apply at once, but it moved ${instant.immediateTop}px`);

		const smooth = await scrollByOneWheelTick({ 'editor.smoothScrolling': true }, 1);
		assert.strictEqual(smooth.immediateTop, 0, 'with smooth scrolling the tick should be animated, not applied at once');
	});
});
