/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorOptions, DiffEditorWidthBasedLayout } from '../../../browser/widget/diffEditor/diffEditorOptions.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { DiffEditorViewModel, UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { TestDiffProviderFactoryService } from '../diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('DiffEditorWidget2', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const renderSideBySide of [true, false]) {
		test(`compact disclosures expand and collapse with a persistent keyboard target (side by side: ${renderSideBySide})`, async () => {
			const services = new ServiceCollection();
			services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
			services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
				override show() { return emptyProgressRunner; }
			}());
			services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			const instantiationService = createCodeEditorServices(disposables, services);
			const container = document.createElement('div');
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const lines = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i};`);
			const original = disposables.add(instantiateTextModel(instantiationService, lines.join('\n')));
			lines[20] = 'const value20 = 100;';
			const modified = disposables.add(instantiateTextModel(instantiationService, lines.join('\n')));
			const widget = disposables.add(instantiationService.createInstance(DiffEditorWidget, container, {
				renderSideBySide,
				renderGutterMenu: false,
				useInlineViewWhenSpaceIsLimited: false,
				hideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 4 },
			}, {
				variant: 'compact',
				originalEditor: { contributions: [] },
				modifiedEditor: { contributions: [] },
			}));
			const model = disposables.add(RefCounted.create(widget.createViewModel({ original, modified })));
			widget.layout(new Dimension(800, 500));
			widget.setDiffModel(model);
			try {
				await widget.waitForDiff();
				assert.ok(model.object instanceof DiffEditorViewModel);
				const region = model.object.unchangedRegions.get()[0];
				const toggle = container.querySelector<HTMLElement>('.editor.modified .disclosure-toggle')!;
				const initiallyHidden = region.getHiddenModifiedRange(undefined).length;
				toggle.focus();
				toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
				const expanded = {
					hiddenLines: region.getHiddenModifiedRange(undefined).length,
					ariaExpanded: toggle.getAttribute('aria-expanded'),
					retainsFocus: document.activeElement === toggle,
					retainsControl: toggle.isConnected,
				};
				toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
				assert.deepStrictEqual({
					expanded,
					collapsedHiddenLines: region.getHiddenModifiedRange(undefined).length,
					collapsedAriaExpanded: toggle.getAttribute('aria-expanded'),
				}, {
					expanded: { hiddenLines: 0, ariaExpanded: 'true', retainsFocus: true, retainsControl: true },
					collapsedHiddenLines: initiallyHidden,
					collapsedAriaExpanded: 'false',
				});
			} finally {
				widget.setDiffModel(null);
			}
		});
	}

	suite('width based layout', () => {
		test('commits temporary inline when smoothly enlarging from automatic inline', () => {
			const options = new DiffEditorOptions({
				renderSideBySide: true,
				renderSideBySideInlineBreakpoint: 900,
				useInlineViewWhenSpaceIsLimited: true,
			}, undefined, new TestAccessibilityService());

			options.setWidth(1000);
			const initiallySideBySide = options.renderSideBySide.get();
			options.setWidth(800, 1000);
			const inlineDuringResize = options.renderSideBySide.get();
			const temporaryInlineAfterShrinking = options.temporaryInlineMode.get();
			options.setWidth(1000, 1000);
			const restoredDuringResize = options.renderSideBySide.get();
			options.setWidth(800, 1000);
			const temporaryInlineAfterEndingNarrow = options.temporaryInlineMode.get();
			options.setWidth(1000, 800);
			const wideAfterInlineWasCommitted = options.renderSideBySide.get();
			const temporaryInlineMode = options.temporaryInlineMode.get();
			options.setWidth(800);
			const temporaryInlineAfterBecomingNarrow = options.temporaryInlineMode.get();
			options.setWidth(1000, 800);
			options.resetWidthBasedLayout();
			const wideAfterResettingAutomatic = options.renderSideBySide.get();
			options.setWidth(800);
			const automaticInlineResult = options.renderSideBySideInAutomaticMode.get();
			options.setWidth(1000);
			const automaticSideBySideResult = options.renderSideBySideInAutomaticMode.get();
			options.updateOptions({ renderSideBySide: false });
			options.updateOptions({ renderSideBySide: true });

			assert.deepStrictEqual({
				initiallySideBySide,
				inlineDuringResize,
				temporaryInlineAfterShrinking,
				restoredDuringResize,
				temporaryInlineAfterEndingNarrow,
				wideAfterInlineWasCommitted,
				temporaryInlineMode,
				temporaryInlineAfterBecomingNarrow,
				wideAfterResettingAutomatic,
				automaticInlineResult,
				automaticSideBySideResult,
				wideAfterExplicitlyRestoringAuto: options.renderSideBySide.get(),
			}, {
				initiallySideBySide: true,
				inlineDuringResize: false,
				temporaryInlineAfterShrinking: false,
				restoredDuringResize: true,
				temporaryInlineAfterEndingNarrow: false,
				wideAfterInlineWasCommitted: false,
				temporaryInlineMode: true,
				temporaryInlineAfterBecomingNarrow: false,
				wideAfterResettingAutomatic: true,
				automaticInlineResult: false,
				automaticSideBySideResult: true,
				wideAfterExplicitlyRestoringAuto: true,
			});
		});

		test('keeps auto layout after a non-resize layout change', () => {
			const options = new DiffEditorOptions({
				renderSideBySide: true,
				renderSideBySideInlineBreakpoint: 900,
				useInlineViewWhenSpaceIsLimited: true,
			}, undefined, new TestAccessibilityService());

			options.setWidth(800);
			const narrow = options.renderSideBySide.get();
			options.setWidth(1000);

			assert.deepStrictEqual({
				narrow,
				wideAfterLayoutChange: options.renderSideBySide.get(),
			}, {
				narrow: false,
				wideAfterLayoutChange: true,
			});
		});

		test('shares the layout between diff editors that get reused for other documents', async () => {
			const services = new ServiceCollection();
			services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
			services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
				override show() { return emptyProgressRunner; }
			}());
			services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			const instantiationService = createCodeEditorServices(disposables, services);
			const widthBasedLayout = observableValue<DiffEditorWidthBasedLayout>('widthBasedLayout', 'auto');
			const createEditor = () => disposables.add(instantiationService.createInstance(DiffEditorWidget, document.createElement('div'), { renderGutterMenu: false }, {
				widthBasedLayout,
				originalEditor: { contributions: [] },
				modifiedEditor: { contributions: [] },
			}));
			const createModel = (editor: DiffEditorWidget) => disposables.add(RefCounted.create(editor.createViewModel({
				original: disposables.add(instantiateTextModel(instantiationService, 'original')),
				modified: disposables.add(instantiateTextModel(instantiationService, 'modified')),
			})));
			const withPointerDown = (update: () => void) => {
				mainWindow.dispatchEvent(new MouseEvent('mousedown'));
				update();
				mainWindow.dispatchEvent(new MouseEvent('mouseup'));
			};

			const first = createEditor();
			// Last laid out while narrow, then released (like a pooled multi diff editor template).
			const reused = createEditor();
			reused.setDiffModel(createModel(reused));
			reused.layout(new Dimension(800, 100));
			reused.setDiffModel(null);

			first.setDiffModel(createModel(first));
			first.layout(new Dimension(800, 100));
			withPointerDown(() => first.layout(new Dimension(1000, 100)));
			const created = createEditor();
			created.setDiffModel(createModel(created));
			created.layout(new Dimension(1000, 100));
			const afterEnlarging = { first: first.renderSideBySide, created: created.renderSideBySide };
			first.setDiffModel(createModel(first));
			const afterShowingOtherDocuments = first.renderSideBySide;

			first.resetWidthBasedLayout();
			// E.g. bound while the scrollbar is dragged: laying out other documents is not a resize.
			withPointerDown(() => {
				reused.setDiffModel(createModel(reused));
				reused.layout(new Dimension(1000, 100));
			});
			const afterReset = { first: first.renderSideBySide, created: created.renderSideBySide, reused: reused.renderSideBySide };

			const editors = [first, created, reused];
			await Promise.all(editors.map(editor => editor.waitForDiff()));
			for (const editor of editors) {
				editor.setDiffModel(null);
			}

			assert.deepStrictEqual({ afterEnlarging, afterShowingOtherDocuments, afterReset }, {
				afterEnlarging: { first: false, created: false },
				afterShowingOtherDocuments: false,
				afterReset: { first: true, created: true, reused: true },
			});
		});

		for (const sharesWidthBasedLayout of [true, false]) {
			test(`keeps detecting a resize after showing other documents at the same width (shares width based layout: ${sharesWidthBasedLayout})`, async () => {
				const services = new ServiceCollection();
				services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
				services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
					override show() { return emptyProgressRunner; }
				}());
				services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
				const instantiationService = createCodeEditorServices(disposables, services);
				const widthBasedLayout = sharesWidthBasedLayout ? observableValue<DiffEditorWidthBasedLayout>('widthBasedLayout', 'auto') : undefined;
				const editor = disposables.add(instantiationService.createInstance(DiffEditorWidget, document.createElement('div'), { renderGutterMenu: false }, {
					widthBasedLayout,
					originalEditor: { contributions: [] },
					modifiedEditor: { contributions: [] },
				}));
				const createModel = () => disposables.add(RefCounted.create(editor.createViewModel({
					original: disposables.add(instantiateTextModel(instantiationService, 'original')),
					modified: disposables.add(instantiateTextModel(instantiationService, 'modified')),
				})));

				editor.setDiffModel(createModel());
				editor.layout(new Dimension(900, 100));
				editor.setDiffModel(createModel());
				editor.layout(new Dimension(900, 100));
				mainWindow.dispatchEvent(new MouseEvent('mousedown'));
				editor.layout(new Dimension(901, 100));
				editor.layout(new Dimension(920, 100));
				mainWindow.dispatchEvent(new MouseEvent('mouseup'));
				const renderSideBySideAfterEnlarging = editor.renderSideBySide;

				await editor.waitForDiff();
				editor.setDiffModel(null);

				assert.deepStrictEqual({ renderSideBySideAfterEnlarging }, { renderSideBySideAfterEnlarging: false });
			});
		}
	});

	suite('UnchangedRegion', () => {
		function serialize(regions: UnchangedRegion[]): unknown {
			return regions.map(r => `${r.originalUnchangedRange} - ${r.modifiedUnchangedRange}`);
		}

		test('Everything changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(1, 10), new LineRange(1, 10), [])],
				10,
				10,
				3,
				3,
			)), []);
		});

		test('Nothing changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[],
				10,
				10,
				3,
				3,
			)), [
				'[1,11) - [1,11)'
			]);
		});

		test('Change in the middle', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(50, 60), new LineRange(50, 60), [])],
				100,
				100,
				3,
				3,
			)), ([
				'[1,47) - [1,47)',
				'[63,101) - [63,101)'
			]));
		});

		test('Change at the end', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(99, 100), new LineRange(100, 100), [])],
				100,
				100,
				3,
				3,
			)), (['[1,96) - [1,96)']));
		});
	});
});
