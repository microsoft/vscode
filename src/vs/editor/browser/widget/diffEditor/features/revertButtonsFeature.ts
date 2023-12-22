/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, h, EventType } from 'vs/base/browser/dom';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorunWithStore, derived } from 'vs/base/common/observable';
import { IGlyphMarginWidget, IGlyphMarginWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditor/components/diffEditorEditors';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorOptions';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { LineRange, LineRangeSet } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { GlyphMarginLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';

export class RevertButtonsFeature extends Disposable {
	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
		private readonly _widget: DiffEditorWidget
	) {
		super();

		const emptyArr: never[] = [];
		const selectedDiffs = derived(this, (reader) => {
			/** @description selectedDiffs */
			const model = this._diffModel.read(reader);
			const diff = model?.diff.read(reader);
			if (!diff) { return emptyArr; }

			const selections = this._editors.modifiedSelections.read(reader);

			if (selections.every(s => s.isEmpty())) {
				return emptyArr;
			}

			const lineRanges = new LineRangeSet(selections.map(s => LineRange.fromRangeInclusive(s)));

			const mappings = diff.mappings.filter(m => m.lineRangeMapping.innerChanges && lineRanges.intersects(m.lineRangeMapping.modified));

			const result = mappings.map(mapping => ({
				mapping,
				rangeMappings: mapping.lineRangeMapping.innerChanges!.filter(c => selections.some(s => Range.areIntersecting(c.modifiedRange, s)))
			}));
			if (result.length === 0 || result.every(r => r.rangeMappings.length === 0)) { return emptyArr; }
			return result;
		});

		this._register(autorunWithStore((reader, store) => {
			const model = this._diffModel.read(reader);
			const diff = model?.diff.read(reader);
			if (!model || !diff) { return; }
			const movedTextToCompare = this._diffModel.read(reader)!.movedTextToCompare.read(reader);
			if (movedTextToCompare) { return; }
			if (!this._options.shouldRenderRevertArrows.read(reader)) { return; }

			const glyphWidgetsModified: IGlyphMarginWidget[] = [];

			const selectedDiffs_ = selectedDiffs.read(reader);
			const diffsSet = new Set(selectedDiffs_.map(d => d.mapping));

			if (selectedDiffs_.length > 0) {
				const selections = this._editors.modifiedSelections.read(reader);

				const btn = store.add(new RevertButton(selections[selections.length - 1].positionLineNumber, this._widget, selectedDiffs_.flatMap(d => d.rangeMappings), true));
				this._editors.modified.addGlyphMarginWidget(btn);
				glyphWidgetsModified.push(btn);
			}

			for (const m of diff.mappings) {
				if (diffsSet.has(m)) {
					continue;
				}
				if (!m.lineRangeMapping.modified.isEmpty && m.lineRangeMapping.innerChanges) {
					const btn = store.add(new RevertButton(m.lineRangeMapping.modified.startLineNumber, this._widget, m.lineRangeMapping.innerChanges, false));
					this._editors.modified.addGlyphMarginWidget(btn);
					glyphWidgetsModified.push(btn);
				}
			}

			store.add(toDisposable(() => {
				for (const w of glyphWidgetsModified) {
					this._editors.modified.removeGlyphMarginWidget(w);
				}
			}));
		}));
	}
}

export class RevertButton extends Disposable implements IGlyphMarginWidget {
	public static counter = 0;

	private readonly _id: string = `revertButton${RevertButton.counter++}`;

	getId(): string { return this._id; }

	private readonly _domNode = h('div.revertButton', {
		title: this._selection
			? localize('revertSelectedChanges', 'Revert Selected Changes')
			: localize('revertChange', 'Revert Change')
	},
		[renderIcon(Codicon.arrowRight)]
	).root;

	constructor(
		private readonly _lineNumber: number,
		private readonly _widget: DiffEditorWidget,
		private readonly _diffs: RangeMapping[],
		private readonly _selection: boolean,
	) {
		super();


		this._register(addDisposableListener(this._domNode, EventType.MOUSE_DOWN, e => {
			// don't prevent context menu from showing up
			if (e.button !== 2) {
				e.stopPropagation();
				e.preventDefault();
			}
		}));

		this._register(addDisposableListener(this._domNode, EventType.MOUSE_UP, e => {
			e.stopPropagation();
			e.preventDefault();
		}));

		this._register(addDisposableListener(this._domNode, EventType.CLICK, (e) => {
			this._widget.revertRangeMappings(this._diffs);
			e.stopPropagation();
			e.preventDefault();
		}));
	}

	/**
	 * Get the dom node of the glyph widget.
	 */
	getDomNode(): HTMLElement {
		return this._domNode;
	}

	/**
	 * Get the placement of the glyph widget.
	 */
	getPosition(): IGlyphMarginWidgetPosition {
		return {
			lane: GlyphMarginLane.Right,
			range: {
				startColumn: 1,
				startLineNumber: this._lineNumber,
				endColumn: 1,
				endLineNumber: this._lineNumber,
			},
			zIndex: 10001,
		};
	}
}
