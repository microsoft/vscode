/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { booleanComparator, compareBy, numberComparator, tieBreakComparators } from 'vs/base/common/arrays';
import { findMaxIdx } from 'vs/base/common/arraysFind';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunHandleChanges, autorunWithStore, constObservable, derived, derivedWithStore, observableFromEvent, observableSignalFromEvent, observableValue, recomputeInitiallyAndOnChange } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditor/components/diffEditorEditors';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyStyle, applyViewZones } from 'vs/editor/browser/widget/diffEditor/utils';
import { EditorLayoutInfo } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange, OffsetRangeSet } from 'vs/editor/common/core/offsetRange';
import { MovedText } from 'vs/editor/common/diff/linesDiffComputer';
import { localize } from 'vs/nls';

export class MovedBlocksLinesFeature extends Disposable {
	public static readonly movedCodeBlockPadding = 4;

	private readonly _element: SVGElement;
	private readonly _originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => this._editors.original.getScrollTop());
	private readonly _modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollTop());
	private readonly _viewZonesChanged = observableSignalFromEvent('onDidChangeViewZones', this._editors.modified.onDidChangeViewZones);

	public readonly width = observableValue(this, 0);

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
			this._element.style.width = `${info.verticalScrollbarWidth + info.contentLeft - MovedBlocksLinesFeature.movedCodeBlockPadding + this.width.read(reader)}px`;
		}));

		this._register(recomputeInitiallyAndOnChange(this._state));

		const movedBlockViewZones = derived(reader => {
			const model = this._diffModel.read(reader);
			const d = model?.diff.read(reader);
			if (!d) { return []; }
			return d.movedTexts.map(move => ({
				move,
				original: new PlaceholderViewZone(constObservable(move.lineRangeMapping.original.startLineNumber - 1), 18),
				modified: new PlaceholderViewZone(constObservable(move.lineRangeMapping.modified.startLineNumber - 1), 18),
			}));
		});

		this._register(applyViewZones(this._editors.original, movedBlockViewZones.map(zones => /** @description movedBlockViewZones.original */ zones.map(z => z.original))));
		this._register(applyViewZones(this._editors.modified, movedBlockViewZones.map(zones => /** @description movedBlockViewZones.modified */ zones.map(z => z.modified))));

		this._register(autorunWithStore((reader, store) => {
			const blocks = movedBlockViewZones.read(reader);
			for (const b of blocks) {
				store.add(new MovedBlockOverlayWidget(this._editors.original, b.original, b.move, 'original', this._diffModel.get()!));
				store.add(new MovedBlockOverlayWidget(this._editors.modified, b.modified, b.move, 'modified', this._diffModel.get()!));
			}
		}));

		const originalHasFocus = observableSignalFromEvent(
			'original.onDidFocusEditorWidget',
			e => this._editors.original.onDidFocusEditorWidget(() => setTimeout(() => e(undefined), 0))
		);
		const modifiedHasFocus = observableSignalFromEvent(
			'modified.onDidFocusEditorWidget',
			e => this._editors.modified.onDidFocusEditorWidget(() => setTimeout(() => e(undefined), 0))
		);

		let lastChangedEditor: 'original' | 'modified' = 'modified';

		this._register(autorunHandleChanges({
			createEmptyChangeSummary: () => undefined,
			handleChange: (ctx, summary) => {
				if (ctx.didChange(originalHasFocus)) { lastChangedEditor = 'original'; }
				if (ctx.didChange(modifiedHasFocus)) { lastChangedEditor = 'modified'; }
				return true;
			}
		}, reader => {
			/** @description MovedBlocksLines.setActiveMovedTextFromCursor */
			originalHasFocus.read(reader);
			modifiedHasFocus.read(reader);

			const m = this._diffModel.read(reader);
			if (!m) { return; }
			const diff = m.diff.read(reader);

			let movedText: MovedText | undefined = undefined;

			if (diff && lastChangedEditor === 'original') {
				const originalPos = this._editors.originalCursor.read(reader);
				if (originalPos) {
					movedText = diff.movedTexts.find(m => m.lineRangeMapping.original.contains(originalPos.lineNumber));
				}
			}

			if (diff && lastChangedEditor === 'modified') {
				const modifiedPos = this._editors.modifiedCursor.read(reader);
				if (modifiedPos) {
					movedText = diff.movedTexts.find(m => m.lineRangeMapping.modified.contains(modifiedPos.lineNumber));
				}
			}

			if (movedText !== m.movedTextToCompare.get()) {
				m.movedTextToCompare.set(undefined, undefined);
			}
			m.setActiveMovedText(movedText);
		}));
	}

	private readonly _modifiedViewZonesChangedSignal = observableSignalFromEvent('modified.onDidChangeViewZones', this._editors.modified.onDidChangeViewZones);
	private readonly _originalViewZonesChangedSignal = observableSignalFromEvent('original.onDidChangeViewZones', this._editors.original.onDidChangeViewZones);

	private readonly _state = derivedWithStore(this, (reader, store) => {
		/** @description state */

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

		this._modifiedViewZonesChangedSignal.read(reader);
		this._originalViewZonesChangedSignal.read(reader);

		const lines = moves.map((move) => {
			function computeLineStart(range: LineRange, editor: ICodeEditor) {
				const t1 = editor.getTopForLineNumber(range.startLineNumber, true);
				const t2 = editor.getTopForLineNumber(range.endLineNumberExclusive, true);
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
			compareBy(l => l.fromWithoutScroll > l.toWithoutScroll ? l.fromWithoutScroll : -l.toWithoutScroll, numberComparator)
		));

		const layout = LinesLayout.compute(lines.map(l => l.range));

		const padding = 10;
		const lineAreaLeft = infoOrig.verticalScrollbarWidth;
		const lineAreaWidth = (layout.getTrackCount() - 1) * 10 + padding * 2;
		const width = lineAreaLeft + lineAreaWidth + (infoMod.contentLeft - MovedBlocksLinesFeature.movedCodeBlockPadding);

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

			const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

			path.setAttribute('d', `M ${0} ${line.from} L ${verticalY} ${line.from} L ${verticalY} ${line.to} L ${right - arrowWidth} ${line.to}`);
			path.setAttribute('fill', 'none');
			g.appendChild(path);

			const arrowRight = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
			arrowRight.classList.add('arrow');

			store.add(autorun(reader => {
				path.classList.toggle('currentMove', line.move === model.activeMovedText.read(reader));
				arrowRight.classList.toggle('currentMove', line.move === model.activeMovedText.read(reader));
			}));

			arrowRight.setAttribute('points', `${right - arrowWidth},${line.to - arrowHeight / 2} ${right},${line.to} ${right - arrowWidth},${line.to + arrowHeight / 2}`);
			g.appendChild(arrowRight);

			this._element.appendChild(g);

			/*
			TODO@hediet
			path.addEventListener('mouseenter', () => {
				model.setHoveredMovedText(line.move);
			});
			path.addEventListener('mouseleave', () => {
				model.setHoveredMovedText(undefined);
			});*/

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
					trackIdx = findMaxIdx(setsPerTrack, compareBy(set => set.intersectWithRangeLength(line), numberComparator));
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

class MovedBlockOverlayWidget extends ViewZoneOverlayWidget {
	private readonly _nodes = h('div.diff-moved-code-block', { style: { marginRight: '4px' } }, [
		h('div.text-content@textContent'),
		h('div.action-bar@actionBar'),
	]);

	constructor(
		private readonly _editor: ICodeEditor,
		_viewZone: PlaceholderViewZone,
		private readonly _move: MovedText,
		private readonly _kind: 'original' | 'modified',
		private readonly _diffModel: DiffEditorViewModel,
	) {
		const root = h('div.diff-hidden-lines-widget');
		super(_editor, _viewZone, root.root);
		root.root.appendChild(this._nodes.root);

		const editorLayout = observableFromEvent(this._editor.onDidLayoutChange, () => this._editor.getLayoutInfo());

		this._register(applyStyle(this._nodes.root, {
			paddingRight: editorLayout.map(l => l.verticalScrollbarWidth)
		}));

		let text: string;

		if (_move.changes.length > 0) {
			text = this._kind === 'original' ? localize(
				'codeMovedToWithChanges',
				'Code moved with changes to line {0}-{1}',
				this._move.lineRangeMapping.modified.startLineNumber,
				this._move.lineRangeMapping.modified.endLineNumberExclusive - 1,
			) : localize(
				'codeMovedFromWithChanges',
				'Code moved with changes from line {0}-{1}',
				this._move.lineRangeMapping.original.startLineNumber,
				this._move.lineRangeMapping.original.endLineNumberExclusive - 1,
			);
		} else {
			text = this._kind === 'original' ? localize(
				'codeMovedTo',
				'Code moved to line {0}-{1}',
				this._move.lineRangeMapping.modified.startLineNumber,
				this._move.lineRangeMapping.modified.endLineNumberExclusive - 1,
			) : localize(
				'codeMovedFrom',
				'Code moved from line {0}-{1}',
				this._move.lineRangeMapping.original.startLineNumber,
				this._move.lineRangeMapping.original.endLineNumberExclusive - 1,
			);
		}

		const actionBar = this._register(new ActionBar(this._nodes.actionBar, {
			highlightToggledItems: true,
		}));

		const caption = new Action(
			'',
			text,
			'',
			false,
		);
		actionBar.push(caption, { icon: false, label: true });

		const actionCompare = new Action(
			'',
			'Compare',
			ThemeIcon.asClassName(Codicon.compareChanges),
			true,
			() => {
				this._editor.focus();
				this._diffModel.movedTextToCompare.set(this._diffModel.movedTextToCompare.get() === _move ? undefined : this._move, undefined);
			},
		);
		this._register(autorun(reader => {
			const isActive = this._diffModel.movedTextToCompare.read(reader) === _move;
			actionCompare.checked = isActive;
		}));

		actionBar.push(actionCompare, { icon: false, label: true });
	}
}
