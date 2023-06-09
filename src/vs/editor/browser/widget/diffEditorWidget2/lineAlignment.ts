/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, observableSignalFromEvent, derived, observableValue, observableFromEvent } from 'vs/base/common/observable';
import { autorun, autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { IViewZone } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffMapping, DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { animatedObservable, joinCombine } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';

export class ViewZoneAlignment extends Disposable {
	private readonly _origExtraHeight = observableValue('origExtraHeight', 0);
	private readonly _modExtraHeight = observableValue('modExtraHeight', 0);

	private readonly _originalScrollTop: IObservable<number>;
	private readonly _originalScrollOffset = observableValue<number, boolean>('originalScrollOffset', 0);
	private readonly _originalScrollOffsetAnimated = animatedObservable(this._originalScrollOffset, this._store);

	private readonly _modifiedScrollTop: IObservable<number>;
	private readonly _modifiedScrollOffset = observableValue<number, boolean>('modifiedScrollOffset', 0);
	private readonly _modifiedScrollOffsetAnimated = animatedObservable(this._modifiedScrollOffset, this._store);

	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diffModel: IObservable<DiffModel | undefined>,
	) {
		super();

		let isChangingViewZones = false;

		const origViewZonesChanged = observableSignalFromEvent(
			'origViewZonesChanged',
			e => this._originalEditor.onDidChangeViewZones((args) => { if (!isChangingViewZones) { e(args); } })
		);
		const modViewZonesChanged = observableSignalFromEvent(
			'modViewZonesChanged',
			e => this._modifiedEditor.onDidChangeViewZones((args) => { if (!isChangingViewZones) { e(args); } })
		);

		const alignmentViewZoneIdsOrig = new Set<string>();
		const alignmentViewZoneIdsMod = new Set<string>();

		const alignments = derived<IRangeAlignment[] | null>('alignments', (reader) => {
			const diffModel = this._diffModel.read(reader);
			const diff = diffModel?.diff.read(reader);
			if (!diffModel || !diff) { return null; }

			origViewZonesChanged.read(reader);
			modViewZonesChanged.read(reader);

			return computeRangeAlignment(this._originalEditor, this._modifiedEditor, diff.mappings, alignmentViewZoneIdsOrig, alignmentViewZoneIdsMod);
		});

		const alignmentsSyncedMovedText = derived<IRangeAlignment[] | null>('alignments', (reader) => {
			origViewZonesChanged.read(reader);
			modViewZonesChanged.read(reader);

			const syncedMovedText = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);
			if (!syncedMovedText) {
				return null;
			}
			const mappings = syncedMovedText.changes.map(c => new DiffMapping(c));

			// TOD dont include alignments outside syncedMovedText
			return computeRangeAlignment(this._originalEditor, this._modifiedEditor, mappings, alignmentViewZoneIdsOrig, alignmentViewZoneIdsMod);
		});

		function createFakeLinesDiv(): HTMLElement {
			const r = document.createElement('div');
			r.className = 'diagonal-fill';
			return r;
		}

		const alignmentViewZones = derived<{ orig: IViewZone[]; mod: IViewZone[] }>('alignment viewzones', (reader) => {
			const alignments_ = alignments.read(reader);

			const origViewZones: IViewZone[] = [];
			const modViewZones: IViewZone[] = [];

			const _modExtraHeight = this._modExtraHeight.read(reader);
			if (_modExtraHeight > 0) {
				modViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: _modExtraHeight,
				});
			}
			const _origExtraHeight = this._origExtraHeight.read(reader);
			if (_origExtraHeight > 0) {
				origViewZones.push({
					afterLineNumber: 0,
					domNode: document.createElement('div'),
					heightInPx: _origExtraHeight,
				});
			}

			const syncedMovedText = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);

			if (alignments_) {
				for (const a of alignments_) {
					const delta = a.modifiedHeightInPx - a.originalHeightInPx;
					if (delta > 0) {
						if (syncedMovedText?.lineRangeMapping.originalRange.contains(a.originalRange.endLineNumberExclusive - 1)) {
							continue;
						}

						origViewZones.push({
							afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: delta,
						});
					} else {
						if (syncedMovedText?.lineRangeMapping.modifiedRange.contains(a.modifiedRange.endLineNumberExclusive - 1)) {
							continue;
						}

						modViewZones.push({
							afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
							domNode: createFakeLinesDiv(),
							heightInPx: -delta,
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
			const alignmentViewZones_ = alignmentViewZones.read(reader);
			isChangingViewZones = true;
			this._originalEditor.changeViewZones((aOrig) => {
				for (const id of alignmentViewZoneIdsOrig) { aOrig.removeZone(id); }
				alignmentViewZoneIdsOrig.clear();
				for (const z of alignmentViewZones_.orig) { alignmentViewZoneIdsOrig.add(aOrig.addZone(z)); }
			});
			this._modifiedEditor.changeViewZones(aMod => {
				for (const id of alignmentViewZoneIdsMod) { aMod.removeZone(id); }
				alignmentViewZoneIdsMod.clear();
				for (const z of alignmentViewZones_.mod) { alignmentViewZoneIdsMod.add(aMod.addZone(z)); }
			});
			isChangingViewZones = false;
		}));

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
				- (this._origExtraHeight.get() - this._modExtraHeight.read(reader));
			if (newScrollTopModified !== this._modifiedEditor.getScrollTop()) {
				this._modifiedEditor.setScrollTop(newScrollTopModified, ScrollType.Immediate);
			}
		}));

		this._register(autorun('update scroll original', (reader) => {
			const newScrollTopOriginal = this._modifiedScrollTop.read(reader)
				- (this._modifiedScrollOffsetAnimated.get() - this._originalScrollOffsetAnimated.read(reader))
				- (this._modExtraHeight.get() - this._origExtraHeight.read(reader));
			if (newScrollTopOriginal !== this._originalEditor.getScrollTop()) {
				this._originalEditor.setScrollTop(newScrollTopOriginal, ScrollType.Immediate);
			}
		}));


		this._register(autorun('update', reader => {
			const m = this._diffModel.read(reader)?.syncedMovedTexts.read(reader);

			let deltaOrigToMod = 0;
			if (m) {
				const trueTopOriginal = this._originalEditor.getTopForLineNumber(m.lineRangeMapping.originalRange.startLineNumber, true) - this._origExtraHeight.get();
				const trueTopModified = this._modifiedEditor.getTopForLineNumber(m.lineRangeMapping.modifiedRange.startLineNumber, true) - this._modExtraHeight.get();
				deltaOrigToMod = trueTopModified - trueTopOriginal;
			}

			if (deltaOrigToMod > 0) {
				this._modExtraHeight.set(0, undefined);
				this._origExtraHeight.set(deltaOrigToMod, undefined);
			} else if (deltaOrigToMod < 0) {
				this._modExtraHeight.set(-deltaOrigToMod, undefined);
				this._origExtraHeight.set(0, undefined);
			} else {
				setTimeout(() => {
					this._modExtraHeight.set(0, undefined);
					this._origExtraHeight.set(0, undefined);
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

interface IRangeAlignment {
	originalRange: LineRange;
	modifiedRange: LineRange;

	// accounts for foreign viewzones and line wrapping
	originalHeightInPx: number;
	modifiedHeightInPx: number;
}

function computeRangeAlignment(
	originalEditor: CodeEditorWidget,
	modifiedEditor: CodeEditorWidget,
	diffs: readonly DiffMapping[],
	originalEditorAlignmentViewZones: ReadonlySet<string>,
	modifiedEditorAlignmentViewZones: ReadonlySet<string>,
): IRangeAlignment[] {
	const originalLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(originalEditor, originalEditorAlignmentViewZones));
	const modifiedLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(modifiedEditor, modifiedEditorAlignmentViewZones));

	const origLineHeight = originalEditor.getOption(EditorOption.lineHeight);
	const modLineHeight = modifiedEditor.getOption(EditorOption.lineHeight);

	const result: IRangeAlignment[] = [];

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
