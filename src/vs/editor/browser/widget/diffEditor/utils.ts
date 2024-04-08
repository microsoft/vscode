/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from 'vs/base/browser/dom';
import { findLast } from 'vs/base/common/arraysFind';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { isHotReloadEnabled, registerHotReloadHandler } from 'vs/base/common/hotReload';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ISettableObservable, autorun, autorunHandleChanges, autorunOpts, autorunWithStore, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { ICodeEditor, IOverlayWidget, IViewZone } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { DetailedLineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { TextLength } from 'vs/editor/common/core/textLength';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyValue, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export function joinCombine<T>(arr1: readonly T[], arr2: readonly T[], keySelector: (val: T) => number, combine: (v1: T, v2: T) => T): readonly T[] {
	if (arr1.length === 0) {
		return arr2;
	}
	if (arr2.length === 0) {
		return arr1;
	}

	const result: T[] = [];
	let i = 0;
	let j = 0;
	while (i < arr1.length && j < arr2.length) {
		const val1 = arr1[i];
		const val2 = arr2[j];
		const key1 = keySelector(val1);
		const key2 = keySelector(val2);

		if (key1 < key2) {
			result.push(val1);
			i++;
		} else if (key1 > key2) {
			result.push(val2);
			j++;
		} else {
			result.push(combine(val1, val2));
			i++;
			j++;
		}
	}
	while (i < arr1.length) {
		result.push(arr1[i]);
		i++;
	}
	while (j < arr2.length) {
		result.push(arr2[j]);
		j++;
	}
	return result;
}

// TODO make utility
export function applyObservableDecorations(editor: ICodeEditor, decorations: IObservable<IModelDeltaDecoration[]>): IDisposable {
	const d = new DisposableStore();
	const decorationsCollection = editor.createDecorationsCollection();
	d.add(autorunOpts({ debugName: () => `Apply decorations from ${decorations.debugName}` }, reader => {
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

export function appendRemoveOnDispose(parent: HTMLElement, child: HTMLElement) {
	parent.appendChild(child);
	return toDisposable(() => {
		parent.removeChild(child);
	});
}

export function prependRemoveOnDispose(parent: HTMLElement, child: HTMLElement) {
	parent.prepend(child);
	return toDisposable(() => {
		parent.removeChild(child);
	});
}

export function observableConfigValue<T>(key: string, defaultValue: T, configurationService: IConfigurationService): IObservable<T> {
	return observableFromEvent(
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key) ?? defaultValue,
	);
}

export class ObservableElementSizeObserver extends Disposable {
	private readonly elementSizeObserver: ElementSizeObserver;

	private readonly _width: ISettableObservable<number>;
	public get width(): IObservable<number> { return this._width; }

	private readonly _height: ISettableObservable<number>;
	public get height(): IObservable<number> { return this._height; }

	constructor(element: HTMLElement | null, dimension: IDimension | undefined) {
		super();

		this.elementSizeObserver = this._register(new ElementSizeObserver(element, dimension));
		this._width = observableValue(this, this.elementSizeObserver.getWidth());
		this._height = observableValue(this, this.elementSizeObserver.getHeight());

		this._register(this.elementSizeObserver.onDidChange(e => transaction(tx => {
			/** @description Set width/height from elementSizeObserver */
			this._width.set(this.elementSizeObserver.getWidth(), tx);
			this._height.set(this.elementSizeObserver.getHeight(), tx);
		})));
	}

	public observe(dimension?: IDimension): void {
		this.elementSizeObserver.observe(dimension);
	}

	public setAutomaticLayout(automaticLayout: boolean): void {
		if (automaticLayout) {
			this.elementSizeObserver.startObserving();
		} else {
			this.elementSizeObserver.stopObserving();
		}
	}
}

export function animatedObservable(targetWindow: Window, base: IObservable<number, boolean>, store: DisposableStore): IObservable<number> {
	let targetVal = base.get();
	let startVal = targetVal;
	let curVal = targetVal;
	const result = observableValue('animatedValue', targetVal);

	let animationStartMs: number = -1;
	const durationMs = 300;
	let animationFrame: number | undefined = undefined;

	store.add(autorunHandleChanges({
		createEmptyChangeSummary: () => ({ animate: false }),
		handleChange: (ctx, s) => {
			if (ctx.didChange(base)) {
				s.animate = s.animate || ctx.change;
			}
			return true;
		}
	}, (reader, s) => {
		/** @description update value */
		if (animationFrame !== undefined) {
			targetWindow.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}

		startVal = curVal;
		targetVal = base.read(reader);
		animationStartMs = Date.now() - (s.animate ? 0 : durationMs);

		update();
	}));

	function update() {
		const passedMs = Date.now() - animationStartMs;
		curVal = Math.floor(easeOutExpo(passedMs, startVal, targetVal - startVal, durationMs));

		if (passedMs < durationMs) {
			animationFrame = targetWindow.requestAnimationFrame(update);
		} else {
			curVal = targetVal;
		}

		result.set(curVal, undefined);
	}

	return result;
}

function easeOutExpo(t: number, b: number, c: number, d: number): number {
	return t === d ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
}

export function deepMerge<T extends {}>(source1: T, source2: Partial<T>): T {
	const result = {} as T;
	for (const key in source1) {
		result[key] = source1[key];
	}
	for (const key in source2) {
		const source2Value = source2[key];
		if (typeof result[key] === 'object' && source2Value && typeof source2Value === 'object') {
			result[key] = deepMerge<any>(result[key], source2Value);
		} else {
			result[key] = source2Value as any;
		}
	}
	return result;
}

export abstract class ViewZoneOverlayWidget extends Disposable {
	constructor(
		editor: ICodeEditor,
		viewZone: PlaceholderViewZone,
		htmlElement: HTMLElement,
	) {
		super();

		this._register(new ManagedOverlayWidget(editor, htmlElement));
		this._register(applyStyle(htmlElement, {
			height: viewZone.actualHeight,
			top: viewZone.actualTop,
		}));
	}
}

export interface IObservableViewZone extends IViewZone {
	// Causes the view zone to relayout.
	onChange?: IObservable<unknown>;

	// Tells a view zone its id.
	setZoneId?(zoneId: string): void;
}

export class PlaceholderViewZone implements IObservableViewZone {
	public readonly domNode = document.createElement('div');

	private readonly _actualTop = observableValue<number | undefined>(this, undefined);
	private readonly _actualHeight = observableValue<number | undefined>(this, undefined);

	public readonly actualTop: IObservable<number | undefined> = this._actualTop;
	public readonly actualHeight: IObservable<number | undefined> = this._actualHeight;

	public readonly showInHiddenAreas = true;

	public get afterLineNumber(): number { return this._afterLineNumber.get(); }

	public readonly onChange?: IObservable<unknown> = this._afterLineNumber;

	constructor(
		private readonly _afterLineNumber: IObservable<number>,
		public readonly heightInPx: number,
	) {
	}

	onDomNodeTop = (top: number) => {
		this._actualTop.set(top, undefined);
	};

	onComputedHeight = (height: number) => {
		this._actualHeight.set(height, undefined);
	};
}


export class ManagedOverlayWidget implements IDisposable {
	private static _counter = 0;
	private readonly _overlayWidgetId = `managedOverlayWidget-${ManagedOverlayWidget._counter++}`;

	private readonly _overlayWidget: IOverlayWidget = {
		getId: () => this._overlayWidgetId,
		getDomNode: () => this._domElement,
		getPosition: () => null
	};

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _domElement: HTMLElement,
	) {
		this._editor.addOverlayWidget(this._overlayWidget);
	}

	dispose(): void {
		this._editor.removeOverlayWidget(this._overlayWidget);
	}
}

export interface CSSStyle {
	height: number | string;
	width: number | string;
	top: number | string;
	visibility: 'visible' | 'hidden' | 'collapse';
	display: 'block' | 'inline' | 'inline-block' | 'flex' | 'none';
	paddingLeft: number | string;
	paddingRight: number | string;
}

export function applyStyle(domNode: HTMLElement, style: Partial<{ [TKey in keyof CSSStyle]: CSSStyle[TKey] | IObservable<CSSStyle[TKey] | undefined> | undefined }>) {
	return autorun(reader => {
		/** @description applyStyle */
		for (let [key, val] of Object.entries(style)) {
			if (val && typeof val === 'object' && 'read' in val) {
				val = val.read(reader) as any;
			}
			if (typeof val === 'number') {
				val = `${val}px`;
			}
			key = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
			domNode.style[key as any] = val as any;
		}
	});
}

export function readHotReloadableExport<T>(value: T, reader: IReader | undefined): T {
	observeHotReloadableExports([value], reader);
	return value;
}

export function observeHotReloadableExports(values: any[], reader: IReader | undefined): void {
	if (isHotReloadEnabled()) {
		const o = observableSignalFromEvent(
			'reload',
			event => registerHotReloadHandler(({ oldExports }) => {
				if (![...Object.values(oldExports)].some(v => values.includes(v))) {
					return undefined;
				}
				return (_newExports) => {
					event(undefined);
					return true;
				};
			})
		);
		o.read(reader);
	}
}

export function applyViewZones(editor: ICodeEditor, viewZones: IObservable<IObservableViewZone[]>, setIsUpdating?: (isUpdatingViewZones: boolean) => void, zoneIds?: Set<string>): IDisposable {
	const store = new DisposableStore();
	const lastViewZoneIds: string[] = [];

	store.add(autorunWithStore((reader, store) => {
		/** @description applyViewZones */
		const curViewZones = viewZones.read(reader);

		const viewZonIdsPerViewZone = new Map<IObservableViewZone, string>();
		const viewZoneIdPerOnChangeObservable = new Map<IObservable<unknown>, string>();

		// Add/remove view zones
		if (setIsUpdating) { setIsUpdating(true); }
		editor.changeViewZones(a => {
			for (const id of lastViewZoneIds) { a.removeZone(id); zoneIds?.delete(id); }
			lastViewZoneIds.length = 0;

			for (const z of curViewZones) {
				const id = a.addZone(z);
				if (z.setZoneId) {
					z.setZoneId(id);
				}
				lastViewZoneIds.push(id);
				zoneIds?.add(id);
				viewZonIdsPerViewZone.set(z, id);
			}
		});
		if (setIsUpdating) { setIsUpdating(false); }

		// Layout zone on change
		store.add(autorunHandleChanges({
			createEmptyChangeSummary() {
				return { zoneIds: [] as string[] };
			},
			handleChange(context, changeSummary) {
				const id = viewZoneIdPerOnChangeObservable.get(context.changedObservable);
				if (id !== undefined) { changeSummary.zoneIds.push(id); }
				return true;
			},
		}, (reader, changeSummary) => {
			/** @description layoutZone on change */
			for (const vz of curViewZones) {
				if (vz.onChange) {
					viewZoneIdPerOnChangeObservable.set(vz.onChange, viewZonIdsPerViewZone.get(vz)!);
					vz.onChange.read(reader);
				}
			}
			if (setIsUpdating) { setIsUpdating(true); }
			editor.changeViewZones(a => { for (const id of changeSummary.zoneIds) { a.layoutZone(id); } });
			if (setIsUpdating) { setIsUpdating(false); }
		}));
	}));

	store.add({
		dispose() {
			if (setIsUpdating) { setIsUpdating(true); }
			editor.changeViewZones(a => { for (const id of lastViewZoneIds) { a.removeZone(id); } });
			zoneIds?.clear();
			if (setIsUpdating) { setIsUpdating(false); }
		}
	});

	return store;
}

export class DisposableCancellationTokenSource extends CancellationTokenSource {
	public override dispose() {
		super.dispose(true);
	}
}

export function translatePosition(posInOriginal: Position, mappings: DetailedLineRangeMapping[]): Range {
	const mapping = findLast(mappings, m => m.original.startLineNumber <= posInOriginal.lineNumber);
	if (!mapping) {
		// No changes before the position
		return Range.fromPositions(posInOriginal);
	}

	if (mapping.original.endLineNumberExclusive <= posInOriginal.lineNumber) {
		const newLineNumber = posInOriginal.lineNumber - mapping.original.endLineNumberExclusive + mapping.modified.endLineNumberExclusive;
		return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
	}

	if (!mapping.innerChanges) {
		// Only for legacy algorithm
		return Range.fromPositions(new Position(mapping.modified.startLineNumber, 1));
	}

	const innerMapping = findLast(mapping.innerChanges, m => m.originalRange.getStartPosition().isBeforeOrEqual(posInOriginal));
	if (!innerMapping) {
		const newLineNumber = posInOriginal.lineNumber - mapping.original.startLineNumber + mapping.modified.startLineNumber;
		return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
	}

	if (innerMapping.originalRange.containsPosition(posInOriginal)) {
		return innerMapping.modifiedRange;
	} else {
		const l = lengthBetweenPositions(innerMapping.originalRange.getEndPosition(), posInOriginal);
		return Range.fromPositions(l.addToPosition(innerMapping.modifiedRange.getEndPosition()));
	}
}

function lengthBetweenPositions(position1: Position, position2: Position): TextLength {
	if (position1.lineNumber === position2.lineNumber) {
		return new TextLength(0, position2.column - position1.column);
	} else {
		return new TextLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
	}
}

export function bindContextKey<T extends ContextKeyValue>(key: RawContextKey<T>, service: IContextKeyService, computeValue: (reader: IReader) => T): IDisposable {
	const boundKey = key.bindTo(service);
	return autorunOpts({ debugName: () => `Set Context Key "${key.key}"` }, reader => {
		boundKey.set(computeValue(reader));
	});
}

export function filterWithPrevious<T>(arr: T[], filter: (cur: T, prev: T | undefined) => boolean): T[] {
	let prev: T | undefined;
	return arr.filter(cur => {
		const result = filter(cur, prev);
		prev = cur;
		return result;
	});
}
