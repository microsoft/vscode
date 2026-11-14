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
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../editor/browser/widget/diffEditor/utils.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { ITextModel } from '../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../editor/common/services/resolverService.js';
import { SMOOTH_SCROLLING_TIME } from '../../../editor/common/viewLayout/viewLayout.js';
import { TestDiffProviderFactoryService } from '../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { instantiateTextModel } from '../../../editor/test/common/testTextModel.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

/** The size the multi diff editor is laid out at, in pixels. */
const VIEWPORT = new Dimension(600, 300);

/** A multi diff editor that shows one file and is ready to be scrolled. */
interface IScrollFixture {
	/** The widget, laid out and with its view model attached. */
	readonly widget: MultiDiffEditorWidget;
	/** The configuration the widget reads the scrolling settings from. */
	readonly configurationService: TestConfigurationService;
	/** The element of the scrollable that hosts all files and handles the wheel. */
	readonly scrollableElement: HTMLElement;
}

/** A scroll position of the multi diff editor, in pixels. */
interface IScrollPosition {
	/** The vertical scroll position. */
	readonly top: number;
	/** The horizontal scroll position. */
	readonly left: number;
}

/** How far one wheel tick scrolled the multi diff editor, in pixels. */
interface IScrollResult {
	/** How far it scrolled down once any animation finished. */
	readonly top: number;
	/** How far it scrolled right once any animation finished. */
	readonly left: number;
	/** How far it had already scrolled down synchronously, before any animation ran. */
	readonly immediateTop: number;
}

/** Tests that the scrollable hosting all files of the multi diff editor applies the editor scrolling settings. */
suite('MultiDiffEditorWidget - scrolling settings', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Returns 200 lines that all differ from the lines built for another `word`. The lines are
	 * long so that the content is also wider than the viewport.
	 */
	function buildText(word: string): string {
		return Array.from({ length: 200 }, (_, i) => `const value${i} = '${word}'; // ${'pad '.repeat(40)}`).join('\n');
	}

	/**
	 * Creates a multi diff editor with the user settings in `configuration`, waits until its
	 * content is laid out, and calls `run` with it. The editor shows one file in which every line
	 * differs, so no unchanged region is hidden and the content is much larger than the viewport
	 * in both directions. Everything the fixture created is released when `run` settles, before
	 * the next fixture is built.
	 */
	async function withFixture<T>(configuration: Record<string, unknown>, run: (fixture: IScrollFixture) => Promise<T>): Promise<T> {
		// Two stores, so that the widget and everything it shows are torn down before the
		// services they were built from. Both are in the suite's store as well, so the leak
		// check still covers them.
		const widgetStore = disposables.add(new DisposableStore());
		const serviceStore = disposables.add(new DisposableStore());
		let attachedWidget: MultiDiffEditorWidget | undefined;
		try {
			// Build the workbench services around a configuration that the test can change
			// later. `workbenchInstantiationService` lacks two services the widget needs: a diff
			// provider, here one that computes in process, and the service the embedded editors
			// track focus with.
			const configurationService = new TestConfigurationService(configuration);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, serviceStore);
			instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

			// Create standalone models that the model service does not know about. The workbench
			// text model resolver hands models it finds there to editor contributions by URI, and
			// destroys them when the contributions release their references, while the widget
			// still shows them.
			const original = widgetStore.add(instantiateTextModel(instantiationService, buildText('before'), 'typescript', undefined, URI.parse('test://original/values.ts')));
			const modified = widgetStore.add(instantiateTextModel(instantiationService, buildText('after'), 'typescript', undefined, URI.parse('test://modified/values.ts')));
			const documentItem = widgetStore.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original: new DiffItemSource(original.uri, original),
				modified: new DiffItemSource(modified.uri, modified),
			}, { dispose() { } }));

			// Editor contributions such as the word highlighter resolve the models by URI, and the
			// Electron test runner reports a failed resolution as an error. Hand out these two
			// models through references that do not dispose them, and reject any other resource.
			const knownModels = new ResourceMap<ITextModel>();
			knownModels.set(original.uri, original);
			knownModels.set(modified.uri, modified);
			instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
				override async createModelReference(resource: URI) {
					const textEditorModel = knownModels.get(resource);
					if (!textEditorModel) {
						throw new Error(`No test model for ${resource.toString()}`);
					}
					return new ImmortalReference(upcastPartial<IResolvedTextEditorModel>({ textEditorModel }));
				}
				override canHandleResource(resource: URI) { return knownModels.has(resource); }
				override registerTextModelContentProvider() { return Disposable.None; }
			}());

			// Show the file in a widget that is part of the document, so that it gets rendered.
			const container = $('div');
			mainWindow.document.body.appendChild(container);
			widgetStore.add(toDisposable(() => container.remove()));
			const widget = widgetStore.add(instantiationService.createInstance(MultiDiffEditorWidget, container, {}, { variant: 'noCards' }));
			const viewModel = widgetStore.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([documentItem]) }));
			widget.setViewModel(viewModel);
			attachedWidget = widget;

			// Wait for the diff, and for the embedded editors, which report their size
			// asynchronously, until the content stops growing and is larger than the viewport.
			widget.layout(VIEWPORT);
			await waitForState(viewModel.isLoading, isLoading => !isLoading);
			await waitUntilStable(() => widget.getLayoutDebugState().get().scrollDimensions.scrollHeight, height => height > VIEWPORT.height, 'the diff content to be laid out');

			// Run the test against the scrollable that hosts all files.
			const scrollableElement = widget.getRootElement().querySelector<HTMLElement>('.monaco-scrollable-element')!;
			return await run({ widget, configurationService, scrollableElement });
		} finally {
			// Detach the view model first. The widget store disposes the text models before the
			// widget, which a diff editor that still shows them reports as an error.
			attachedWidget?.setViewModel(undefined);
			widgetStore.dispose();
			serviceStore.dispose();
		}
	}

	/**
	 * Scrolls `fixture` by one wheel tick and reports how far it moved. `down` and `right` are in
	 * ticks, and `altKey` applies `editor.fastScrollSensitivity`.
	 */
	async function scrollByOneWheelTick(fixture: IScrollFixture, down: number, right = 0, altKey = false): Promise<IScrollResult> {
		// Smooth scrolling only animates ticks that `MouseWheelClassifier.INSTANCE` takes for a
		// physical mouse wheel, and every event dispatched here, in this test or an earlier one,
		// adds to its global history. A single integer tick on a clean history already counts as
		// physical, but the classifier weights the last few events, so events from earlier ticks
		// can tip the result. Identical ticks first make the result independent of that history.
		for (let i = 0; i < 4; i++) {
			fixture.scrollableElement.dispatchEvent(createWheelEvent(down, right, altKey));
		}
		const animated = fixture.configurationService.getValue('editor.smoothScrolling') === true;
		const before = await settle(fixture.widget, animated);

		// Dispatch the measured tick, and note how far it scrolled before any animation ran.
		fixture.scrollableElement.dispatchEvent(createWheelEvent(down, right, altKey));
		const immediate = readScrollPosition(fixture.widget);
		const after = await settle(fixture.widget, animated);
		return { top: after.top - before.top, left: after.left - before.left, immediateTop: immediate.top - before.top };
	}

	/**
	 * Returns a wheel tick, expressed the way `StandardWheelEvent` reads it: it prefers the legacy
	 * `wheelDelta*` properties over `delta*`, and Chrome leaves those at 0 on constructed events.
	 * One tick is 120, and scrolling down or right is negative.
	 */
	function createWheelEvent(down: number, right: number, altKey: boolean): WheelEvent {
		const event = new WheelEvent('wheel', { deltaY: down * 120, deltaX: right * 120, cancelable: true, altKey });
		Object.defineProperty(event, 'wheelDeltaY', { value: -down * 120 });
		Object.defineProperty(event, 'wheelDeltaX', { value: -right * 120 });
		return event;
	}

	/**
	 * Changes the user setting `key` to `value`, or removes it if `value` is undefined, and fires
	 * the change event that `TestConfigurationService.setUserConfiguration` does not.
	 */
	async function updateSetting(configurationService: TestConfigurationService, key: string, value: unknown): Promise<void> {
		// Store the value.
		await configurationService.setUserConfiguration(key, value);

		// Announce the change. Like the real event, it also affects the sections that contain
		// the key.
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: section => section === key || key.startsWith(`${section}.`),
		});
	}

	/**
	 * Returns the scroll position from the widget's layout debug state. Don't use
	 * `getViewState` here: it writes cached template data in a transaction.
	 */
	function readScrollPosition(widget: MultiDiffEditorWidget): IScrollPosition {
		const state = widget.getLayoutDebugState().get();
		return { top: state.layout.scrollTop, left: state.scrollLeft };
	}

	/**
	 * Waits for any smooth scroll animation to finish and returns the resting position.
	 * `animated` says whether an animation may be running.
	 */
	async function settle(widget: MultiDiffEditorWidget, animated: boolean): Promise<IScrollPosition> {
		// Give an animation its full duration before checking whether it has come to rest.
		if (animated) {
			await timeout(SMOOTH_SCROLLING_TIME);
		}

		// Wait for the position to stop changing.
		return waitUntilStable(() => readScrollPosition(widget), () => true, 'the scroll position to settle', (a, b) => a.top === b.top && a.left === b.left);
	}

	/**
	 * Samples `read` every 10 ms until it returns a value that satisfies `accept` and then stays
	 * `equal` for three samples, and returns that value. Requiring stability keeps a value that
	 * has not started changing yet from being mistaken for one that has come to rest. Fails the
	 * test with `what` if that takes more than 500 samples.
	 */
	async function waitUntilStable<T>(read: () => T, accept: (value: T) => boolean, what: string, equal: (a: T, b: T) => boolean = (a, b) => a === b): Promise<T> {
		let last: T | undefined;
		let stable = 0;
		for (let i = 0; i < 500; i++) {
			await timeout(10);
			const current = read();
			stable = (accept(current) && last !== undefined && equal(current, last)) ? stable + 1 : 0;
			if (stable === 3) {
				return current;
			}
			last = current;
		}
		assert.fail(`timed out waiting for ${what}`);
	}

	/** Checks that a widget created with a higher `editor.mouseWheelScrollSensitivity` scrolls further per tick. */
	test('editor.mouseWheelScrollSensitivity is applied', async () => {
		// Scroll a widget with the default sensitivity and one created with a higher one.
		const base = await withFixture({}, fixture => scrollByOneWheelTick(fixture, 1));
		const scaled = await withFixture({ 'editor.mouseWheelScrollSensitivity': 3 }, fixture => scrollByOneWheelTick(fixture, 1));

		// The scroll target is rounded, so allow two pixels of slack in the distance.
		assert.deepStrictEqual({
			baseScrolls: base.top > 2,
			scaledWithinTolerance: Math.abs(scaled.top - base.top * 3) <= 2,
		}, {
			baseScrolls: true,
			scaledWithinTolerance: true,
		});
	});

	/** Checks that a widget created with a different `editor.fastScrollSensitivity` applies it to ticks with Alt held. */
	test('editor.fastScrollSensitivity is applied', async () => {
		// Scroll a widget without Alt, and one created with a fast scroll sensitivity with Alt.
		const base = await withFixture({}, fixture => scrollByOneWheelTick(fixture, 1));
		const fast = await withFixture({ 'editor.fastScrollSensitivity': 2 }, fixture => scrollByOneWheelTick(fixture, 1, 0, true));

		// The scroll target is rounded, so allow two pixels of slack in the distance.
		assert.deepStrictEqual({
			baseScrolls: base.top > 2,
			fastWithinTolerance: Math.abs(fast.top - base.top * 2) <= 2,
		}, {
			baseScrolls: true,
			fastWithinTolerance: true,
		});
	});

	/** Checks that a widget created with `editor.scrollPredominantAxis` off scrolls along both axes of a tick. */
	test('editor.scrollPredominantAxis is applied', async () => {
		// Scroll by a tick that is mostly downwards, with a smaller sideways component.
		const predominant = await withFixture({}, fixture => scrollByOneWheelTick(fixture, 1, 0.5));
		const bothAxes = await withFixture({ 'editor.scrollPredominantAxis': false }, fixture => scrollByOneWheelTick(fixture, 1, 0.5));

		// By default only the downwards component applies.
		assert.deepStrictEqual({
			predominantScrollsDown: predominant.top > 2,
			predominantLeft: predominant.left,
			bothAxesScrollsRight: bothAxes.left > 2,
		}, {
			predominantScrollsDown: true,
			predominantLeft: 0,
			bothAxesScrollsRight: true,
		});
	});

	/**
	 * Checks that a widget created with `editor.smoothScrolling` does not apply a tick at once.
	 * Only this synchronous part is asserted. The animation runs on `requestAnimationFrame`, which
	 * does not run in the hidden window the Electron test runner uses, so where an animation ends
	 * is not observable in every environment.
	 */
	test('editor.smoothScrolling is applied', async () => {
		// Scroll a widget with the default settings and one created with smooth scrolling.
		const instant = await withFixture({}, fixture => scrollByOneWheelTick(fixture, 1));
		const smooth = await withFixture({ 'editor.smoothScrolling': true }, fixture => scrollByOneWheelTick(fixture, 1));

		// Without smooth scrolling the tick applies at once, with it nothing moves synchronously.
		assert.deepStrictEqual({
			instantScrollsAtOnce: instant.immediateTop > 2,
			smoothImmediateTop: smooth.immediateTop,
		}, {
			instantScrollsAtOnce: true,
			smoothImmediateTop: 0,
		});
	});

	/** Checks that an existing widget follows changes to the scrolling settings, including their removal. */
	test('follows changes to the scrolling settings', async () => {
		const { base, scaled, restored, smooth, instant } = await withFixture({}, async fixture => {
			// Scroll with the default sensitivity, a higher one, and the default again.
			const base = await scrollByOneWheelTick(fixture, 1);
			await updateSetting(fixture.configurationService, 'editor.mouseWheelScrollSensitivity', 3);
			const scaled = await scrollByOneWheelTick(fixture, 1);
			await updateSetting(fixture.configurationService, 'editor.mouseWheelScrollSensitivity', undefined);
			const restored = await scrollByOneWheelTick(fixture, 1);

			// Turn smooth scrolling on and off again. As in the test above, only whether a tick
			// applies at once is observable.
			await updateSetting(fixture.configurationService, 'editor.smoothScrolling', true);
			const smooth = await scrollByOneWheelTick(fixture, 1);
			await updateSetting(fixture.configurationService, 'editor.smoothScrolling', undefined);
			const instant = await scrollByOneWheelTick(fixture, 1);
			return { base, scaled, restored, smooth, instant };
		});

		// The scroll target is rounded, so allow two pixels of slack in the distances.
		assert.deepStrictEqual({
			baseScrolls: base.top > 2,
			scaledWithinTolerance: Math.abs(scaled.top - base.top * 3) <= 2,
			restoredWithinTolerance: Math.abs(restored.top - base.top) <= 2,
			smoothImmediateTop: smooth.immediateTop,
			instantImmediateWithinTolerance: Math.abs(instant.immediateTop - base.top) <= 2,
		}, {
			baseScrolls: true,
			scaledWithinTolerance: true,
			restoredWithinTolerance: true,
			smoothImmediateTop: 0,
			instantImmediateWithinTolerance: true,
		});
	});
});
