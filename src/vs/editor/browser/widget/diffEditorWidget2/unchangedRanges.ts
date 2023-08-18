/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, h, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, derived, derivedWithStore, observableFromEvent, transaction } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorEditors';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorOptions';
import { DiffEditorViewModel, UnchangedRegion } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorViewModel';
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyObservableDecorations, applyStyle, applyViewZones } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { IModelDecorationOptions, IModelDeltaDecoration } from 'vs/editor/common/model';
import { localize } from 'vs/nls';

export class UnchangedRangesFeature extends Disposable {
	private _isUpdatingViewZones = false;
	public get isUpdatingViewZones(): boolean { return this._isUpdatingViewZones; }

	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
	) {
		super();

		this._register(this._editors.original.onDidChangeCursorPosition(e => {
			if (e.reason === CursorChangeReason.Explicit) {
				const m = this._diffModel.get();
				transaction(tx => {
					for (const s of this._editors.original.getSelections() || []) {
						m?.ensureOriginalLineIsVisible(s.getStartPosition().lineNumber, tx);
						m?.ensureOriginalLineIsVisible(s.getEndPosition().lineNumber, tx);
					}
				});
			}
		}));

		this._register(this._editors.modified.onDidChangeCursorPosition(e => {
			if (e.reason === CursorChangeReason.Explicit) {
				const m = this._diffModel.get();
				transaction(tx => {
					for (const s of this._editors.modified.getSelections() || []) {
						m?.ensureModifiedLineIsVisible(s.getStartPosition().lineNumber, tx);
						m?.ensureModifiedLineIsVisible(s.getEndPosition().lineNumber, tx);
					}
				});
			}
		}));

		const unchangedRegions = this._diffModel.map((m, reader) => m?.diff.read(reader)?.mappings.length === 0 ? [] : m?.unchangedRegions.read(reader) ?? []);

		const viewZones = derivedWithStore('view zones', (reader, store) => {
			const origViewZones: IViewZone[] = [];
			const modViewZones: IViewZone[] = [];
			const sideBySide = this._options.renderSideBySide.read(reader);

			const curUnchangedRegions = unchangedRegions.read(reader);
			for (const r of curUnchangedRegions) {
				if (r.shouldHideControls(reader)) {
					continue;
				}

				{
					const d = derived(reader => /** @description hiddenOriginalRangeStart */ r.getHiddenOriginalRange(reader).startLineNumber - 1);
					const origVz = new PlaceholderViewZone(d, 24);
					origViewZones.push(origVz);
					store.add(new CollapsedCodeOverlayWidget(this._editors.original, origVz, r, !sideBySide));
				}
				{
					const d = derived(reader => /** @description hiddenModifiedRangeStart */ r.getHiddenModifiedRange(reader).startLineNumber - 1);
					const modViewZone = new PlaceholderViewZone(d, 24);
					modViewZones.push(modViewZone);
					store.add(new CollapsedCodeOverlayWidget(this._editors.modified, modViewZone, r, false));
				}
			}

			return { origViewZones, modViewZones, };
		});


		const unchangedLinesDecoration: IModelDecorationOptions = {
			description: 'unchanged lines',
			className: 'diff-unchanged-lines',
			isWholeLine: true,
		};
		const unchangedLinesDecorationShow: IModelDecorationOptions = {
			description: 'Fold Unchanged',
			glyphMarginHoverMessage: new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true })
				.appendMarkdown(localize('foldUnchanged', 'Fold Unchanged Region')),
			glyphMarginClassName: 'fold-unchanged ' + ThemeIcon.asClassName(Codicon.fold),
			zIndex: 10001,
		};

		this._register(applyObservableDecorations(this._editors.original, derived(reader => {
			/** @description decorations */
			const curUnchangedRegions = unchangedRegions.read(reader);
			const result = curUnchangedRegions.map<IModelDeltaDecoration>(r => ({
				range: r.originalRange.toInclusiveRange()!,
				options: unchangedLinesDecoration,
			}));
			for (const r of curUnchangedRegions) {
				if (r.shouldHideControls(reader)) {
					result.push({
						range: Range.fromPositions(new Position(r.originalLineNumber, 1)),
						options: unchangedLinesDecorationShow
					});
				}
			}
			return result;
		})));

		this._register(applyObservableDecorations(this._editors.modified, derived(reader => {
			/** @description decorations */
			const curUnchangedRegions = unchangedRegions.read(reader);
			const result = curUnchangedRegions.map<IModelDeltaDecoration>(r => ({
				range: r.modifiedRange.toInclusiveRange()!,
				options: unchangedLinesDecoration,
			}));
			for (const r of curUnchangedRegions) {
				if (r.shouldHideControls(reader)) {
					result.push({
						range: LineRange.ofLength(r.modifiedLineNumber, 1).toInclusiveRange()!,
						options: unchangedLinesDecorationShow
					});
				}
			}
			return result;
		})));

		this._register(applyViewZones(this._editors.original, viewZones.map(v => v.origViewZones), v => this._isUpdatingViewZones = v));
		this._register(applyViewZones(this._editors.modified, viewZones.map(v => v.modViewZones), v => this._isUpdatingViewZones = v));

		this._register(autorun((reader) => {
			/** @description update folded unchanged regions */
			const curUnchangedRegions = unchangedRegions.read(reader);
			this._editors.original.setHiddenAreas(curUnchangedRegions.map(r => r.getHiddenOriginalRange(reader).toInclusiveRange()).filter(isDefined));
			this._editors.modified.setHiddenAreas(curUnchangedRegions.map(r => r.getHiddenModifiedRange(reader).toInclusiveRange()).filter(isDefined));
		}));

		this._register(this._editors.modified.onMouseUp(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
				const lineNumber = event.target.position.lineNumber;
				const model = this._diffModel.get();
				if (!model) { return; }
				const region = model.unchangedRegions.get().find(r => r.modifiedRange.includes(lineNumber));
				if (!region) { return; }
				region.setState(0, 0, undefined);
				event.event.stopPropagation();
				event.event.preventDefault();
			}
		}));

		this._register(this._editors.original.onMouseUp(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
				const lineNumber = event.target.position.lineNumber;
				const model = this._diffModel.get();
				if (!model) { return; }
				const region = model.unchangedRegions.get().find(r => r.originalRange.includes(lineNumber));
				if (!region) { return; }
				region.setState(0, 0, undefined);
				event.event.stopPropagation();
				event.event.preventDefault();
			}
		}));
	}
}

class CollapsedCodeOverlayWidget extends ViewZoneOverlayWidget {
	private readonly _nodes = h('div.diff-hidden-lines', [
		h('div.top@top', { title: localize('diff.hiddenLines.top', 'Click or drag to show more above') }),
		h('div.center@content', { style: { display: 'flex' } }, [
			h('div@first', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } },
				[$('a', { title: localize('showAll', 'Show all'), role: 'button', onclick: () => { this._unchangedRegion.showAll(undefined); } }, ...renderLabelWithIcons('$(unfold)'))]
			),
			h('div@others', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } }),
		]),
		h('div.bottom@bottom', { title: localize('diff.bottom', 'Click or drag to show more below'), role: 'button' }),
	]);

	constructor(
		private readonly _editor: ICodeEditor,
		_viewZone: PlaceholderViewZone,
		private readonly _unchangedRegion: UnchangedRegion,
		private readonly hide: boolean,
	) {
		const root = h('div.diff-hidden-lines-widget');
		super(_editor, _viewZone, root.root);
		root.root.appendChild(this._nodes.root);

		const layoutInfo = observableFromEvent(this._editor.onDidLayoutChange, () =>
			this._editor.getLayoutInfo()
		);

		if (!this.hide) {
			this._register(applyStyle(this._nodes.first, { width: layoutInfo.map((l) => l.contentLeft) }));
		} else {
			reset(this._nodes.first);
		}

		const editor = this._editor;

		this._register(addDisposableListener(this._nodes.top, 'mousedown', e => {
			if (e.button !== 0) {
				return;
			}
			this._nodes.top.classList.toggle('dragging', true);
			this._nodes.root.classList.toggle('dragging', true);
			e.preventDefault();
			const startTop = e.clientY;
			let didMove = false;
			const cur = this._unchangedRegion.visibleLineCountTop.get();
			this._unchangedRegion.isDragged.set(true, undefined);


			const mouseMoveListener = addDisposableListener(window, 'mousemove', e => {
				const currentTop = e.clientY;
				const delta = currentTop - startTop;
				didMove = didMove || Math.abs(delta) > 2;
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
				const newVal = Math.max(0, Math.min(cur + lineDelta, this._unchangedRegion.getMaxVisibleLineCountTop()));
				this._unchangedRegion.visibleLineCountTop.set(newVal, undefined);
			});

			const mouseUpListener = addDisposableListener(window, 'mouseup', e => {
				if (!didMove) {
					this._unchangedRegion.showMoreAbove(20, undefined);
				}
				this._nodes.top.classList.toggle('dragging', false);
				this._nodes.root.classList.toggle('dragging', false);
				this._unchangedRegion.isDragged.set(false, undefined);
				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));

		this._register(addDisposableListener(this._nodes.bottom, 'mousedown', e => {
			if (e.button !== 0) {
				return;
			}
			this._nodes.bottom.classList.toggle('dragging', true);
			this._nodes.root.classList.toggle('dragging', true);
			e.preventDefault();
			const startTop = e.clientY;
			let didMove = false;
			const cur = this._unchangedRegion.visibleLineCountBottom.get();
			this._unchangedRegion.isDragged.set(true, undefined);

			const mouseMoveListener = addDisposableListener(window, 'mousemove', e => {
				const currentTop = e.clientY;
				const delta = currentTop - startTop;
				didMove = didMove || Math.abs(delta) > 2;
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
				const newVal = Math.max(0, Math.min(cur - lineDelta, this._unchangedRegion.getMaxVisibleLineCountBottom()));
				const top = editor.getTopForLineNumber(this._unchangedRegion.originalRange.endLineNumberExclusive);
				this._unchangedRegion.visibleLineCountBottom.set(newVal, undefined);
				const top2 = editor.getTopForLineNumber(this._unchangedRegion.originalRange.endLineNumberExclusive);
				editor.setScrollTop(editor.getScrollTop() + (top2 - top));
			});

			const mouseUpListener = addDisposableListener(window, 'mouseup', e => {
				this._unchangedRegion.isDragged.set(false, undefined);

				if (!didMove) {
					const top = editor.getTopForLineNumber(this._unchangedRegion.originalRange.endLineNumberExclusive);

					this._unchangedRegion.showMoreBelow(20, undefined);
					const top2 = editor.getTopForLineNumber(this._unchangedRegion.originalRange.endLineNumberExclusive);
					editor.setScrollTop(editor.getScrollTop() + (top2 - top));
				}
				this._nodes.bottom.classList.toggle('dragging', false);
				this._nodes.root.classList.toggle('dragging', false);
				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));

		this._register(autorun(reader => {
			/** @description update labels */

			const children: HTMLElement[] = [];
			if (!this.hide && true) {
				const lineCount = _unchangedRegion.getHiddenModifiedRange(reader).length;
				const linesHiddenText = localize('hiddenLines', '{0} Hidden Lines', lineCount);
				children.push($('span', { title: linesHiddenText }, linesHiddenText));
			}

			// TODO@hediet implement breadcrumbs for collapsed regions
			/*
			if (_unchangedRegion.originalLineNumber === 48) {
				children.push($('span', undefined, '\u00a0|\u00a0'));
				children.push($('span', { title: 'test' }, ...renderLabelWithIcons('$(symbol-class) DiffEditorWidget2')));
			} else if (_unchangedRegion.originalLineNumber === 88) {
				children.push($('span', undefined, '\u00a0|\u00a0'));
				children.push($('span', { title: 'test' }, ...renderLabelWithIcons('$(symbol-constructor) constructor')));
			}
			*/

			reset(this._nodes.others, ...children);

		}));
	}
}
