/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, observableSignalFromEvent, derived } from 'vs/base/common/observable';
import { autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { IViewZone } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { joinCombine } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';

export class ViewZoneAlignment extends Disposable {
	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diffModel: IObservable<DiffModel | null>,
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
			const diff = this._diffModel.read(reader)?.diff.read(reader);
			if (!diff) { return null; }

			origViewZonesChanged.read(reader);
			modViewZonesChanged.read(reader);

			return computeRangeAlignment(this._originalEditor, this._modifiedEditor, diff.changes, alignmentViewZoneIdsOrig, alignmentViewZoneIdsMod);
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

			if (alignments_) {
				for (const a of alignments_) {
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

	}
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
	if (hasWrapping) {
		for (let i = 1; i <= editor.getModel()!.getLineCount(); i++) {
			const lineCount = coordinatesConverter.getModelLineViewLineCount(i);
			if (lineCount > 1) {
				wrappingZoneHeights.push({ lineNumber: i, heightInPx: lineCount - 1 });
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
	diffs: LineRangeMapping[],
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

	for (const c of diffs) {
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
