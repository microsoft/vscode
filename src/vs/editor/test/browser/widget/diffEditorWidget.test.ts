/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../base/browser/dom.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { IDiffEditorConstructionOptions } from '../../../browser/editorBrowser.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorOptions } from '../../../browser/widget/diffEditor/diffEditorOptions.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { DiffEditorViewModel, UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { Position } from '../../../common/core/position.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';
import { IDiffEditorViewState } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';
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
			}, new TestAccessibilityService());

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
			}, new TestAccessibilityService());

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
	});

	suite('hide unchanged regions', () => {
		function createDiffEditor(options: IDiffEditorConstructionOptions) {
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
			const widget = disposables.add(instantiationService.createInstance(DiffEditorWidget, container, {
				renderGutterMenu: false,
				...options,
			}, {
				originalEditor: { contributions: [] },
				modifiedEditor: { contributions: [] },
			}));
			widget.layout(new Dimension(1200, 500));
			const createModel = (changedLines: number[], insertedLineCount = 0) => disposables.add(instantiateTextModel(instantiationService, [
				...Array.from({ length: insertedLineCount }, (_, i) => `inserted ${i + 1}`),
				...Array.from({ length: 100 }, (_, i) => changedLines.includes(i + 1) ? `changed ${i + 1}` : `line ${i + 1}`),
			].join('\n')));
			return { widget, createModel };
		}

		/** Like `TextDiffEditor.setInput`, which computes the diff before setting the model. */
		async function openDiff(widget: DiffEditorWidget, original: ITextModel, modified: ITextModel, viewState?: IDiffEditorViewState): Promise<DiffEditorViewModel> {
			const viewModel = disposables.add(RefCounted.create(widget.createViewModel({ original, modified })));
			await viewModel.object.waitForDiff();
			widget.setDiffModel(viewModel);
			if (viewState) {
				widget.restoreViewState(viewState);
			}
			return viewModel.object as DiffEditorViewModel;
		}

		function getUnchangedRegions(viewModel: DiffEditorViewModel): string[] {
			return viewModel.unchangedRegions.get().map(r => `${r.modifiedUnchangedRange} top: ${r.visibleLineCountTop.get()}, bottom: ${r.visibleLineCountBottom.get()}`);
		}

		test('moving the cursor while unchanged regions are shown does not reveal them once they are hidden', async () => {
			const { widget, createModel } = createDiffEditor({ hideUnchangedRegions: { enabled: false } });
			try {
				const viewModel = await openDiff(widget, createModel([]), createModel([50]));
				widget.getModifiedEditor().setPosition(new Position(10, 1));
				widget.getModifiedEditor().setPosition(new Position(90, 1));
				widget.getOriginalEditor().setPosition(new Position(20, 1));
				widget.updateOptions({ hideUnchangedRegions: { enabled: true } });

				assert.deepStrictEqual(getUnchangedRegions(viewModel), [
					'[1,47) top: 0, bottom: 0',
					'[54,101) top: 0, bottom: 0',
				]);
			} finally {
				widget.setDiffModel(null);
			}
		});

		test('moving the cursor in the original editor reveals up to that line', async () => {
			const { widget, createModel } = createDiffEditor({ hideUnchangedRegions: { enabled: true } });
			try {
				// The inserted lines shift the line numbers of the modified side
				const viewModel = await openDiff(widget, createModel([]), createModel([50], 3));
				widget.getOriginalEditor().setPosition(new Position(10, 1));
				widget.getOriginalEditor().setPosition(new Position(80, 1));

				assert.deepStrictEqual(getUnchangedRegions(viewModel), [
					'[7,50) top: 7, bottom: 0',
					'[57,104) top: 0, bottom: 21',
				]);
			} finally {
				widget.setDiffModel(null);
			}
		});

		test('view state saved while unchanged regions are shown does not reveal them once they are hidden', async () => {
			const { widget, createModel } = createDiffEditor({ hideUnchangedRegions: { enabled: false } });
			const original = createModel([]);
			const modified = createModel([50]);
			try {
				await openDiff(widget, original, modified);
				widget.getModifiedEditor().setPosition(new Position(80, 1));
				const viewState = widget.saveViewState();

				widget.updateOptions({ hideUnchangedRegions: { enabled: true } });
				const viewModel = await openDiff(widget, original, modified, viewState);

				assert.deepStrictEqual(getUnchangedRegions(viewModel), [
					'[1,47) top: 0, bottom: 0',
					'[54,101) top: 0, bottom: 0',
				]);
			} finally {
				widget.setDiffModel(null);
			}
		});

		test('view state restored while unchanged regions are shown does not reveal them once they are hidden', async () => {
			const { widget, createModel } = createDiffEditor({ hideUnchangedRegions: { enabled: true } });
			const original = createModel([]);
			const modified = createModel([50]);
			try {
				const viewModel1 = await openDiff(widget, original, modified);
				viewModel1.unchangedRegions.get()[0].showMoreBelow(5, undefined);
				const viewState = widget.saveViewState();

				widget.updateOptions({ hideUnchangedRegions: { enabled: false } });
				const viewModel2 = await openDiff(widget, original, modified, viewState);
				widget.updateOptions({ hideUnchangedRegions: { enabled: true } });

				assert.deepStrictEqual(getUnchangedRegions(viewModel2), [
					'[1,47) top: 0, bottom: 0',
					'[54,101) top: 0, bottom: 0',
				]);
			} finally {
				widget.setDiffModel(null);
			}
		});

		test('restoring a view state only restores unchanged regions that did not change', async () => {
			const { widget, createModel } = createDiffEditor({ hideUnchangedRegions: { enabled: true } });
			const original = createModel([]);
			try {
				const viewModel1 = await openDiff(widget, original, createModel([30, 60]));
				widget.getModifiedEditor().setPosition(new Position(80, 1));
				widget.collapseAllUnchangedRegions();
				viewModel1.unchangedRegions.get()[0].showMoreBelow(5, undefined);
				const viewState = widget.saveViewState();

				const viewModel2 = await openDiff(widget, original, createModel([30]), viewState);

				assert.deepStrictEqual(getUnchangedRegions(viewModel2), [
					'[1,27) top: 0, bottom: 5',
					'[34,101) top: 0, bottom: 0',
				]);
			} finally {
				widget.setDiffModel(null);
			}
		});
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
