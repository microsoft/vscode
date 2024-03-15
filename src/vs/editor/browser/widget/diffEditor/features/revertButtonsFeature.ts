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
import { LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { GlyphMarginLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';

const emptyArr: never[] = [];

export class RevertButtonsFeature extends Disposable {
	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
		private readonly _widget: DiffEditorWidget
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			if (!this._options.shouldRenderOldRevertArrows.read(reader)) { return; }
			const model = this._diffModel.read(reader);
			const diff = model?.diff.read(reader);
			if (!model || !diff) { return; }
			if (model.movedTextToCompare.read(reader)) { return; }

			const glyphWidgetsModified: IGlyphMarginWidget[] = [];

			const selectedDiffs = this._selectedDiffs.read(reader);
			const selectedDiffsSet = new Set(selectedDiffs.map(d => d.mapping));

			if (selectedDiffs.length > 0) {
				// The button to revert the selection
				const selections = this._editors.modifiedSelections.read(reader);

				const btn = store.add(new RevertButton(
					selections[selections.length - 1].positionLineNumber,
					this._widget,
					selectedDiffs.flatMap(d => d.rangeMappings),
					true
				));
				this._editors.modified.addGlyphMarginWidget(btn);
				glyphWidgetsModified.push(btn);
			}

			for (const m of diff.mappings) {
				if (selectedDiffsSet.has(m)) { continue; }
				if (!m.lineRangeMapping.modified.isEmpty && m.lineRangeMapping.innerChanges) {
					const btn = store.add(new RevertButton(
						m.lineRangeMapping.modified.startLineNumber,
						this._widget,
						m.lineRangeMapping,
						false
					));
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

	private readonly _selectedDiffs = derived(this, (reader) => {
		/** @description selectedDiffs */
		const model = this._diffModel.read(reader);
		const diff = model?.diff.read(reader);
		// Return `emptyArr` because it is a constant. [] is always a new array and would trigger a change.
		if (!diff) { return emptyArr; }

		const selections = this._editors.modifiedSelections.read(reader);
		if (selections.every(s => s.isEmpty())) { return emptyArr; }

		const selectedLineNumbers = new LineRangeSet(selections.map(s => LineRange.fromRangeInclusive(s)));

		const selectedMappings = diff.mappings.filter(m =>
			m.lineRangeMapping.innerChanges && selectedLineNumbers.intersects(m.lineRangeMapping.modified)
		);
		const result = selectedMappings.map(mapping => ({
			mapping,
			rangeMappings: mapping.lineRangeMapping.innerChanges!.filter(
				c => selections.some(s => Range.areIntersecting(c.modifiedRange, s))
			)
		}));
		if (result.length === 0 || result.every(r => r.rangeMappings.length === 0)) { return emptyArr; }
		return result;
	});
}

export class RevertButton extends Disposable implements IGlyphMarginWidget {
	public static counter = 0;

	private readonly _id: string = `revertButton${RevertButton.counter++}`;

	getId(): string { return this._id; }

	private readonly _domNode = h('div.revertButton', {
		title: this._revertSelection
			? localize('revertSelectedChanges', 'Revert Selected Changes')
			: localize('revertChange', 'Revert Change')
	},
		[renderIcon(Codicon.arrowRight)]
	).root;

	constructor(
		private readonly _lineNumber: number,
		private readonly _widget: DiffEditorWidget,
		private readonly _diffs: RangeMapping[] | LineRangeMapping,
		private readonly _revertSelection: boolean,
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
			if (this._diffs instanceof LineRangeMapping) {
				this._widget.revert(this._diffs);
			} else {
				this._widget.revertRangeMappings(this._diffs);
			}
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
