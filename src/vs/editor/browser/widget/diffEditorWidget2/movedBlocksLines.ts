/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { booleanComparator, compareBy, findMaxIdxBy, numberComparator, tieBreakComparators } from 'vs/base/common/arrays';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, derived, keepAlive, observableFromEvent, observableSignalFromEvent, observableValue } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorEditors';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorViewModel';
import { EditorLayoutInfo } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange, OffsetRangeSet } from 'vs/editor/common/core/offsetRange';

export class MovedBlocksLinesPart extends Disposable {
	public static readonly movedCodeBlockPadding = 4;

	private readonly _element: SVGElement;
	private readonly _originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => this._editors.original.getScrollTop());
	private readonly _modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollTop());
	private readonly _viewZonesChanged = observableSignalFromEvent('onDidChangeViewZones', this._editors.modified.onDidChangeViewZones);

	public readonly width = observableValue('width', 0);

	constructor(
		private readonly _rootElement: HTMLElement,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _originalEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		private readonly _modifiedEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		private readonly _editors: DiffEditorEditors,
	) {
		super();

		this._element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this._element.setAttribute('class', 'moved-blocks-lines');
		this._rootElement.appendChild(this._element);
		this._register(toDisposable(() => this._element.remove()));

		this._register(autorun(reader => {
			/** @description update moved blocks lines positioning */
			const info = this._originalEditorLayoutInfo.read(reader);
			const info2 = this._modifiedEditorLayoutInfo.read(reader);
			if (!info || !info2) {
				return;
			}

			this._element.style.left = `${info.width - info.verticalScrollbarWidth}px`;
			this._element.style.height = `${info.height}px`;
			this._element.style.width = `${info.verticalScrollbarWidth + info.contentLeft - MovedBlocksLinesPart.movedCodeBlockPadding + this.width.read(reader)}px`;
		}));

		this._register(keepAlive(this._state, true));
	}

	private readonly _state = derived(reader => {
		/** @description update moved blocks lines */

		this._element.replaceChildren();
		const model = this._diffModel.read(reader);
		const moves = model?.diff.read(reader)?.movedTexts;
		if (!moves || moves.length === 0) {
			this.width.set(0, undefined);
			return;
		}

		this._viewZonesChanged.read(reader);

		const infoOrig = this._originalEditorLayoutInfo.read(reader);
		const infoMod = this._modifiedEditorLayoutInfo.read(reader);
		if (!infoOrig || !infoMod) {
			this.width.set(0, undefined);
			return;
		}

		const lines = moves.map((move) => {
			function computeLineStart(range: LineRange, editor: ICodeEditor) {
				const t1 = editor.getTopForLineNumber(range.startLineNumber);
				const t2 = editor.getTopForLineNumber(range.endLineNumberExclusive);
				return (t1 + t2) / 2;
			}

			const start = computeLineStart(move.lineRangeMapping.original, this._editors.original);
			const startOffset = this._originalScrollTop.read(reader);
			const end = computeLineStart(move.lineRangeMapping.modified, this._editors.modified);
			const endOffset = this._modifiedScrollTop.read(reader);

			const from = start - startOffset;
			const to = end - endOffset;

			const top = Math.min(start, end);
			const bottom = Math.max(start, end);

			return { range: new OffsetRange(top, bottom), from, to, fromWithoutScroll: start, toWithoutScroll: end, move };
		});

		lines.sort(tieBreakComparators(
			compareBy(l => l.fromWithoutScroll > l.toWithoutScroll, booleanComparator),
			compareBy(l => -l.fromWithoutScroll, numberComparator)
		));

		const layout = LinesLayout.compute(lines.map(l => l.range));

		const padding = 10;
		const lineAreaLeft = infoOrig.verticalScrollbarWidth;
		const lineAreaWidth = (layout.getTrackCount() - 1) * 10 + padding * 2;
		const width = lineAreaLeft + lineAreaWidth + (infoMod.contentLeft - MovedBlocksLinesPart.movedCodeBlockPadding);

		let idx = 0;
		for (const line of lines) {
			const track = layout.getTrack(idx);
			const verticalY = lineAreaLeft + padding + track * 10;

			const arrowHeight = 15;
			const arrowWidth = 15;
			const right = width;

			const rectWidth = infoMod.glyphMarginWidth + infoMod.lineNumbersWidth;
			const rectHeight = 18;
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.classList.add('arrow-rectangle');
			rect.setAttribute('x', `${right - rectWidth}`);
			rect.setAttribute('y', `${line.to - rectHeight / 2}`);
			rect.setAttribute('width', `${rectWidth}`);
			rect.setAttribute('height', `${rectHeight}`);
			this._element.appendChild(rect);

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			if (line.move === model.syncedMovedTexts.read(reader)) {
				path.classList.add('currentMove');
			}
			path.setAttribute('d', `M ${0} ${line.from} L ${verticalY} ${line.from} L ${verticalY} ${line.to} L ${right - arrowWidth} ${line.to}`);
			path.setAttribute('fill', 'none');
			this._element.appendChild(path);

			const arrowRight = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
			arrowRight.classList.add('arrow');
			if (line.move === model.syncedMovedTexts.read(reader)) {
				arrowRight.classList.add('currentMove');
			}
			arrowRight.setAttribute('points', `${right - arrowWidth},${line.to - arrowHeight / 2} ${right},${line.to} ${right - arrowWidth},${line.to + arrowHeight / 2}`);
			this._element.appendChild(arrowRight);

			idx++;
		}

		this.width.set(lineAreaWidth, undefined);
	});
}

class LinesLayout {
	public static compute(lines: OffsetRange[]): LinesLayout {
		const setsPerTrack: OffsetRangeSet[] = [];
		const trackPerLineIdx: number[] = [];

		for (const line of lines) {
			let trackIdx = setsPerTrack.findIndex(set => !set.intersectsStrict(line));
			if (trackIdx === -1) {
				const maxTrackCount = 6;
				if (setsPerTrack.length >= maxTrackCount) {
					trackIdx = findMaxIdxBy(setsPerTrack, compareBy(set => set.intersectWithRangeLength(line), numberComparator));
				} else {
					trackIdx = setsPerTrack.length;
					setsPerTrack.push(new OffsetRangeSet());
				}
			}
			setsPerTrack[trackIdx].addRange(line);
			trackPerLineIdx.push(trackIdx);
		}

		return new LinesLayout(setsPerTrack.length, trackPerLineIdx);
	}

	private constructor(
		private readonly _trackCount: number,
		private readonly trackPerLineIdx: number[]
	) { }

	getTrack(lineIdx: number): number {
		return this.trackPerLineIdx[lineIdx];
	}

	getTrackCount(): number {
		return this._trackCount;
	}
}
