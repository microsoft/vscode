/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { ArrayQueue } from '../../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun, derived, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { assertReturnsDefined } from '../../../../../../base/common/types.js';
import { applyFontInfo } from '../../../../config/domFontInfo.js';
import { CodeEditorWidget } from '../../../codeEditor/codeEditorWidget.js';
import { diffDeleteDecoration, diffRemoveIcon } from '../../registrations.contribution.js';
import { DiffEditorEditors } from '../diffEditorEditors.js';
import { DiffEditorViewModel, DiffMapping } from '../../diffEditorViewModel.js';
import { DiffEditorWidget } from '../../diffEditorWidget.js';
import { InlineDiffDeletedCodeMargin } from './inlineDiffDeletedCodeMargin.js';
import { LineSource, RenderOptions, renderLines } from './renderLines.js';
import { IObservableViewZone, animatedObservable, joinCombine } from '../../utils.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { DetailedLineRangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { ScrollType } from '../../../../../common/editorCommon.js';
import { BackgroundTokenizationState } from '../../../../../common/tokenizationTextModelPart.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { DiffEditorOptions } from '../../diffEditorOptions.js';
import { Range } from '../../../../../common/core/range.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../common/viewModel/inlineDecorations.js';

/**
 * Ensures both editors have the same height by aligning unchanged lines.
 * In inline view mode, inserts viewzones to show deleted code from the original text model in the modified code editor.
 * Synchronizes scrolling.
 *
 * Make sure to add the view zones!
 */
export class DiffEditorViewZones extends Disposable {
	private readonly _originalTopPadding;
	private readonly _originalScrollTop: IObservable<number>;
	private readonly _originalScrollOffset;
	private readonly _originalScrollOffsetAnimated;

	private readonly _modifiedTopPadding;
	private readonly _modifiedScrollTop: IObservable<number>;
	private readonly _modifiedScrollOffset;
	private readonly _modifiedScrollOffsetAnimated;

	public readonly viewZones: IObservable<{ orig: IObservableViewZone[]; mod: IObservableViewZone[] }>;

	constructor(
		private readonly _targetWindow: Window,
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
		private readonly _diffEditorWidget: DiffEditorWidget,
		private readonly _canIgnoreViewZoneUpdateEvent: () => boolean,
		private readonly _origViewZonesToIgnore: Set<string>,
		private readonly _modViewZonesToIgnore: Set<string>,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();
		this._originalTopPadding = observableValue(this, 0);
		this._originalScrollOffset = observableValue<number, boolean>(this, 0);
		this._originalScrollOffsetAnimated = animatedObservable(this._targetWindow, this._originalScrollOffset, this._store);
		this._modifiedTopPadding = observableValue(this, 0);
		this._modifiedScrollOffset = observableValue<number, boolean>(this, 0);
		this._modifiedScrollOffsetAnimated = animatedObservable(this._targetWindow, this._modifiedScrollOffset, this._store);

		const state = observableValue('invalidateAlignmentsState', 0);

		const updateImmediately = this._register(new RunOnceScheduler(() => {
			state.set(state.get() + 1, undefined);
		}, 0));

		this._register(this._editors.original.onDidChangeViewZones((_args) => { if (!this._canIgnoreViewZoneUpdateEvent()) { updateImmediately.schedule(); } }));
		this._register(this._editors.modified.onDidChangeViewZones((_args) => { if (!this._canIgnoreViewZoneUpdateEvent()) { updateImmediately.schedule(); } }));
		this._register(this._editors.original.onDidChangeConfiguration((args) => {
			if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) { updateImmediately.schedule(); }
		}));
		this._register(this._editors.modified.onDidChangeConfiguration((args) => {
			if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) { updateImmediately.schedule(); }
		}));

		const originalModelTokenizationCompleted = this._diffModel.map(m =>
			m ? observableFromEvent(this, m.model.original.onDidChangeTokens, () => m.model.original.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) : undefined
		).map((m, reader) => m?.read(reader));

		const alignments = derived<ILineRangeAlignment[] | null>((reader) => {
			/** @description alignments */
			const diffModel = this._diffModel.read(reader);
			const diff = diffModel?.diff.read(reader);
			if (!diffModel || !diff) { return null; }
			state.read(reader);
			const renderSideBySide = this._options.renderSideBySide.read(reader);
			const innerHunkAlignment = renderSideBySide;
			return computeRangeAlignment(
				this._editors.original,
				this._editors.modified,
				diff.mappings,
				this._origViewZonesToIgnore,
				this._modViewZonesToIgnore,
				innerHunkAlignment
			);
		});

		const alignmentsSyncedMovedText = derived<ILineRangeAlignment[] | null>((reader) => {
			/** @description alignmentsSyncedMovedText */
			const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
			if (!syncedMovedText) { return null; }
			state.read(reader);
			const mappings = syncedMovedText.changes.map(c => new DiffMapping(c));
			// TODO dont include alignments outside syncedMovedText
			return computeRangeAlignment(
				this._editors.original,
				this._editors.modified,
				mappings,
				this._origViewZonesToIgnore,
				this._modViewZonesToIgnore,
				true
			);
		});

		function createFakeLinesDiv(): HTMLElement {
			const r = document.createElement('div');
			r.className = 'diagonal-fill';
			return r;
		}

		const alignmentViewZonesDisposables = this._register(new DisposableStore());
		this.viewZones = derived<{ orig: IObservableViewZone[]; mod: IObservableViewZone[] }>(this, (reader) => {
			alignmentViewZonesDisposables.clear();

			const alignmentsVal = alignments.read(reader) || [];

			const origViewZones: IObservableViewZone[] = [];
			const modViewZones: IObservableViewZone[] = [];

			const modifiedTopPaddingVal = this._modifiedTopPadding.read(reader);
			if (modifiedTopPaddingVal > 0) {
				modViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: modifiedTopPaddingVal,
					showInHiddenAreas: true,
					suppressMouseDown: true,
				});
			}
			const originalTopPaddingVal = this._originalTopPadding.read(reader);
			if (originalTopPaddingVal > 0) {
				origViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: originalTopPaddingVal,
					showInHiddenAreas: true,
					suppressMouseDown: true,
				});
			}

			const renderSideBySide = this._options.renderSideBySide.read(reader);

			const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer() : undefined;
			if (deletedCodeLineBreaksComputer) {
				const originalModel = this._editors.original.getModel()!;
				for (const a of alignmentsVal) {
					if (a.diff) {
						for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
							// `i` can be out of bound when the diff has not been updated yet.
							// In this case, we do an early return.
							// TODO@hediet: Fix this by applying the edit directly to the diff model, so that the diff is always valid.
							if (i > originalModel.getLineCount()) {
								return { orig: origViewZones, mod: modViewZones };
							}
							deletedCodeLineBreaksComputer?.addRequest(originalModel.getLineContent(i), null, null);
						}
					}
				}
			}

			const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
			let lineBreakDataIdx = 0;

			const modLineHeight = this._editors.modified.getOption(EditorOption.lineHeight);

			const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);

			const mightContainNonBasicASCII = this._editors.original.getModel()?.mightContainNonBasicASCII() ?? false;
			const mightContainRTL = this._editors.original.getModel()?.mightContainRTL() ?? false;
			const renderOptions = RenderOptions.fromEditor(this._editors.modified);

			for (const a of alignmentsVal) {
				if (a.diff && !renderSideBySide && (!this._options.useTrueInlineDiffRendering.read(reader) || !allowsTrueInlineDiffRendering(a.diff))) {
					if (!a.originalRange.isEmpty) {
						originalModelTokenizationCompleted.read(reader); // Update view-zones once tokenization completes

						const deletedCodeDomNode = document.createElement('div');
						deletedCodeDomNode.classList.add('view-lines', 'line-delete', 'monaco-mouse-cursor-text');
						const originalModel = this._editors.original.getModel()!;
						// `a.originalRange` can be out of bound when the diff has not been updated yet.
						// In this case, we do an early return.
						// TODO@hediet: Fix this by applying the edit directly to the diff model, so that the diff is always valid.
						if (a.originalRange.endLineNumberExclusive - 1 > originalModel.getLineCount()) {
							return { orig: origViewZones, mod: modViewZones };
						}
						const source = new LineSource(
							a.originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)),
							a.originalRange.mapToLineArray(_ => lineBreakData[lineBreakDataIdx++]),
							mightContainNonBasicASCII,
							mightContainRTL,
						);
						const decorations: InlineDecoration[] = [];
						for (const i of a.diff.innerChanges || []) {
							decorations.push(new InlineDecoration(
								i.originalRange.delta(-(a.diff.original.startLineNumber - 1)),
								diffDeleteDecoration.className!,
								InlineDecorationType.Regular
							));
						}
						const result = renderLines(source, renderOptions, decorations, deletedCodeDomNode);

						const marginDomNode = document.createElement('div');
						marginDomNode.className = 'inline-deleted-margin-view-zone';
						applyFontInfo(marginDomNode, renderOptions.fontInfo);

						if (this._options.renderIndicators.read(reader)) {
							for (let i = 0; i < result.heightInLines; i++) {
								const marginElement = document.createElement('div');
								marginElement.className = `delete-sign ${ThemeIcon.asClassName(diffRemoveIcon)}`;
								marginElement.setAttribute('style', `position:absolute;top:${i * modLineHeight}px;width:${renderOptions.lineDecorationsWidth}px;height:${modLineHeight}px;right:0;`);
								marginDomNode.appendChild(marginElement);
							}
						}

						let zoneId: string | undefined = undefined;
						alignmentViewZonesDisposables.add(
							new InlineDiffDeletedCodeMargin(
								() => assertReturnsDefined(zoneId),
								marginDomNode,
								this._editors.modified,
								a.diff,
								this._diffEditorWidget,
								result.viewLineCounts,
								this._editors.original.getModel()!,
								this._contextMenuService,
								this._clipboardService,
							)
						);

						for (let i = 0; i < result.viewLineCounts.length; i++) {
							const count = result.viewLineCounts[i];
							// Account for wrapped lines in the (collapsed) original editor (which doesn't wrap lines).
							if (count > 1) {
								origViewZones.push({
									afterLineNumber: a.originalRange.startLineNumber + i,
									domNode: createFakeLinesDiv(),
									heightInPx: (count - 1) * modLineHeight,
									showInHiddenAreas: true,
									suppressMouseDown: true,
								});
							}
						}

						modViewZones.push({
							afterLineNumber: a.modifiedRange.startLineNumber - 1,
							domNode: deletedCodeDomNode,
							heightInPx: result.heightInLines * modLineHeight,
							minWidthInPx: result.minWidthInPx,
							marginDomNode,
							setZoneId(id) { zoneId = id; },
							showInHiddenAreas: true,
							suppressMouseDown: true,
						});
					}

					const marginDomNode = document.createElement('div');
					marginDomNode.className = 'gutter-delete';

					origViewZones.push({
						afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
						domNode: createFakeLinesDiv(),
						heightInPx: a.modifiedHeightInPx,
						marginDomNode,
						showInHiddenAreas: true,
						suppressMouseDown: true,
					});
				} else {
					const delta = a.modifiedHeightInPx - a.originalHeightInPx;
					if (delta > 0) {
						if (syncedMovedText?.lineRangeMapping.original.delta(-1).deltaLength(2).contains(a.originalRange.endLineNumberExclusive - 1)) {
							continue;
						}

						origViewZones.push({
							afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: delta,
							showInHiddenAreas: true,
							suppressMouseDown: true,
						});
					} else {
						if (syncedMovedText?.lineRangeMapping.modified.delta(-1).deltaLength(2).contains(a.modifiedRange.endLineNumberExclusive - 1)) {
							continue;
						}

						function createViewZoneMarginArrow(): HTMLElement {
							const arrow = document.createElement('div');
							arrow.className = 'arrow-revert-change ' + ThemeIcon.asClassName(Codicon.arrowRight);
							reader.store.add(addDisposableListener(arrow, 'mousedown', e => e.stopPropagation()));
							reader.store.add(addDisposableListener(arrow, 'click', e => {
								e.stopPropagation();
								_diffEditorWidget.revert(a.diff!);
							}));
							return $('div', {}, arrow);
						}

						let marginDomNode: HTMLElement | undefined = undefined;
						if (a.diff && a.diff.modified.isEmpty && this._options.shouldRenderOldRevertArrows.read(reader)) {
							marginDomNode = createViewZoneMarginArrow();
						}

						modViewZones.push({
							afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: -delta,
							marginDomNode,
							showInHiddenAreas: true,
							suppressMouseDown: true,
						});
					}
				}
			}

			for (const a of alignmentsSyncedMovedText.read(reader) ?? []) {
				if (!syncedMovedText?.lineRangeMapping.original.intersect(a.originalRange)
					|| !syncedMovedText?.lineRangeMapping.modified.intersect(a.modifiedRange)) {
					// ignore unrelated alignments outside the synced moved text
					continue;
				}

				const delta = a.modifiedHeightInPx - a.originalHeightInPx;
				if (delta > 0) {
					origViewZones.push({
						afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
						domNode: createFakeLinesDiv(),
						heightInPx: delta,
						showInHiddenAreas: true,
						suppressMouseDown: true,
					});
				} else {
					modViewZones.push({
						afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
						domNode: createFakeLinesDiv(),
						heightInPx: -delta,
						showInHiddenAreas: true,
						suppressMouseDown: true,
					});
				}
			}

			return { orig: origViewZones, mod: modViewZones };
		});

		let ignoreChange = false;
		this._register(this._editors.original.onDidScrollChange(e => {
			if (e.scrollLeftChanged && !ignoreChange) {
				ignoreChange = true;
				this._editors.modified.setScrollLeft(e.scrollLeft);
				ignoreChange = false;
			}
		}));
		this._register(this._editors.modified.onDidScrollChange(e => {
			if (e.scrollLeftChanged && !ignoreChange) {
				ignoreChange = true;
				this._editors.original.setScrollLeft(e.scrollLeft);
				ignoreChange = false;
			}
		}));

		this._originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => /** @description original.getScrollTop */ this._editors.original.getScrollTop());
		this._modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => /** @description modified.getScrollTop */ this._editors.modified.getScrollTop());

		// origExtraHeight + origOffset - origScrollTop = modExtraHeight + modOffset - modScrollTop

		// origScrollTop = origExtraHeight + origOffset - modExtraHeight - modOffset + modScrollTop
		// modScrollTop = modExtraHeight + modOffset - origExtraHeight - origOffset + origScrollTop

		// origOffset - modOffset = heightOfLines(1..Y) - heightOfLines(1..X)
		// origScrollTop >= 0, modScrollTop >= 0

		this._register(autorun(reader => {
			/** @description update scroll modified */
			const newScrollTopModified = this._originalScrollTop.read(reader)
				- (this._originalScrollOffsetAnimated.get() - this._modifiedScrollOffsetAnimated.read(reader))
				- (this._originalTopPadding.get() - this._modifiedTopPadding.read(reader));
			if (newScrollTopModified !== this._editors.modified.getScrollTop()) {
				this._editors.modified.setScrollTop(newScrollTopModified, ScrollType.Immediate);
			}
		}));

		this._register(autorun(reader => {
			/** @description update scroll original */
			const newScrollTopOriginal = this._modifiedScrollTop.read(reader)
				- (this._modifiedScrollOffsetAnimated.get() - this._originalScrollOffsetAnimated.read(reader))
				- (this._modifiedTopPadding.get() - this._originalTopPadding.read(reader));
			if (newScrollTopOriginal !== this._editors.original.getScrollTop()) {
				this._editors.original.setScrollTop(newScrollTopOriginal, ScrollType.Immediate);
			}
		}));


		this._register(autorun(reader => {
			/** @description update editor top offsets */
			const m = this._diffModel.read(reader)?.movedTextToCompare.read(reader);

			let deltaOrigToMod = 0;
			if (m) {
				const trueTopOriginal = this._editors.original.getTopForLineNumber(m.lineRangeMapping.original.startLineNumber, true) - this._originalTopPadding.get();
				const trueTopModified = this._editors.modified.getTopForLineNumber(m.lineRangeMapping.modified.startLineNumber, true) - this._modifiedTopPadding.get();
				deltaOrigToMod = trueTopModified - trueTopOriginal;
			}

			if (deltaOrigToMod > 0) {
				this._modifiedTopPadding.set(0, undefined);
				this._originalTopPadding.set(deltaOrigToMod, undefined);
			} else if (deltaOrigToMod < 0) {
				this._modifiedTopPadding.set(-deltaOrigToMod, undefined);
				this._originalTopPadding.set(0, undefined);
			} else {
				setTimeout(() => {
					this._modifiedTopPadding.set(0, undefined);
					this._originalTopPadding.set(0, undefined);
				}, 400);
			}

			if (this._editors.modified.hasTextFocus()) {
				this._originalScrollOffset.set(this._modifiedScrollOffset.get() - deltaOrigToMod, undefined, true);
			} else {
				this._modifiedScrollOffset.set(this._originalScrollOffset.get() + deltaOrigToMod, undefined, true);
			}
		}));
	}
}

interface ILineRangeAlignment {
	originalRange: LineRange;
	modifiedRange: LineRange;

	// accounts for foreign viewzones and line wrapping
	originalHeightInPx: number;
	modifiedHeightInPx: number;

	/**
	 * If this range alignment is a direct result of a diff, then this is the diff's line mapping.
	 * Only used for inline-view.
	 */
	diff?: DetailedLineRangeMapping;
}

function computeRangeAlignment(
	originalEditor: CodeEditorWidget,
	modifiedEditor: CodeEditorWidget,
	diffs: readonly DiffMapping[],
	originalEditorAlignmentViewZones: ReadonlySet<string>,
	modifiedEditorAlignmentViewZones: ReadonlySet<string>,
	innerHunkAlignment: boolean,
): ILineRangeAlignment[] {
	const originalLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(originalEditor, originalEditorAlignmentViewZones));
	const modifiedLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(modifiedEditor, modifiedEditorAlignmentViewZones));

	const origLineHeight = originalEditor.getOption(EditorOption.lineHeight);
	const modLineHeight = modifiedEditor.getOption(EditorOption.lineHeight);

	const result: ILineRangeAlignment[] = [];

	let lastOriginalLineNumber = 0;
	let lastModifiedLineNumber = 0;

	function handleAlignmentsOutsideOfDiffs(untilOriginalLineNumberExclusive: number, untilModifiedLineNumberExclusive: number) {
		while (true) {
			let origNext = originalLineHeightOverrides.peek();
			let modNext = modifiedLineHeightOverrides.peek();
			if (origNext && origNext.lineNumber >= untilOriginalLineNumberExclusive) {
				origNext = undefined;
			}
			if (modNext && modNext.lineNumber >= untilModifiedLineNumberExclusive) {
				modNext = undefined;
			}
			if (!origNext && !modNext) {
				break;
			}

			const distOrig = origNext ? origNext.lineNumber - lastOriginalLineNumber : Number.MAX_VALUE;
			const distNext = modNext ? modNext.lineNumber - lastModifiedLineNumber : Number.MAX_VALUE;

			if (distOrig < distNext) {
				originalLineHeightOverrides.dequeue();
				modNext = {
					lineNumber: origNext!.lineNumber - lastOriginalLineNumber + lastModifiedLineNumber,
					heightInPx: 0,
				};
			} else if (distOrig > distNext) {
				modifiedLineHeightOverrides.dequeue();
				origNext = {
					lineNumber: modNext!.lineNumber - lastModifiedLineNumber + lastOriginalLineNumber,
					heightInPx: 0,
				};
			} else {
				originalLineHeightOverrides.dequeue();
				modifiedLineHeightOverrides.dequeue();
			}

			result.push({
				originalRange: LineRange.ofLength(origNext!.lineNumber, 1),
				modifiedRange: LineRange.ofLength(modNext!.lineNumber, 1),
				originalHeightInPx: origLineHeight + origNext!.heightInPx,
				modifiedHeightInPx: modLineHeight + modNext!.heightInPx,
				diff: undefined,
			});
		}
	}

	for (const m of diffs) {
		const c = m.lineRangeMapping;
		handleAlignmentsOutsideOfDiffs(c.original.startLineNumber, c.modified.startLineNumber);

		let first = true;
		let lastModLineNumber = c.modified.startLineNumber;
		let lastOrigLineNumber = c.original.startLineNumber;

		function emitAlignment(origLineNumberExclusive: number, modLineNumberExclusive: number, forceAlignment = false) {
			if (origLineNumberExclusive < lastOrigLineNumber || modLineNumberExclusive < lastModLineNumber) {
				return;
			}
			if (first) {
				first = false;
			} else if (!forceAlignment && (origLineNumberExclusive === lastOrigLineNumber || modLineNumberExclusive === lastModLineNumber)) {
				// This causes a re-alignment of an already aligned line.
				// However, we don't care for the final alignment.
				return;
			}
			const originalRange = new LineRange(lastOrigLineNumber, origLineNumberExclusive);
			const modifiedRange = new LineRange(lastModLineNumber, modLineNumberExclusive);
			if (originalRange.isEmpty && modifiedRange.isEmpty) {
				return;
			}

			const originalAdditionalHeight = originalLineHeightOverrides
				.takeWhile(v => v.lineNumber < origLineNumberExclusive)
				?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;
			const modifiedAdditionalHeight = modifiedLineHeightOverrides
				.takeWhile(v => v.lineNumber < modLineNumberExclusive)
				?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;

			result.push({
				originalRange,
				modifiedRange,
				originalHeightInPx: originalRange.length * origLineHeight + originalAdditionalHeight,
				modifiedHeightInPx: modifiedRange.length * modLineHeight + modifiedAdditionalHeight,
				diff: m.lineRangeMapping,
			});

			lastOrigLineNumber = origLineNumberExclusive;
			lastModLineNumber = modLineNumberExclusive;
		}

		if (innerHunkAlignment) {
			for (const i of c.innerChanges || []) {
				if (i.originalRange.startColumn > 1 && i.modifiedRange.startColumn > 1) {
					// There is some unmodified text on this line before the diff
					emitAlignment(i.originalRange.startLineNumber, i.modifiedRange.startLineNumber);
				}
				const originalModel = originalEditor.getModel()!;
				// When the diff is invalid, the ranges might be out of bounds (this should be fixed in the diff model by applying edits directly).
				const maxColumn = i.originalRange.endLineNumber <= originalModel.getLineCount() ? originalModel.getLineMaxColumn(i.originalRange.endLineNumber) : Number.MAX_SAFE_INTEGER;
				if (i.originalRange.endColumn < maxColumn) {
					// // There is some unmodified text on this line after the diff
					emitAlignment(i.originalRange.endLineNumber, i.modifiedRange.endLineNumber);
				}
			}
		}

		emitAlignment(c.original.endLineNumberExclusive, c.modified.endLineNumberExclusive, true);

		lastOriginalLineNumber = c.original.endLineNumberExclusive;
		lastModifiedLineNumber = c.modified.endLineNumberExclusive;
	}
	handleAlignmentsOutsideOfDiffs(Number.MAX_VALUE, Number.MAX_VALUE);

	return result;
}

interface AdditionalLineHeightInfo {
	lineNumber: number;
	heightInPx: number;
}

function getAdditionalLineHeights(editor: CodeEditorWidget, viewZonesToIgnore: ReadonlySet<string>): readonly AdditionalLineHeightInfo[] {
	const viewZoneHeights: { lineNumber: number; heightInPx: number }[] = [];
	const wrappingZoneHeights: { lineNumber: number; heightInPx: number }[] = [];

	const hasWrapping = editor.getOption(EditorOption.wrappingInfo).wrappingColumn !== -1;
	const coordinatesConverter = editor._getViewModel()!.coordinatesConverter;
	const editorLineHeight = editor.getOption(EditorOption.lineHeight);
	if (hasWrapping) {
		for (let i = 1; i <= editor.getModel()!.getLineCount(); i++) {
			const lineCount = coordinatesConverter.getModelLineViewLineCount(i);
			if (lineCount > 1) {
				wrappingZoneHeights.push({ lineNumber: i, heightInPx: editorLineHeight * (lineCount - 1) });
			}
		}
	}

	for (const w of editor.getWhitespaces()) {
		if (viewZonesToIgnore.has(w.id)) {
			continue;
		}
		const modelLineNumber = w.afterLineNumber === 0 ? 0 : coordinatesConverter.convertViewPositionToModelPosition(
			new Position(w.afterLineNumber, 1)
		).lineNumber;
		viewZoneHeights.push({ lineNumber: modelLineNumber, heightInPx: w.height });
	}

	const result = joinCombine(
		viewZoneHeights,
		wrappingZoneHeights,
		v => v.lineNumber,
		(v1, v2) => ({ lineNumber: v1.lineNumber, heightInPx: v1.heightInPx + v2.heightInPx })
	);

	return result;
}

export function allowsTrueInlineDiffRendering(mapping: DetailedLineRangeMapping): boolean {
	if (!mapping.innerChanges) {
		return false;
	}
	return mapping.innerChanges.every(c =>
		(rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange))
		|| c.originalRange.equalsRange(new Range(1, 1, 1, 1))
	);
}

export function rangeIsSingleLine(range: Range): boolean {
	return range.startLineNumber === range.endLineNumber;
}
