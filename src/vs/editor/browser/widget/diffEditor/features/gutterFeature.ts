/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener, h } from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditor/components/diffEditorEditors';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { appendRemoveOnDispose, applyStyle, prependRemoveOnDispose } from 'vs/editor/browser/widget/diffEditor/utils';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from 'vs/editor/browser/widget/diffEditor/utils/editorGutter';
import { ActionRunnerWithContext } from 'vs/editor/browser/widget/multiDiffEditor/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange, LineRangeSet } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Range } from 'vs/editor/common/core/range';
import { TextEdit } from 'vs/editor/common/core/textEdit';
import { DetailedLineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { TextModelText } from 'vs/editor/common/model/textModelText';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const emptyArr: never[] = [];
const width = 35;

export class DiffEditorGutter extends Disposable {
	private readonly _menu = this._register(this._menuService.createMenu(MenuId.DiffEditorHunkToolbar, this._contextKeyService));
	private readonly _actions = observableFromEvent(this._menu.onDidChange, () => this._menu.getActions());
	private readonly _hasActions = this._actions.map(a => a.length > 0);

	public readonly width = derived(this, reader => this._hasActions.read(reader) ? width : 0);

	private readonly elements = h('div.gutter@gutter', { style: { position: 'absolute', height: '100%', width: width + 'px' } }, []);

	constructor(
		diffEditorRoot: HTMLDivElement,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _editors: DiffEditorEditors,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
	) {
		super();

		this._register(prependRemoveOnDispose(diffEditorRoot, this.elements.root));

		this._register(addDisposableListener(this.elements.root, 'click', () => {
			this._editors.modified.focus();
		}));

		this._register(applyStyle(this.elements.root, { display: this._hasActions.map(a => a ? 'block' : 'none') }));

		this._register(new EditorGutter<DiffGutterItem>(this._editors.modified, this.elements.root, {
			getIntersectingGutterItems: (range, reader) => {
				const model = this._diffModel.read(reader);
				if (!model) {
					return [];
				}
				const diffs = model.diff.read(reader);
				if (!diffs) { return []; }

				const selection = this._selectedDiffs.read(reader);
				if (selection.length > 0) {
					const m = DetailedLineRangeMapping.fromRangeMappings(selection.flatMap(s => s.rangeMappings));
					return [
						new DiffGutterItem(
							m,
							true,
							MenuId.DiffEditorSelectionToolbar,
							undefined,
							model.model.original.uri,
							model.model.modified.uri,
						)];
				}

				const currentDiff = this._currentDiff.read(reader);

				return diffs.mappings.map(m => new DiffGutterItem(
					m.lineRangeMapping.withInnerChangesFromLineRanges(),
					m.lineRangeMapping === currentDiff?.lineRangeMapping,
					MenuId.DiffEditorHunkToolbar,
					undefined,
					model.model.original.uri,
					model.model.modified.uri,
				));
			},
			createView: (item, target) => {
				return this._instantiationService.createInstance(DiffToolBar, item, target, this);
			},
		}));

		this._register(addDisposableListener(this.elements.gutter, EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
			if (this._editors.modified.getOption(EditorOption.scrollbar).handleMouseWheel) {
				this._editors.modified.delegateScrollFromMouseWheelEvent(e);
			}
		}, { passive: false }));
	}

	public computeStagedValue(mapping: DetailedLineRangeMapping): string {
		const c = mapping.innerChanges ?? [];
		const modified = new TextModelText(this._editors.modifiedModel.get()!);
		const original = new TextModelText(this._editors.original.getModel()!);

		const edit = new TextEdit(c.map(c => c.toTextEdit(modified)));
		const value = edit.apply(original);
		return value;
	}

	private readonly _currentDiff = derived(this, (reader) => {
		const model = this._diffModel.read(reader);
		if (!model) {
			return undefined;
		}
		const mappings = model.diff.read(reader)?.mappings;

		const cursorPosition = this._editors.modifiedCursor.read(reader);
		if (!cursorPosition) { return undefined; }

		return mappings?.find(m => m.lineRangeMapping.modified.contains(cursorPosition.lineNumber));
	});

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

	layout(left: number) {
		this.elements.gutter.style.left = left + 'px';
	}
}

class DiffGutterItem implements IGutterItemInfo {
	constructor(
		public readonly mapping: DetailedLineRangeMapping,
		public readonly showAlways: boolean,
		public readonly menuId: MenuId,
		public readonly rangeOverride: LineRange | undefined,
		public readonly originalUri: URI,
		public readonly modifiedUri: URI,
	) {
	}
	get id(): string { return this.mapping.modified.toString(); }
	get range(): LineRange { return this.rangeOverride ?? this.mapping.modified; }
}


class DiffToolBar extends Disposable implements IGutterItemView {
	private readonly _elements = h('div.gutterItem', { style: { height: '20px', width: '34px' } }, [
		h('div.background@background', {}, []),
		h('div.buttons@buttons', {}, []),
	]);

	private readonly _showAlways = this._item.map(this, item => item.showAlways);
	private readonly _menuId = this._item.map(this, item => item.menuId);

	private readonly _isSmall = observableValue(this, false);

	constructor(
		private readonly _item: IObservable<DiffGutterItem>,
		target: HTMLElement,
		gutter: DiffEditorGutter,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		const hoverDelegate = this._register(instantiationService.createInstance(
			WorkbenchHoverDelegate,
			'element',
			true,
			{ position: { hoverPosition: HoverPosition.RIGHT } }
		));

		this._register(appendRemoveOnDispose(target, this._elements.root));

		this._register(autorun(reader => {
			/** @description update showAlways */
			const showAlways = this._showAlways.read(reader);
			this._elements.root.classList.toggle('noTransition', true);
			this._elements.root.classList.toggle('showAlways', showAlways);
			setTimeout(() => {
				this._elements.root.classList.toggle('noTransition', false);
			}, 0);
		}));


		this._register(autorunWithStore((reader, store) => {
			this._elements.buttons.replaceChildren();
			const i = store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.buttons, this._menuId.read(reader), {
				orientation: ActionsOrientation.VERTICAL,
				hoverDelegate,
				toolbarOptions: {
					primaryGroup: g => g.startsWith('primary'),
				},
				overflowBehavior: { maxItems: this._isSmall.read(reader) ? 1 : 3 },
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				actionRunner: new ActionRunnerWithContext(() => {
					const item = this._item.get();
					const mapping = item.mapping;
					return {
						mapping,
						originalWithModifiedChanges: gutter.computeStagedValue(mapping),
						originalUri: item.originalUri,
						modifiedUri: item.modifiedUri,
					} satisfies DiffEditorSelectionHunkToolbarContext;
				}),
				menuOptions: {
					shouldForwardArgs: true,
				},
			}));
			store.add(i.onDidChangeMenuItems(() => {
				if (this._lastItemRange) {
					this.layout(this._lastItemRange, this._lastViewRange!);
				}
			}));
		}));
	}

	private _lastItemRange: OffsetRange | undefined = undefined;
	private _lastViewRange: OffsetRange | undefined = undefined;

	layout(itemRange: OffsetRange, viewRange: OffsetRange): void {
		this._lastItemRange = itemRange;
		this._lastViewRange = viewRange;

		let itemHeight = this._elements.buttons.clientHeight;
		this._isSmall.set(this._item.get().mapping.original.startLineNumber === 1 && itemRange.length < 30, undefined);
		// Item might have changed
		itemHeight = this._elements.buttons.clientHeight;

		this._elements.root.style.top = itemRange.start + 'px';
		this._elements.root.style.height = itemRange.length + 'px';

		const middleHeight = itemRange.length / 2 - itemHeight / 2;

		const margin = itemHeight;

		let effectiveCheckboxTop = itemRange.start + middleHeight;

		const preferredViewPortRange = OffsetRange.tryCreate(
			margin,
			viewRange.endExclusive - margin - itemHeight
		);

		const preferredParentRange = OffsetRange.tryCreate(
			itemRange.start + margin,
			itemRange.endExclusive - itemHeight - margin
		);

		if (preferredParentRange && preferredViewPortRange && preferredParentRange.start < preferredParentRange.endExclusive) {
			effectiveCheckboxTop = preferredViewPortRange!.clip(effectiveCheckboxTop);
			effectiveCheckboxTop = preferredParentRange!.clip(effectiveCheckboxTop);
		}

		this._elements.buttons.style.top = `${effectiveCheckboxTop - itemRange.start}px`;
	}
}

export interface DiffEditorSelectionHunkToolbarContext {
	mapping: DetailedLineRangeMapping;

	/**
	 * The original text with the selected modified changes applied.
	*/
	originalWithModifiedChanges: string;

	modifiedUri: URI;
	originalUri: URI;
}
