/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIfDefined, itemsEquals } from '../../base/common/equals.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { DebugLocation, IObservable, IObservableWithChange, IReader, ITransaction, TransactionImpl, autorun, autorunOpts, derived, derivedOpts, derivedWithSetter, observableFromEvent, observableSignal, observableSignalFromEvent, observableValue, observableValueOpts } from '../../base/common/observable.js';
import { EditorOption, FindComputedEditorOptionValueById } from '../common/config/editorOptions.js';
import { LineRange } from '../common/core/ranges/lineRange.js';
import { OffsetRange } from '../common/core/ranges/offsetRange.js';
import { Position } from '../common/core/position.js';
import { Selection } from '../common/core/selection.js';
import { ICursorSelectionChangedEvent } from '../common/cursorEvents.js';
import { IModelDeltaDecoration, ITextModel } from '../common/model.js';
import { IModelContentChangedEvent } from '../common/textModelEvents.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent, IOverlayWidget, IOverlayWidgetPosition, IPasteEvent } from './editorBrowser.js';
import { Point } from '../common/core/2d/point.js';

/**
 * Returns a facade for the code editor that provides observables for various states/events.
*/
export function observableCodeEditor(editor: ICodeEditor): ObservableCodeEditor {
	return ObservableCodeEditor.get(editor);
}

export class ObservableCodeEditor extends Disposable {
	private static readonly _map = new Map<ICodeEditor, ObservableCodeEditor>();

	/**
	 * Make sure that editor is not disposed yet!
	*/
	public static get(editor: ICodeEditor): ObservableCodeEditor {
		let result = ObservableCodeEditor._map.get(editor);
		if (!result) {
			result = new ObservableCodeEditor(editor);
			ObservableCodeEditor._map.set(editor, result);
			const d = editor.onDidDispose(() => {
				const item = ObservableCodeEditor._map.get(editor);
				if (item) {
					ObservableCodeEditor._map.delete(editor);
					item.dispose();
					d.dispose();
				}
			});
		}
		return result;
	}

	private _updateCounter;
	private _currentTransaction: TransactionImpl | undefined;

	private _beginUpdate(): void {
		this._updateCounter++;
		if (this._updateCounter === 1) {
			this._currentTransaction = new TransactionImpl(() => {
				/** @description Update editor state */
			});
		}
	}

	private _endUpdate(): void {
		this._updateCounter--;
		if (this._updateCounter === 0) {
			const t = this._currentTransaction!;
			this._currentTransaction = undefined;
			t.finish();
		}
	}

	private constructor(public readonly editor: ICodeEditor) {
		super();
		this._updateCounter = 0;
		this._currentTransaction = undefined;
		this._model = observableValue(this, this.editor.getModel());
		this.model = this._model;
		this.isReadonly = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.readOnly));
		this._versionId = observableValueOpts<number | null, IModelContentChangedEvent | undefined>({ owner: this, lazy: true }, this.editor.getModel()?.getVersionId() ?? null);
		this.versionId = this._versionId;
		this._selections = observableValueOpts<Selection[] | null, ICursorSelectionChangedEvent | undefined>(
			{ owner: this, equalsFn: equalsIfDefined(itemsEquals(Selection.selectionsEqual)), lazy: true },
			this.editor.getSelections() ?? null
		);
		this.selections = this._selections;
		this.positions = derivedOpts<readonly Position[] | null>(
			{ owner: this, equalsFn: equalsIfDefined(itemsEquals(Position.equals)) },
			reader => this.selections.read(reader)?.map(s => s.getStartPosition()) ?? null
		);
		this.isFocused = observableFromEvent(this, e => {
			const d1 = this.editor.onDidFocusEditorWidget(e);
			const d2 = this.editor.onDidBlurEditorWidget(e);
			return {
				dispose() {
					d1.dispose();
					d2.dispose();
				}
			};
		}, () => this.editor.hasWidgetFocus());
		this.isTextFocused = observableFromEvent(this, e => {
			const d1 = this.editor.onDidFocusEditorText(e);
			const d2 = this.editor.onDidBlurEditorText(e);
			return {
				dispose() {
					d1.dispose();
					d2.dispose();
				}
			};
		}, () => this.editor.hasTextFocus());
		this.inComposition = observableFromEvent(this, e => {
			const d1 = this.editor.onDidCompositionStart(() => {
				e(undefined);
			});
			const d2 = this.editor.onDidCompositionEnd(() => {
				e(undefined);
			});
			return {
				dispose() {
					d1.dispose();
					d2.dispose();
				}
			};
		}, () => this.editor.inComposition);
		this.value = derivedWithSetter(this,
			reader => { this.versionId.read(reader); return this.model.read(reader)?.getValue() ?? ''; },
			(value, tx) => {
				const model = this.model.get();
				if (model !== null) {
					if (value !== model.getValue()) {
						model.setValue(value);
					}
				}
			}
		);
		this.valueIsEmpty = derived(this, reader => { this.versionId.read(reader); return this.editor.getModel()?.getValueLength() === 0; });
		this.cursorSelection = derivedOpts({ owner: this, equalsFn: equalsIfDefined(Selection.selectionsEqual) }, reader => this.selections.read(reader)?.[0] ?? null);
		this.cursorPosition = derivedOpts({ owner: this, equalsFn: Position.equals }, reader => this.selections.read(reader)?.[0]?.getPosition() ?? null);
		this.cursorLineNumber = derived<number | null>(this, reader => this.cursorPosition.read(reader)?.lineNumber ?? null);
		this.onDidType = observableSignal<string>(this);
		this.onDidPaste = observableSignal<IPasteEvent>(this);
		this.scrollTop = observableFromEvent(this.editor.onDidScrollChange, () => this.editor.getScrollTop());
		this.scrollLeft = observableFromEvent(this.editor.onDidScrollChange, () => this.editor.getScrollLeft());
		this.layoutInfo = observableFromEvent(this.editor.onDidLayoutChange, () => this.editor.getLayoutInfo());
		this.layoutInfoContentLeft = this.layoutInfo.map(l => l.contentLeft);
		this.layoutInfoDecorationsLeft = this.layoutInfo.map(l => l.decorationsLeft);
		this.layoutInfoWidth = this.layoutInfo.map(l => l.width);
		this.layoutInfoHeight = this.layoutInfo.map(l => l.height);
		this.layoutInfoMinimap = this.layoutInfo.map(l => l.minimap);
		this.layoutInfoVerticalScrollbarWidth = this.layoutInfo.map(l => l.verticalScrollbarWidth);
		this.contentWidth = observableFromEvent(this.editor.onDidContentSizeChange, () => this.editor.getContentWidth());
		this.contentHeight = observableFromEvent(this.editor.onDidContentSizeChange, () => this.editor.getContentHeight());
		this._onDidChangeViewZones = observableSignalFromEvent(this, this.editor.onDidChangeViewZones);
		this._onDidHiddenAreasChanged = observableSignalFromEvent(this, this.editor.onDidChangeHiddenAreas);
		this._onDidLineHeightChanged = observableSignalFromEvent(this, this.editor.onDidChangeLineHeight);

		this._widgetCounter = 0;
		this.openedPeekWidgets = observableValue(this, 0);

		this._register(this.editor.onBeginUpdate(() => this._beginUpdate()));
		this._register(this.editor.onEndUpdate(() => this._endUpdate()));

		this._register(this.editor.onDidChangeModel(() => {
			this._beginUpdate();
			try {
				this._model.set(this.editor.getModel(), this._currentTransaction);
				this._forceUpdate();
			} finally {
				this._endUpdate();
			}
		}));

		this._register(this.editor.onDidType((e) => {
			this._beginUpdate();
			try {
				this._forceUpdate();
				this.onDidType.trigger(this._currentTransaction, e);
			} finally {
				this._endUpdate();
			}
		}));

		this._register(this.editor.onDidPaste((e) => {
			this._beginUpdate();
			try {
				this._forceUpdate();
				this.onDidPaste.trigger(this._currentTransaction, e);
			} finally {
				this._endUpdate();
			}
		}));

		this._register(this.editor.onDidChangeModelContent(e => {
			this._beginUpdate();
			try {
				this._versionId.set(this.editor.getModel()?.getVersionId() ?? null, this._currentTransaction, e);
				this._forceUpdate();
			} finally {
				this._endUpdate();
			}
		}));

		this._register(this.editor.onDidChangeCursorSelection(e => {
			this._beginUpdate();
			try {
				this._selections.set(this.editor.getSelections(), this._currentTransaction, e);
				this._forceUpdate();
			} finally {
				this._endUpdate();
			}
		}));

		this.domNode = derived(reader => {
			this.model.read(reader);
			return this.editor.getDomNode();
		});
	}

	public forceUpdate(): void;
	public forceUpdate<T>(cb: (tx: ITransaction) => T): T;
	public forceUpdate<T>(cb?: (tx: ITransaction) => T): T {
		this._beginUpdate();
		try {
			this._forceUpdate();
			if (!cb) { return undefined as T; }
			return cb(this._currentTransaction!);
		} finally {
			this._endUpdate();
		}
	}

	private _forceUpdate(): void {
		this._beginUpdate();
		try {
			this._model.set(this.editor.getModel(), this._currentTransaction);
			this._versionId.set(this.editor.getModel()?.getVersionId() ?? null, this._currentTransaction, undefined);
			this._selections.set(this.editor.getSelections(), this._currentTransaction, undefined);
		} finally {
			this._endUpdate();
		}
	}

	private readonly _model;
	public readonly model: IObservable<ITextModel | null>;

	public readonly isReadonly;

	private readonly _versionId;
	public readonly versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>;

	private readonly _selections;
	public readonly selections: IObservableWithChange<Selection[] | null, ICursorSelectionChangedEvent | undefined>;


	public readonly positions;

	public readonly isFocused;

	public readonly isTextFocused;

	public readonly inComposition;

	public readonly value;
	public readonly valueIsEmpty;
	public readonly cursorSelection;
	public readonly cursorPosition;
	public readonly cursorLineNumber;

	public readonly onDidType;
	public readonly onDidPaste;

	public readonly scrollTop;
	public readonly scrollLeft;

	public readonly layoutInfo;
	public readonly layoutInfoContentLeft;
	public readonly layoutInfoDecorationsLeft;
	public readonly layoutInfoWidth;
	public readonly layoutInfoHeight;
	public readonly layoutInfoMinimap;
	public readonly layoutInfoVerticalScrollbarWidth;

	public readonly contentWidth;
	public readonly contentHeight;

	public readonly domNode;

	public getOption<T extends EditorOption>(id: T, debugLocation = DebugLocation.ofCaller()): IObservable<FindComputedEditorOptionValueById<T>> {
		return observableFromEvent(this, cb => this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(id)) { cb(undefined); }
		}), () => this.editor.getOption(id), debugLocation);
	}

	public setDecorations(decorations: IObservable<IModelDeltaDecoration[]>): IDisposable {
		const d = new DisposableStore();
		const decorationsCollection = this.editor.createDecorationsCollection();
		d.add(autorunOpts({ owner: this, debugName: () => `Apply decorations from ${decorations.debugName}` }, reader => {
			const d = decorations.read(reader);
			decorationsCollection.set(d);
		}));
		d.add({
			dispose: () => {
				decorationsCollection.clear();
			}
		});
		return d;
	}

	private _widgetCounter;

	public createOverlayWidget(widget: IObservableOverlayWidget): IDisposable {
		const overlayWidgetId = 'observableOverlayWidget' + (this._widgetCounter++);
		const w: IOverlayWidget = {
			getDomNode: () => widget.domNode,
			getPosition: () => widget.position.get(),
			getId: () => overlayWidgetId,
			allowEditorOverflow: widget.allowEditorOverflow,
			getMinContentWidthInPx: () => widget.minContentWidthInPx.get(),
		};
		this.editor.addOverlayWidget(w);
		const d = autorun(reader => {
			widget.position.read(reader);
			widget.minContentWidthInPx.read(reader);
			this.editor.layoutOverlayWidget(w);
		});
		return toDisposable(() => {
			d.dispose();
			this.editor.removeOverlayWidget(w);
		});
	}

	public createContentWidget(widget: IObservableContentWidget): IDisposable {
		const contentWidgetId = 'observableContentWidget' + (this._widgetCounter++);
		const w: IContentWidget = {
			getDomNode: () => widget.domNode,
			getPosition: () => widget.position.get(),
			getId: () => contentWidgetId,
			allowEditorOverflow: widget.allowEditorOverflow,
		};
		this.editor.addContentWidget(w);
		const d = autorun(reader => {
			widget.position.read(reader);
			this.editor.layoutContentWidget(w);
		});
		return toDisposable(() => {
			d.dispose();
			this.editor.removeContentWidget(w);
		});
	}

	public observeLineOffsetRange(lineRange: IObservable<LineRange>, store: DisposableStore): IObservable<OffsetRange> {
		const start = this.observePosition(lineRange.map(r => new Position(r.startLineNumber, 1)), store);
		const end = this.observePosition(lineRange.map(r => new Position(r.endLineNumberExclusive + 1, 1)), store);

		return derived(reader => {
			start.read(reader);
			end.read(reader);
			const range = lineRange.read(reader);
			const lineCount = this.model.read(reader)?.getLineCount();
			const s = (
				(typeof lineCount !== 'undefined' && range.startLineNumber > lineCount
					? this.editor.getBottomForLineNumber(lineCount)
					: this.editor.getTopForLineNumber(range.startLineNumber)
				)
				- this.scrollTop.read(reader)
			);
			const e = range.isEmpty ? s : (this.editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this.scrollTop.read(reader));
			return new OffsetRange(s, e);
		});
	}

	/**
	 * Uses an approximation if the exact position cannot be determined.
	 */
	getLeftOfPosition(position: Position, reader: IReader | undefined): number {
		this.layoutInfo.read(reader);
		this.value.read(reader);

		let offset = this.editor.getOffsetForColumn(position.lineNumber, position.column);
		if (offset === -1) {
			// approximation
			const typicalHalfwidthCharacterWidth = this.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			const approximation = position.column * typicalHalfwidthCharacterWidth;
			offset = approximation;
		}
		return offset;
	}

	public observePosition(position: IObservable<Position | null>, store: DisposableStore): IObservable<Point | null> {
		let pos = position.get();
		const result = observableValueOpts<Point | null>({ owner: this, debugName: () => `topLeftOfPosition${pos?.toString()}`, equalsFn: equalsIfDefined(Point.equals) }, new Point(0, 0));
		const contentWidgetId = `observablePositionWidget` + (this._widgetCounter++);
		const domNode = document.createElement('div');
		const w: IContentWidget = {
			getDomNode: () => domNode,
			getPosition: () => {
				return pos ? { preference: [ContentWidgetPositionPreference.EXACT], position: position.get() } : null;
			},
			getId: () => contentWidgetId,
			allowEditorOverflow: false,
			useDisplayNone: true,
			afterRender: (position, coordinate) => {
				const model = this._model.get();
				if (model && pos && pos.lineNumber > model.getLineCount()) {
					// the position is after the last line
					result.set(new Point(0, this.editor.getBottomForLineNumber(model.getLineCount()) - this.scrollTop.get()), undefined);
				} else {
					result.set(coordinate ? new Point(coordinate.left, coordinate.top) : null, undefined);
				}
			},
		};
		this.editor.addContentWidget(w);
		store.add(autorun(reader => {
			pos = position.read(reader);
			this.editor.layoutContentWidget(w);
		}));
		store.add(toDisposable(() => {
			this.editor.removeContentWidget(w);
		}));
		return result;
	}

	public readonly openedPeekWidgets;

	isTargetHovered(predicate: (target: IEditorMouseEvent) => boolean, store: DisposableStore): IObservable<boolean> {
		const isHovered = observableValue('isInjectedTextHovered', false);
		store.add(this.editor.onMouseMove(e => {
			const val = predicate(e);
			isHovered.set(val, undefined);
		}));

		store.add(this.editor.onMouseLeave(E => {
			isHovered.set(false, undefined);
		}));
		return isHovered;
	}

	observeLineHeightForPosition(position: IObservable<Position> | Position): IObservable<number>;
	observeLineHeightForPosition(position: IObservable<null>): IObservable<null>;
	observeLineHeightForPosition(position: IObservable<Position | null> | Position): IObservable<number | null> {
		return derived(reader => {
			const pos = position instanceof Position ? position : position.read(reader);
			if (pos === null) {
				return null;
			}

			this.getOption(EditorOption.lineHeight).read(reader);

			return this.editor.getLineHeightForPosition(pos);
		});
	}

	observeLineHeightForLine(lineNumber: IObservable<number> | number): IObservable<number>;
	observeLineHeightForLine(lineNumber: IObservable<null>): IObservable<null>;
	observeLineHeightForLine(lineNumber: IObservable<number | null> | number): IObservable<number | null> {
		if (typeof lineNumber === 'number') {
			return this.observeLineHeightForPosition(new Position(lineNumber, 1));
		}

		return derived(reader => {
			const line = lineNumber.read(reader);
			if (line === null) {
				return null;
			}

			return this.observeLineHeightForPosition(new Position(line, 1)).read(reader);
		});
	}

	observeLineHeightsForLineRange(lineNumber: IObservable<LineRange> | LineRange): IObservable<number[]> {
		return derived(reader => {
			const range = lineNumber instanceof LineRange ? lineNumber : lineNumber.read(reader);

			const heights: number[] = [];
			for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
				heights.push(this.observeLineHeightForLine(i).read(reader));
			}
			return heights;
		});
	}

	private readonly _onDidChangeViewZones;
	private readonly _onDidHiddenAreasChanged;
	private readonly _onDidLineHeightChanged;

	/**
	 * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
	 */
	observeTopForLineNumber(lineNumber: number): IObservable<number> {
		return derived(reader => {
			this.layoutInfo.read(reader);
			this._onDidChangeViewZones.read(reader);
			this._onDidHiddenAreasChanged.read(reader);
			this._onDidLineHeightChanged.read(reader);
			this._versionId.read(reader);
			return this.editor.getTopForLineNumber(lineNumber);
		});
	}

	/**
	 * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
	 */
	observeBottomForLineNumber(lineNumber: number): IObservable<number> {
		return derived(reader => {
			this.layoutInfo.read(reader);
			this._onDidChangeViewZones.read(reader);
			this._onDidHiddenAreasChanged.read(reader);
			this._onDidLineHeightChanged.read(reader);
			this._versionId.read(reader);
			return this.editor.getBottomForLineNumber(lineNumber);
		});
	}
}

interface IObservableOverlayWidget {
	get domNode(): HTMLElement;
	readonly position: IObservable<IOverlayWidgetPosition | null>;
	readonly minContentWidthInPx: IObservable<number>;
	get allowEditorOverflow(): boolean;
}

interface IObservableContentWidget {
	get domNode(): HTMLElement;
	readonly position: IObservable<IContentWidgetPosition | null>;
	get allowEditorOverflow(): boolean;
}
