/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { ArrayQueue } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue } from 'vs/base/common/observable';
import { autorun, autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { ThemeIcon } from 'vs/base/common/themables';
import { assertIsDefined } from 'vs/base/common/types';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { IViewZone } from 'vs/editor/browser/editorBrowser';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { diffDeleteDecoration, diffRemoveIcon } from 'vs/editor/browser/widget/diffEditorWidget2/decorations';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { DiffMapping, DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { InlineDiffDeletedCodeMargin } from 'vs/editor/browser/widget/diffEditorWidget2/inlineDiffDeletedCodeMargin';
import { LineSource, RenderOptions, renderLines } from 'vs/editor/browser/widget/diffEditorWidget2/renderLines';
import { animatedObservable, joinCombine } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { BackgroundTokenizationState } from 'vs/editor/common/tokenizationTextModelPart';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

/**
 * Ensures both editors have the same height by aligning unchanged lines.
 * In inline view mode, inserts viewzones to show deleted code from the original text model in the modified code editor.
 * Synchronizes scrolling.
 */
export class ViewZoneManager extends Disposable {
	private readonly _originalTopPadding = observableValue('originalTopPadding', 0);
	private readonly _originalScrollTop: IObservable<number>;
	private readonly _originalScrollOffset = observableValue<number, boolean>('originalScrollOffset', 0);
	private readonly _originalScrollOffsetAnimated = animatedObservable(this._originalScrollOffset, this._store);

	private readonly _modifiedTopPadding = observableValue('modifiedTopPadding', 0);
	private readonly _modifiedScrollTop: IObservable<number>;
	private readonly _modifiedScrollOffset = observableValue<number, boolean>('modifiedScrollOffset', 0);
	private readonly _modifiedScrollOffsetAnimated = animatedObservable(this._modifiedScrollOffset, this._store);

	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diffModel: IObservable<DiffModel | undefined>,
		private readonly _renderSideBySide: IObservable<boolean>,
		private readonly _diffEditorWidget: DiffEditorWidget2,
		private readonly _canIgnoreViewZoneUpdateEvent: () => boolean,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();

		let isChangingViewZones = false;

		const originalViewZonesChanged = observableSignalFromEvent(
			'origViewZonesChanged',
			e => this._originalEditor.onDidChangeViewZones((args) => { if (!isChangingViewZones && !this._canIgnoreViewZoneUpdateEvent()) { e(args); } })
		);
		const modifiedViewZonesChanged = observableSignalFromEvent(
			'modViewZonesChanged',
			e => this._modifiedEditor.onDidChangeViewZones((args) => { if (!isChangingViewZones && !this._canIgnoreViewZoneUpdateEvent()) { e(args); } })
		);

		const originalModelTokenizationCompleted = this._diffModel.map(m =>
			m ? observableFromEvent(m.model.original.onDidChangeTokens, () => m.model.original.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) : undefined
		).map((m, reader) => m?.read(reader));

		const alignmentViewZoneIdsOrig = new Set<string>();
		const alignmentViewZoneIdsMod = new Set<string>();

		const alignments = derived<ILineRangeAlignment[] | null>('alignments', (reader) => {
			const diffModel = this._diffModel.read(reader);
			const diff = diffModel?.diff.read(reader);
			if (!diffModel || !diff) { return null; }
			originalViewZonesChanged.read(reader);
			modifiedViewZonesChanged.read(reader);
			return computeRangeAlignment(this._originalEditor, this._modifiedEditor, diff.mappings, alignmentViewZoneIdsOrig, alignmentViewZoneIdsMod);
		});

		const alignmentsSyncedMovedText = derived<ILineRangeAlignment[] | null>('alignments', (reader) => {
			const syncedMovedText = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);
			if (!syncedMovedText) { return null; }
			originalViewZonesChanged.read(reader);
			modifiedViewZonesChanged.read(reader);
			const mappings = syncedMovedText.changes.map(c => new DiffMapping(c));
			// TODO dont include alignments outside syncedMovedText
			return computeRangeAlignment(this._originalEditor, this._modifiedEditor, mappings, alignmentViewZoneIdsOrig, alignmentViewZoneIdsMod);
		});

		function createFakeLinesDiv(): HTMLElement {
			const r = document.createElement('div');
			r.className = 'diagonal-fill';
			return r;
		}

		const alignmentViewZonesDisposables = this._register(new DisposableStore());
		const alignmentViewZones = derived<{ orig: IViewZoneWithZoneId[]; mod: IViewZoneWithZoneId[] }>('alignment viewzones', (reader) => {
			alignmentViewZonesDisposables.clear();

			const alignmentsVal = alignments.read(reader) || [];

			const origViewZones: IViewZoneWithZoneId[] = [];
			const modViewZones: IViewZoneWithZoneId[] = [];

			const modifiedTopPaddingVal = this._modifiedTopPadding.read(reader);
			if (modifiedTopPaddingVal > 0) {
				modViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: modifiedTopPaddingVal,
					showInHiddenAreas: true,
				});
			}
			const originalTopPaddingVal = this._originalTopPadding.read(reader);
			if (originalTopPaddingVal > 0) {
				origViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: originalTopPaddingVal,
					showInHiddenAreas: true,
				});
			}

			const renderSideBySide = this._renderSideBySide.read(reader);

			const deletedCodeLineBreaksComputer = !renderSideBySide ? this._modifiedEditor._getViewModel()?.createLineBreaksComputer() : undefined;
			if (deletedCodeLineBreaksComputer) {
				for (const a of alignmentsVal) {
					if (a.diff) {
						for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
							deletedCodeLineBreaksComputer?.addRequest(this._originalEditor.getModel()!.getLineContent(i), null, null);
						}
					}
				}
			}

			const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
			let lineBreakDataIdx = 0;

			const modLineHeight = this._modifiedEditor.getOption(EditorOption.lineHeight);

			const syncedMovedText = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);

			const mightContainNonBasicASCII = this._originalEditor.getModel()?.mightContainNonBasicASCII() ?? false;
			const mightContainRTL = this._originalEditor.getModel()?.mightContainRTL() ?? false;
			const renderOptions = RenderOptions.fromEditor(this._modifiedEditor);

			for (const a of alignmentsVal) {
				if (a.diff && !renderSideBySide) {
					if (!a.originalRange.isEmpty) {
						originalModelTokenizationCompleted.read(reader); // Update view-zones once tokenization completes

						const deletedCodeDomNode = document.createElement('div');
						deletedCodeDomNode.classList.add('view-lines', 'line-delete', 'monaco-mouse-cursor-text');
						const source = new LineSource(
							a.originalRange.mapToLineArray(l => this._originalEditor.getModel()!.tokenization.getLineTokens(l)),
							a.originalRange.mapToLineArray(_ => lineBreakData[lineBreakDataIdx++]),
							mightContainNonBasicASCII,
							mightContainRTL,
						);
						const decorations: InlineDecoration[] = [];
						for (const i of a.diff.innerChanges || []) {
							decorations.push(new InlineDecoration(
								i.originalRange.delta(-(a.diff.originalRange.startLineNumber - 1)),
								diffDeleteDecoration.className!,
								InlineDecorationType.Regular
							));
						}
						const result = renderLines(source, renderOptions, decorations, deletedCodeDomNode);

						const marginDomNode = document.createElement('div');
						marginDomNode.className = 'inline-deleted-margin-view-zone';
						applyFontInfo(marginDomNode, renderOptions.fontInfo);

						//if (this._renderIndicators) {
						for (let i = 0; i < result.heightInLines; i++) {
							const marginElement = document.createElement('div');
							marginElement.className = `delete-sign ${ThemeIcon.asClassName(diffRemoveIcon)}`;
							marginElement.setAttribute('style', `position:absolute;top:${i * modLineHeight}px;width:${renderOptions.lineDecorationsWidth}px;height:${modLineHeight}px;right:0;`);
							marginDomNode.appendChild(marginElement);
						}
						//}

						let zoneId: string | undefined = undefined;
						alignmentViewZonesDisposables.add(
							new InlineDiffDeletedCodeMargin(
								() => assertIsDefined(zoneId),
								marginDomNode,
								this._modifiedEditor,
								a.diff,
								this._diffEditorWidget,
								result.viewLineCounts,
								this._originalEditor.getModel()!,
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
					});
				} else {
					const delta = a.modifiedHeightInPx - a.originalHeightInPx;
					if (delta > 0) {
						if (syncedMovedText?.lineRangeMapping.originalRange.contains(a.originalRange.endLineNumberExclusive - 1)) {
							continue;
						}

						origViewZones.push({
							afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: delta,
							showInHiddenAreas: true,
						});
					} else {
						if (syncedMovedText?.lineRangeMapping.modifiedRange.contains(a.modifiedRange.endLineNumberExclusive - 1)) {
							continue;
						}

						function createViewZoneMarginArrow(): HTMLElement {
							const arrow = document.createElement('div');
							arrow.className = 'arrow-revert-change ' + ThemeIcon.asClassName(Codicon.arrowRight);
							return $('div', {}, arrow);
						}

						let marginDomNode: HTMLElement | undefined = undefined;
						if (a.diff && a.diff.modifiedRange.isEmpty) {
							marginDomNode = createViewZoneMarginArrow();
						}

						modViewZones.push({
							afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: -delta,
							marginDomNode,
							showInHiddenAreas: true,
						});
					}
				}
			}

			for (const a of alignmentsSyncedMovedText.read(reader) ?? []) {
				if (!syncedMovedText?.lineRangeMapping.originalRange.intersect(a.originalRange)
					&& !syncedMovedText?.lineRangeMapping.modifiedRange.intersect(a.modifiedRange)) {
					// ignore unrelated alignments outside the synced moved text
					continue;
				}

				const delta = a.modifiedHeightInPx - a.originalHeightInPx;
				if (delta > 0) {
					origViewZones.push({
						afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
						domNode: createFakeLinesDiv(),
						heightInPx: delta,
					});
				} else {
					modViewZones.push({
						afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
						domNode: createFakeLinesDiv(),
						heightInPx: -delta,
					});
				}
			}

			return { orig: origViewZones, mod: modViewZones };
		});

		this._register(autorunWithStore2('alignment viewzones', (reader) => {
			const scrollState = StableEditorScrollState.capture(this._modifiedEditor);

			const alignmentViewZones_ = alignmentViewZones.read(reader);
			isChangingViewZones = true;
			this._originalEditor.changeViewZones((aOrig) => {
				for (const id of alignmentViewZoneIdsOrig) { aOrig.removeZone(id); }
				alignmentViewZoneIdsOrig.clear();
				for (const z of alignmentViewZones_.orig) {
					const id = aOrig.addZone(z);
					if (z.setZoneId) {
						z.setZoneId(id);
					}
					alignmentViewZoneIdsOrig.add(id);
				}
			});
			this._modifiedEditor.changeViewZones(aMod => {
				for (const id of alignmentViewZoneIdsMod) { aMod.removeZone(id); }
				alignmentViewZoneIdsMod.clear();
				for (const z of alignmentViewZones_.mod) {
					const id = aMod.addZone(z);
					if (z.setZoneId) {
						z.setZoneId(id);
					}
					alignmentViewZoneIdsMod.add(id);
				}
			});
			isChangingViewZones = false;

			scrollState.restore(this._modifiedEditor);
		}));

		this._register(this._originalEditor.onDidScrollChange(e => { this._modifiedEditor.setScrollLeft(e.scrollLeft); }));
		this._register(this._modifiedEditor.onDidScrollChange(e => { this._originalEditor.setScrollLeft(e.scrollLeft); }));

		this._originalScrollTop = observableFromEvent(this._originalEditor.onDidScrollChange, () => this._originalEditor.getScrollTop());
		this._modifiedScrollTop = observableFromEvent(this._modifiedEditor.onDidScrollChange, () => this._modifiedEditor.getScrollTop());

		// origExtraHeight + origOffset - origScrollTop = modExtraHeight + modOffset - modScrollTop

		// origScrollTop = origExtraHeight + origOffset - modExtraHeight - modOffset + modScrollTop
		// modScrollTop = modExtraHeight + modOffset - origExtraHeight - origOffset + origScrollTop

		// origOffset - modOffset = heightOfLines(1..Y) - heightOfLines(1..X)
		// origScrollTop >= 0, modScrollTop >= 0

		this._register(autorun('update scroll modified', (reader) => {
			const newScrollTopModified = this._originalScrollTop.read(reader)
				- (this._originalScrollOffsetAnimated.get() - this._modifiedScrollOffsetAnimated.read(reader))
				- (this._originalTopPadding.get() - this._modifiedTopPadding.read(reader));
			if (newScrollTopModified !== this._modifiedEditor.getScrollTop()) {
				this._modifiedEditor.setScrollTop(newScrollTopModified, ScrollType.Immediate);
			}
		}));

		this._register(autorun('update scroll original', (reader) => {
			const newScrollTopOriginal = this._modifiedScrollTop.read(reader)
				- (this._modifiedScrollOffsetAnimated.get() - this._originalScrollOffsetAnimated.read(reader))
				- (this._modifiedTopPadding.get() - this._originalTopPadding.read(reader));
			if (newScrollTopOriginal !== this._originalEditor.getScrollTop()) {
				this._originalEditor.setScrollTop(newScrollTopOriginal, ScrollType.Immediate);
			}
		}));


		this._register(autorun('update', reader => {
			const m = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);

			let deltaOrigToMod = 0;
			if (m) {
				const trueTopOriginal = this._originalEditor.getTopForLineNumber(m.lineRangeMapping.originalRange.startLineNumber, true) - this._originalTopPadding.get();
				const trueTopModified = this._modifiedEditor.getTopForLineNumber(m.lineRangeMapping.modifiedRange.startLineNumber, true) - this._modifiedTopPadding.get();
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

			if (this._modifiedEditor.hasTextFocus()) {
				this._originalScrollOffset.set(this._modifiedScrollOffset.get() - deltaOrigToMod, undefined, true);
			} else {
				this._modifiedScrollOffset.set(this._originalScrollOffset.get() + deltaOrigToMod, undefined, true);
			}
		}));
	}
}

interface IViewZoneWithZoneId extends IViewZone {
	// Tells a view zone its id.
	setZoneId?(zoneId: string): void;
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
	diff?: LineRangeMapping;
}

function computeRangeAlignment(
	originalEditor: CodeEditorWidget,
	modifiedEditor: CodeEditorWidget,
	diffs: readonly DiffMapping[],
	originalEditorAlignmentViewZones: ReadonlySet<string>,
	modifiedEditorAlignmentViewZones: ReadonlySet<string>,
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
		handleAlignmentsOutsideOfDiffs(c.originalRange.startLineNumber, c.modifiedRange.startLineNumber);

		const originalAdditionalHeight = originalLineHeightOverrides
			.takeWhile(v => v.lineNumber < c.originalRange.endLineNumberExclusive)
			?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;
		const modifiedAdditionalHeight = modifiedLineHeightOverrides
			.takeWhile(v => v.lineNumber < c.modifiedRange.endLineNumberExclusive)
			?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;

		result.push({
			originalRange: c.originalRange,
			modifiedRange: c.modifiedRange,
			originalHeightInPx: c.originalRange.length * origLineHeight + originalAdditionalHeight,
			modifiedHeightInPx: c.modifiedRange.length * modLineHeight + modifiedAdditionalHeight,
			diff: m.lineRangeMapping,
		});

		lastOriginalLineNumber = c.originalRange.endLineNumberExclusive;
		lastModifiedLineNumber = c.modifiedRange.endLineNumberExclusive;
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
		const modelLineNumber = coordinatesConverter.convertViewPositionToModelPosition(
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
