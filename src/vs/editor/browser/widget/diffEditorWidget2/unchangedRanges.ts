/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, h, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, observableFromEvent, transaction } from 'vs/base/common/observable';
import { autorun, autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { derived, derivedWithStore } from 'vs/base/common/observableImpl/derived';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffModel, UnchangedRegion } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyStyle, applyViewZones } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export class UnchangedRangesFeature extends Disposable {
	private _isUpdatingViewZones = false;
	public get isUpdatingViewZones(): boolean { return this._isUpdatingViewZones; }

	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diffModel: IObservable<DiffModel | undefined>,
		private readonly _sideBySide: IObservable<boolean>,
	) {
		super();

		this._register(this._originalEditor.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._originalEditor.getSelections() || []) {
					m?.ensureOriginalLineIsVisible(s.getStartPosition().lineNumber, tx);
					m?.ensureOriginalLineIsVisible(s.getEndPosition().lineNumber, tx);
				}
			});
		}));

		this._register(this._modifiedEditor.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._modifiedEditor.getSelections() || []) {
					m?.ensureModifiedLineIsVisible(s.getStartPosition().lineNumber, tx);
					m?.ensureModifiedLineIsVisible(s.getEndPosition().lineNumber, tx);
				}
			});
		}));

		const viewZones = derivedWithStore('view zones', (reader, store) => {
			const origViewZones: IViewZone[] = [];
			const modViewZones: IViewZone[] = [];
			const sideBySide = this._sideBySide.read(reader);

			const unchangedRegions = this._diffModel.read(reader)?.unchangedRegions.read(reader) ?? [];
			for (const r of unchangedRegions) {
				if (r.shouldHideControls(reader)) {
					continue;
				}

				{
					const d = derived('hiddenOriginalRangeStart', reader => r.getHiddenOriginalRange(reader).startLineNumber - 1);
					const origVz = new PlaceholderViewZone(d, 30);
					origViewZones.push(origVz);
					store.add(new CollapsedCodeOverlayWidget(this._originalEditor, origVz, r, !sideBySide));
				}
				{
					const d = derived('hiddenModifiedRangeStart', reader => r.getHiddenModifiedRange(reader).startLineNumber - 1);
					const modViewZone = new PlaceholderViewZone(d, 30);
					modViewZones.push(modViewZone);
					store.add(new CollapsedCodeOverlayWidget(this._modifiedEditor, modViewZone, r, false));
				}
			}

			return { origViewZones, modViewZones, };
		});

		this._register(applyViewZones(this._originalEditor, viewZones.map(v => v.origViewZones), v => this._isUpdatingViewZones = v));
		this._register(applyViewZones(this._modifiedEditor, viewZones.map(v => v.modViewZones), v => this._isUpdatingViewZones = v));

		this._register(autorunWithStore2('update folded unchanged regions', (reader, store) => {
			const unchangedRegions = this._diffModel.read(reader)?.unchangedRegions.read(reader) ?? [];

			this._originalEditor.setHiddenAreas(unchangedRegions.map(r => r.getHiddenOriginalRange(reader).toInclusiveRange()).filter(isDefined));
			this._modifiedEditor.setHiddenAreas(unchangedRegions.map(r => r.getHiddenModifiedRange(reader).toInclusiveRange()).filter(isDefined));
		}));
	}
}

class CollapsedCodeOverlayWidget extends ViewZoneOverlayWidget {
	private readonly _nodes = h('div.diff-hidden-lines', [
		h('div.top@top', { title: 'Show more above' }),
		h('div.center@content', { style: { display: 'flex' } }, [
			h('div@first', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } },
				[$('a', { title: 'Show all', role: 'button', onclick: () => { this._unchangedRegion.showAll(undefined); } }, ...renderLabelWithIcons('$(unfold)'))]
			),
			h('div@others', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } }),
		]),
		h('div.bottom@bottom', { title: 'Show more below', role: 'button' }),
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
			this._nodes.top.classList.toggle('dragging', true);
			this._nodes.root.classList.toggle('dragging', true);
			e.preventDefault();
			const startTop = e.clientY;
			let didMove = false;
			const cur = this._unchangedRegion.visibleLineCountTop.get();
			this._unchangedRegion.isDragged.set(true, undefined);


			const mouseMoveListener = addDisposableListener(document.body, 'mousemove', e => {
				const currentTop = e.clientY;
				const delta = currentTop - startTop;
				didMove = didMove || Math.abs(delta) > 2;
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
				const newVal = Math.max(0, Math.min(cur + lineDelta, this._unchangedRegion.getMaxVisibleLineCountTop()));
				this._unchangedRegion.visibleLineCountTop.set(newVal, undefined);
			});

			const mouseUpListener = addDisposableListener(document.body, 'mouseup', e => {
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

			this._nodes.bottom.classList.toggle('dragging', true);
			this._nodes.root.classList.toggle('dragging', true);
			e.preventDefault();
			const startTop = e.clientY;
			let didMove = false;
			const cur = this._unchangedRegion.visibleLineCountBottom.get();
			this._unchangedRegion.isDragged.set(true, undefined);

			const mouseMoveListener = addDisposableListener(document.body, 'mousemove', e => {
				const currentTop = e.clientY;
				const delta = currentTop - startTop;
				didMove = didMove || Math.abs(delta) > 2;
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
				const newVal = Math.max(0, Math.min(cur - lineDelta, this._unchangedRegion.getMaxVisibleLineCountBottom()));
				const top = editor.getTopForLineNumber(this._unchangedRegion.modifiedRange.endLineNumberExclusive);
				this._unchangedRegion.visibleLineCountBottom.set(newVal, undefined);
				const top2 = editor.getTopForLineNumber(this._unchangedRegion.modifiedRange.endLineNumberExclusive);
				editor.setScrollTop(editor.getScrollTop() + (top2 - top));
			});

			const mouseUpListener = addDisposableListener(document.body, 'mouseup', e => {
				if (!didMove) {
					this._unchangedRegion.showMoreBelow(20, undefined);
				}
				this._nodes.bottom.classList.toggle('dragging', false);
				this._nodes.root.classList.toggle('dragging', false);
				this._unchangedRegion.isDragged.set(false, undefined);
				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));

		this._register(autorun('update labels', (reader) => {

			const children: HTMLElement[] = [];
			if (!this.hide && true) {
				const lineCount = _unchangedRegion.getHiddenModifiedRange(reader).length;
				const linesHiddenText = `${lineCount} Hidden Lines`;
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
