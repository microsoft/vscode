/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button, IButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { ValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, autorun, autorunWithStore, constObservable, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { CompressedVirtualizedScrollView, ICompressedVirtualizedScrollViewContext } from '../../../../editor/browser/widget/multiDiffEditor/compressedVirtualizedScrollView.js';
import { computeCompressedVirtualizedScrollLayout, ICompressedVirtualizedScrollLayout } from '../../../../editor/browser/widget/multiDiffEditor/compressedVirtualizedScrollLayout.js';
import { IMultiDiffEditorModel } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IVirtualizedItemBindingContext, ManagedVirtualizedItem, VirtualizedItemBinding, VirtualizedItemManager, VirtualizedItemTemplate } from '../../../../editor/browser/widget/multiDiffEditor/virtualizedItemManager.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { TestDiffProviderFactoryService } from '../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { createMultiDiffEditorFixtureDocuments, createMultiDiffEditorFixtureServices, createMultiDiffEditorFixtureWidget } from './editor/multiDiffEditorFixtureUtils.js';
import './multiDiffEditorScroll.fixture.css';

type BindingPhase = 'unbound' | 'binding' | 'projecting' | 'active';
type GeometryChangeOrdering = 'atomic' | 'lines-first' | 'offset-first';
const fixtureHeaderHeight = 32;
const fixtureLineHeight = 20;

interface IFixtureTransition {
	readonly action: string;
	readonly scrollDelta: number;
	readonly renderedDelta: number;
	readonly hiddenDelta: number;
	readonly residual: number;
}

interface ISerializedFixtureItem {
	readonly label: string;
	readonly lineCount: number;
	readonly actualScrollOffset: number;
	readonly bindingPhase: BindingPhase;
	readonly topLineCount?: number;
	readonly bottomLineCount?: number;
	readonly mountLineCounts?: ISerializedMountLineCounts;
	readonly unmountLineCountReset?: ISerializedUnmountLineCountReset;
	readonly geometryOscillation?: ISerializedGeometryOscillation;
}

interface ISerializedMountLineCounts {
	readonly initial: number;
	readonly immediate: number;
	readonly after200ms: number;
}

interface ISerializedUnmountLineCountReset {
	readonly enabled: boolean;
	readonly lineCount: number;
}

interface ISerializedGeometryOscillation {
	readonly enabled: boolean;
	readonly topLineCountA: number;
	readonly topLineCountB: number;
	readonly bottomLineCountA: number;
	readonly bottomLineCountB: number;
	readonly ordering: GeometryChangeOrdering;
}

interface ISerializedFixtureState {
	readonly viewportHeight: number;
	readonly scrollTop: number;
	readonly itemGap: number;
	readonly items: readonly ISerializedFixtureItem[];
}

function createDefaultGeometryOscillation(): ISerializedGeometryOscillation {
	return {
		enabled: false,
		topLineCountA: 0,
		topLineCountB: 5,
		bottomLineCountA: 0,
		bottomLineCountB: 5,
		ordering: 'atomic',
	};
}

function createDefaultMountLineCounts(lineCount: number): ISerializedMountLineCounts {
	return {
		initial: lineCount,
		immediate: lineCount,
		after200ms: lineCount,
	};
}

function createDefaultUnmountLineCountReset(lineCount: number): ISerializedUnmountLineCountReset {
	return {
		enabled: false,
		lineCount,
	};
}

class FixtureItem extends Disposable {
	readonly lineCount;
	readonly topLineCount;
	readonly bottomLineCount;
	readonly totalLineCount;
	readonly fullHeight;
	readonly actualScrollOffset;
	readonly bindingPhase;
	readonly templateId = observableValue<number | undefined>(this, undefined);
	readonly geometryOscillationEnabled;
	readonly geometryOscillationTopLineCountA;
	readonly geometryOscillationTopLineCountB;
	readonly geometryOscillationBottomLineCountA;
	readonly geometryOscillationBottomLineCountB;
	readonly geometryChangeOrdering;
	readonly mountInitialLineCount;
	readonly mountImmediateLineCount;
	readonly mountDelayedLineCount;
	readonly resetLineCountOnUnmount;
	readonly unmountedLineCount;
	private readonly _pendingGeometryUpdate = this._register(new MutableDisposable());

	constructor(
		public readonly label: string,
		lineCount: number,
		private readonly _getScrollContext: () => ICompressedVirtualizedScrollViewContext,
		private readonly _onWillChangeLineCount: (action: string) => void,
		private readonly _onReplayMount: (item: FixtureItem) => void,
		actualScrollOffset = 0,
		bindingPhase: BindingPhase = 'active',
		geometryOscillation = createDefaultGeometryOscillation(),
		topLineCount = 0,
		bottomLineCount = 0,
		mountLineCounts = createDefaultMountLineCounts(lineCount),
		unmountLineCountReset = createDefaultUnmountLineCountReset(lineCount),
	) {
		super();
		this.lineCount = observableValue(this, lineCount);
		this.topLineCount = observableValue(this, topLineCount);
		this.bottomLineCount = observableValue(this, bottomLineCount);
		this.totalLineCount = derived(this, reader => this.topLineCount.read(reader) + this.lineCount.read(reader) + this.bottomLineCount.read(reader));
		this.fullHeight = derived(this, reader => lineCountToHeight(this.totalLineCount.read(reader)));
		this.actualScrollOffset = observableValue(this, actualScrollOffset);
		this.bindingPhase = observableValue<BindingPhase>(this, bindingPhase);
		this.geometryOscillationEnabled = observableValue(this, geometryOscillation.enabled);
		this.geometryOscillationTopLineCountA = observableValue(this, geometryOscillation.topLineCountA);
		this.geometryOscillationTopLineCountB = observableValue(this, geometryOscillation.topLineCountB);
		this.geometryOscillationBottomLineCountA = observableValue(this, geometryOscillation.bottomLineCountA);
		this.geometryOscillationBottomLineCountB = observableValue(this, geometryOscillation.bottomLineCountB);
		this.geometryChangeOrdering = observableValue<GeometryChangeOrdering>(this, geometryOscillation.ordering);
		this.mountInitialLineCount = observableValue(this, mountLineCounts.initial);
		this.mountImmediateLineCount = observableValue(this, mountLineCounts.immediate);
		this.mountDelayedLineCount = observableValue(this, mountLineCounts.after200ms);
		this.resetLineCountOnUnmount = observableValue(this, unmountLineCountReset.enabled);
		this.unmountedLineCount = observableValue(this, unmountLineCountReset.lineCount);
	}

	setActualScrollOffset(value: number, tx: ITransaction): void {
		this.actualScrollOffset.set(value, tx);
	}

	setLineCount(value: number, tx: ITransaction): void {
		this.lineCount.set(normalizeLineCount(value), tx);
	}

	replayMount(): void {
		this._onReplayMount(this);
	}

	scheduleGeometryUpdate(update: () => void): void {
		this._pendingGeometryUpdate.value = dom.scheduleAtNextAnimationFrame(this.getWindow(), update);
	}

	getWindow(): Window {
		return dom.getWindow(this._getScrollContext().contentDomNode);
	}

	setMountLineCount(lineCount: number, action: string, tx?: ITransaction): void {
		this._onWillChangeLineCount(action);
		if (tx) {
			this.setLineCount(lineCount, tx);
		} else {
			transaction(tx => this.setLineCount(lineCount, tx));
		}
	}

	resetLineCountAfterUnmount(tx: ITransaction): void {
		if (this.resetLineCountOnUnmount.get()) {
			this.setMountLineCount(this.unmountedLineCount.get(), `Item ${this.label} resets line count after unmount`, tx);
		}
	}
}

class FixtureBinding extends VirtualizedItemBinding<FixtureItem> {
	readonly size = this.item.fullHeight;
	readonly maxScroll = constObservable({ maxScroll: 0 });
	readonly shouldKeepAlive = constObservable(false);
	readonly templateId;

	constructor(
		item: FixtureItem,
		private readonly _template: FixtureTemplate,
	) {
		super(item);
		this.templateId = _template.id;
	}

	scheduleDelayedMeasurement(): void {
		const targetWindow = this.item.getWindow();
		const handle = targetWindow.setTimeout(() => {
			this.item.setMountLineCount(this.item.mountDelayedLineCount.get(), `Item ${this.item.label} reports 200ms mount line count`);
		}, 200);
		this._register(toDisposable(() => targetWindow.clearTimeout(handle)));
	}

	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void {
		if (this.item.bindingPhase.get() === 'active') {
			transaction(tx => this.item.setActualScrollOffset(scrollOffset, tx));
		}
		this._template.renderItem(this.item, renderedRange, scrollOffset, width, renderedViewport);
	}

	hide(): void {
		this._template.hide();
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._template.unbind(this.item);
		super.dispose();
	}
}

class FixtureTemplate extends VirtualizedItemTemplate<FixtureItem, FixtureBinding> {
	private readonly _root;
	private readonly _header;
	private readonly _title;
	private readonly _selectionProof;
	private readonly _state;
	private readonly _editorContent;
	private _lineCount = -1;
	private _topLineCount = -1;
	private _bottomLineCount = -1;
	private _previousItem: FixtureItem | undefined;

	constructor(
		readonly id: number,
		context: ICompressedVirtualizedScrollViewContext,
		private readonly _onDidRebind: (templateId: number, previousItem: FixtureItem | undefined, item: FixtureItem) => void,
	) {
		super();
		this._root = dom.append(context.contentDomNode, dom.$('.multi-diff-scroll-fixture-row'));
		this._header = dom.append(this._root, dom.$('.multi-diff-scroll-fixture-row-header'));
		this._title = dom.append(this._header, dom.$('span.title'));
		this._selectionProof = dom.append(this._header, dom.$('span.selection-proof'));
		this._selectionProof.textContent = `Persistent template #${id} text`;
		this._state = dom.append(this._header, dom.$('span.state'));
		const editorViewport = dom.append(this._root, dom.$('.multi-diff-scroll-fixture-editor-viewport'));
		this._editorContent = dom.append(editorViewport, dom.$('.multi-diff-scroll-fixture-editor-content'));
	}

	protected createBinding(item: FixtureItem, _context: IVirtualizedItemBindingContext): FixtureBinding {
		this._lineCount = -1;
		this._topLineCount = -1;
		this._bottomLineCount = -1;
		this._onDidRebind(this.id, this._previousItem, item);
		item.setMountLineCount(item.mountInitialLineCount.get(), `Item ${item.label} mounts with initial line count`);
		const binding = new FixtureBinding(item, this);
		item.setMountLineCount(item.mountImmediateLineCount.get(), `Item ${item.label} reports synchronous mount line count`);
		binding.scheduleDelayedMeasurement();
		return binding;
	}

	renderItem(item: FixtureItem, renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void {
		const fullHeight = item.fullHeight.get();
		const actualOffset = item.actualScrollOffset.get();
		const lineCount = item.lineCount.get();
		const topLineCount = item.topLineCount.get();
		const bottomLineCount = item.bottomLineCount.get();
		if (lineCount !== this._lineCount || topLineCount !== this._topLineCount || bottomLineCount !== this._bottomLineCount) {
			this._lineCount = lineCount;
			this._topLineCount = topLineCount;
			this._bottomLineCount = bottomLineCount;
			renderFakeEditorLines(this._editorContent, item.label, lineCount, topLineCount, bottomLineCount);
		}

		this._root.style.visibility = 'visible';
		this._root.style.top = `${renderedRange.start}px`;
		this._root.style.height = `${renderedRange.length}px`;
		this._root.style.width = `${width - 16}px`;
		this._root.classList.toggle('desynchronized', actualOffset !== scrollOffset);
		this._title.textContent = `Item ${item.label} · template #${this.id}`;
		this._state.textContent = `${item.bindingPhase.get()} · ${formatNumber(actualOffset)} / ${formatNumber(Math.max(0, fullHeight - renderedRange.length))}`;
		const maxHeaderOffset = renderedRange.length - fixtureHeaderHeight;
		const headerOffset = Math.max(0, Math.min(renderedViewport.start - renderedRange.start, maxHeaderOffset));
		this._header.style.transform = `translateY(${headerOffset}px)`;
		this._header.classList.toggle('shadow', headerOffset > 0 || scrollOffset > 0);
		this._header.classList.toggle('collapsed', headerOffset === maxHeaderOffset);
		this._editorContent.style.height = `${Math.max(0, fullHeight - fixtureHeaderHeight)}px`;
		this._editorContent.style.transform = `translateY(${-actualOffset}px)`;
	}

	hide(): void {
		this._root.style.top = '-100000px';
		this._root.style.visibility = 'hidden';
	}

	unbind(item: FixtureItem): void {
		this.hide();
		this._previousItem = item;
	}

	override dispose(): void {
		this._root.remove();
		super.dispose();
	}
}

class MultiDiffScrollFixtureModel extends Disposable {
	readonly viewportHeight = observableValue(this, 480);
	readonly scrollTop = observableValue(this, 430);
	readonly itemGap = observableValue(this, 12);
	readonly scenario = observableValue<'mixed' | 'tall' | 'pooling' | 'measurement'>(this, 'mixed');
	readonly items = observableValue<readonly FixtureItem[]>(this, []);
	readonly transitions = observableValue<readonly IFixtureTransition[]>(this, []);
	readonly templateBindings = observableValue<readonly string[]>(this, []);
	readonly layout: IObservable<ICompressedVirtualizedScrollLayout>;
	readonly serializedState: IObservable<string>;
	private readonly _scrollView = observableValue<CompressedVirtualizedScrollView<FixtureVirtualizedItem> | undefined>(this, undefined);
	private readonly _itemStore = this._register(new DisposableStore());
	private readonly _itemManager = this._register(new MutableDisposable<VirtualizedItemManager<FixtureItem, FixtureBinding, FixtureTemplate>>());
	private _scrollContext: ICompressedVirtualizedScrollViewContext | undefined;
	private _nextTemplateId = 1;
	private _lastLayout: ICompressedVirtualizedScrollLayout | undefined;
	private _transitionAction = 'Initialize fixture';

	constructor() {
		super();
		transaction(tx => this._replaceItems([
			createSerializedFixtureItem('A', 12),
			createSerializedFixtureItem('B', 54),
			createSerializedFixtureItem('C', 18),
			createSerializedFixtureItem('D', 44),
		], tx));
		this.layout = derived(this, reader => this._scrollView.read(reader)?.layout.read(reader) ?? computeCompressedVirtualizedScrollLayout({
			scrollTop: this.scrollTop.read(reader),
			viewportHeight: this.viewportHeight.read(reader),
			itemGap: this.itemGap.read(reader),
			itemHeights: this.items.read(reader).map(item => item.fullHeight.read(reader)),
		}));
		this.serializedState = derived(this, reader => JSON.stringify({
			viewportHeight: this.viewportHeight.read(reader),
			scrollTop: this.scrollTop.read(reader),
			itemGap: this.itemGap.read(reader),
			items: this.items.read(reader).map(item => ({
				label: item.label,
				lineCount: item.lineCount.read(reader),
				actualScrollOffset: item.actualScrollOffset.read(reader),
				bindingPhase: item.bindingPhase.read(reader),
				topLineCount: item.topLineCount.read(reader),
				bottomLineCount: item.bottomLineCount.read(reader),
				mountLineCounts: {
					initial: item.mountInitialLineCount.read(reader),
					immediate: item.mountImmediateLineCount.read(reader),
					after200ms: item.mountDelayedLineCount.read(reader),
				},
				unmountLineCountReset: {
					enabled: item.resetLineCountOnUnmount.read(reader),
					lineCount: item.unmountedLineCount.read(reader),
				},
				geometryOscillation: {
					enabled: item.geometryOscillationEnabled.read(reader),
					topLineCountA: item.geometryOscillationTopLineCountA.read(reader),
					topLineCountB: item.geometryOscillationTopLineCountB.read(reader),
					bottomLineCountA: item.geometryOscillationBottomLineCountA.read(reader),
					bottomLineCountB: item.geometryOscillationBottomLineCountB.read(reader),
					ordering: item.geometryChangeOrdering.read(reader),
				},
			})),
		} satisfies ISerializedFixtureState, undefined, '\t'));
		this._register(autorunWithStore((reader, store) => {
			const items = this.items.read(reader);
			for (let index = 0; index < items.length; index++) {
				if (!items[index].geometryOscillationEnabled.read(reader)) {
					continue;
				}
				const targetWindow = items[index].getWindow();
				const handle = targetWindow.setInterval(() => this.toggleItemGeometry(index), 1000);
				store.add(toDisposable(() => targetWindow.clearInterval(handle)));
			}
		}));
	}

	createVirtualizedItems(context: ICompressedVirtualizedScrollViewContext): IObservable<readonly FixtureVirtualizedItem[]> {
		this._scrollContext = context;
		const manager = new VirtualizedItemManager<FixtureItem, FixtureBinding, FixtureTemplate>(this.items, context, {
			getId: item => item,
			getTemplateId: () => 'fakeEditor',
			getUnboundSize: item => item.fullHeight,
			createTemplate: () => new FixtureTemplate(this._nextTemplateId++, context, (id, previousItem, item) => {
				this._recordTemplateBinding(previousItem
					? `Template #${id} rebound from Item ${previousItem.label} to Item ${item.label}`
					: `Template #${id} created for Item ${item.label}`);
			}),
			onDidBind: (binding, tx) => binding.item.templateId.set(binding.templateId, tx),
			onWillUnbind: (binding, tx) => {
				binding.item.templateId.set(undefined, tx);
				binding.item.resetLineCountAfterUnmount(tx);
			},
		});
		this._itemManager.value = manager;
		return manager.virtualizedItems;
	}

	attachScrollView(scrollView: CompressedVirtualizedScrollView<FixtureVirtualizedItem>): void {
		scrollView.setScrollPosition({ scrollTop: this.scrollTop.get() });
		this._scrollView.set(scrollView, undefined);
		this._register(autorun(reader => {
			const layout = scrollView.layout.read(reader);
			this.scrollTop.set(layout.scrollTop, undefined);
			if (this._lastLayout) {
				const transition: IFixtureTransition = {
					action: this._transitionAction,
					scrollDelta: layout.scrollTop - this._lastLayout.scrollTop,
					renderedDelta: layout.renderedViewport.start - this._lastLayout.renderedViewport.start,
					hiddenDelta: layout.hiddenContentHeightAboveViewport - this._lastLayout.hiddenContentHeightAboveViewport,
					residual: layout.scrollTop - this._lastLayout.scrollTop
						- (layout.renderedViewport.start - this._lastLayout.renderedViewport.start)
						- (layout.hiddenContentHeightAboveViewport - this._lastLayout.hiddenContentHeightAboveViewport),
				};
				this.transitions.set([...this.transitions.read(undefined).slice(-7), transition], undefined);
				this._transitionAction = 'Smooth scroll frame';
			}
			this._lastLayout = layout;
		}));
	}

	setScrollTop(value: number, action = 'Set multi-diff scroll position', smooth = true): void {
		this._transitionAction = action;
		this._scrollView.get()?.setScrollPosition({ scrollTop: value }, smooth);
	}

	setViewportHeight(value: number): void {
		this._commit('Resize viewport', tx => this.viewportHeight.set(Math.max(1, value), tx));
	}

	setItemGap(value: number): void {
		this._commit('Change item gap', tx => this.itemGap.set(Math.max(0, value), tx));
	}

	setItemLineCount(index: number, value: number): void {
		const item = this.items.get()[index];
		this._commit(`Change item ${item.label} line count`, tx => item.setLineCount(value, tx));
	}

	setMountLineCount(index: number, phase: keyof ISerializedMountLineCounts, value: number): void {
		const item = this.items.get()[index];
		const lineCount = normalizeLineCount(value);
		this._commit(`Set item ${item.label} ${phase} mount line count`, tx => {
			switch (phase) {
				case 'initial':
					item.mountInitialLineCount.set(lineCount, tx);
					break;
				case 'immediate':
					item.mountImmediateLineCount.set(lineCount, tx);
					break;
				case 'after200ms':
					item.mountDelayedLineCount.set(lineCount, tx);
					break;
			}
		});
	}

	setUnmountLineCountResetEnabled(index: number, enabled: boolean): void {
		const item = this.items.get()[index];
		this._commit(`${enabled ? 'Enable' : 'Disable'} item ${item.label} unmount reset`, tx => item.resetLineCountOnUnmount.set(enabled, tx));
	}

	setUnmountedLineCount(index: number, value: number): void {
		const item = this.items.get()[index];
		this._commit(`Set item ${item.label} unmounted line count`, tx => item.unmountedLineCount.set(normalizeLineCount(value), tx));
	}

	replayItemMount(index: number): void {
		this.items.get()[index]?.replayMount();
	}

	private _rebind(item: FixtureItem): void {
		this._itemManager.value?.virtualizedItems.get().find(candidate => candidate.item === item)?.rebind();
	}

	setBindingPhase(index: number, phase: BindingPhase): void {
		const item = this.items.get()[index];
		this._commit(`Set item ${item.label} phase to ${phase}`, tx => {
			item.bindingPhase.set(phase, tx);
			if (phase === 'active') {
				item.setActualScrollOffset(item.actualScrollOffset.get(), tx);
			}
		});
	}

	setEditorScrollOffset(index: number, value: number): void {
		const item = this.items.get()[index];
		const itemLayout = this.layout.get().items[index];
		const actualScrollOffset = Math.max(0, Math.min(value, itemLayout.maxScrollOffset));
		this._transitionAction = `Editor ${item.label} reports scroll position`;
		transaction(tx => item.setActualScrollOffset(actualScrollOffset, tx));
	}

	setGeometryOscillationEnabled(index: number, enabled: boolean): void {
		const item = this.items.get()[index];
		this._commit(`${enabled ? 'Start' : 'Stop'} item ${item.label} geometry oscillation`, tx => item.geometryOscillationEnabled.set(enabled, tx));
	}

	setGeometryOscillationLineCount(index: number, edge: 'top' | 'bottom', target: 'A' | 'B', value: number): void {
		const item = this.items.get()[index];
		const lineCount = normalizeLineCount(value);
		this._commit(`Set item ${item.label} oscillation ${edge} line count ${target}`, tx => {
			const observable = edge === 'top'
				? target === 'A' ? item.geometryOscillationTopLineCountA : item.geometryOscillationTopLineCountB
				: target === 'A' ? item.geometryOscillationBottomLineCountA : item.geometryOscillationBottomLineCountB;
			observable.set(lineCount, tx);
		});
	}

	setGeometryChangeOrdering(index: number, ordering: GeometryChangeOrdering): void {
		const item = this.items.get()[index];
		this._commit(`Set item ${item.label} geometry change ordering`, tx => item.geometryChangeOrdering.set(ordering, tx));
	}

	toggleItemGeometry(index: number): void {
		const item = this.items.get()[index];
		if (!item) {
			return;
		}
		const currentTopLineCount = item.topLineCount.get();
		const currentBottomLineCount = item.bottomLineCount.get();
		const topLineCountA = item.geometryOscillationTopLineCountA.get();
		const topLineCountB = item.geometryOscillationTopLineCountB.get();
		const bottomLineCountA = item.geometryOscillationBottomLineCountA.get();
		const bottomLineCountB = item.geometryOscillationBottomLineCountB.get();
		const distanceToA = Math.abs(currentTopLineCount - topLineCountA) + Math.abs(currentBottomLineCount - bottomLineCountA);
		const distanceToB = Math.abs(currentTopLineCount - topLineCountB) + Math.abs(currentBottomLineCount - bottomLineCountB);
		const targetTopLineCount = distanceToA <= distanceToB ? topLineCountB : topLineCountA;
		const targetBottomLineCount = distanceToA <= distanceToB ? bottomLineCountB : bottomLineCountA;
		const topLineCountDelta = targetTopLineCount - currentTopLineCount;
		const targetHeight = lineCountToHeight(item.lineCount.get() + targetTopLineCount + targetBottomLineCount);
		const currentOffset = item.actualScrollOffset.get();
		const targetMaxOffset = Math.max(0, targetHeight - Math.min(targetHeight, this.viewportHeight.get()));
		const targetOffset = Math.max(0, Math.min(
			currentOffset > 0 ? currentOffset + topLineCountDelta * fixtureLineHeight : currentOffset,
			targetMaxOffset,
		));
		const setLines = () => this._commit(`Item ${item.label} changes top and bottom lines`, tx => {
			item.topLineCount.set(targetTopLineCount, tx);
			item.bottomLineCount.set(targetBottomLineCount, tx);
		});
		const setOffset = () => this._commit(`Item ${item.label} viewport moves to ${targetOffset}`, tx => item.setActualScrollOffset(targetOffset, tx));

		switch (item.geometryChangeOrdering.get()) {
			case 'atomic':
				this._commit(`Item ${item.label} geometry changes atomically`, tx => {
					item.topLineCount.set(targetTopLineCount, tx);
					item.bottomLineCount.set(targetBottomLineCount, tx);
					item.setActualScrollOffset(targetOffset, tx);
				});
				break;
			case 'lines-first':
				setLines();
				item.scheduleGeometryUpdate(setOffset);
				break;
			case 'offset-first':
				setOffset();
				item.scheduleGeometryUpdate(setLines);
				break;
		}
	}

	applyScenario(scenario: 'mixed' | 'tall' | 'pooling' | 'measurement'): void {
		const scenarios = {
			mixed: { viewportHeight: 480, scrollTop: 430, items: [createSerializedFixtureItem('A', 12), createSerializedFixtureItem('B', 54), createSerializedFixtureItem('C', 18), createSerializedFixtureItem('D', 44)] },
			tall: { viewportHeight: 480, scrollTop: 720, items: [createSerializedFixtureItem('A', 5), createSerializedFixtureItem('B', 89), createSerializedFixtureItem('C', 8), createSerializedFixtureItem('D', 12)] },
			pooling: {
				viewportHeight: 420,
				scrollTop: 0,
				items: Array.from({ length: 20 }, (_, index) => createSerializedFixtureItem(
					String.fromCharCode('A'.charCodeAt(0) + index),
					[8, 37, 11, 48, 15][index % 5],
				)),
			},
			measurement: {
				viewportHeight: 500,
				scrollTop: 200,
				items: [
					createSerializedFixtureItem('Estimate A', 12, 'active', { initial: 12, immediate: 25, after200ms: 44 }),
					createSerializedFixtureItem('Estimate B', 20, 'active', { initial: 20, immediate: 37, after200ms: 54 }),
					createSerializedFixtureItem('Measured C', 59),
					createSerializedFixtureItem('Measured D', 16),
				],
			},
		};
		const selected = scenarios[scenario];
		this._commit(`Apply ${scenario} scenario`, tx => {
			this.scenario.set(scenario, tx);
			this.viewportHeight.set(selected.viewportHeight, tx);
			this.scrollTop.set(selected.scrollTop, tx);
			this.templateBindings.set([], tx);
			this._replaceItems(selected.items, tx);
		});
		this._scrollView.get()?.setScrollPosition({ scrollTop: selected.scrollTop });
	}

	scrollOneViewport(): void {
		this.setScrollTop(this.scrollTop.get() + this.viewportHeight.get(), 'Scroll one viewport');
	}

	applyBatchedGeometryChange(): void {
		this._commit('Apply batched geometry change', tx => {
			const items = this.items.get();
			if (items[0]) {
				items[0].setLineCount(items[0].lineCount.get() + 12, tx);
			}
			if (items[2]) {
				items[2].setLineCount(items[2].lineCount.get() - 5, tx);
			}
			this.viewportHeight.set(this.viewportHeight.get() + 40, tx);
		});
	}

	applySerializedState(value: string): void {
		const state = parseSerializedFixtureState(value);
		this._commit('Import JSON state', tx => {
			this.viewportHeight.set(state.viewportHeight, tx);
			this.itemGap.set(state.itemGap, tx);
			this._replaceItems(state.items, tx);
		});
		this._scrollView.get()?.setScrollPosition({ scrollTop: state.scrollTop });
	}

	private _commit(action: string, update: (tx: ITransaction) => void): void {
		this._transitionAction = action;
		transaction(update);
	}

	private _recordTemplateBinding(message: string): void {
		this.templateBindings.set([...this.templateBindings.get().slice(-7), message], undefined);
	}

	private _replaceItems(items: readonly ISerializedFixtureItem[], tx: ITransaction): void {
		this._itemStore.clear();
		this.items.set(items.map(item => this._itemStore.add(new FixtureItem(
			item.label,
			item.lineCount,
			() => {
				if (!this._scrollContext) {
					throw new Error('Scroll context is not attached.');
				}
				return this._scrollContext;
			},
			action => this._transitionAction = action,
			item => this._rebind(item),
			item.actualScrollOffset,
			item.bindingPhase,
			item.geometryOscillation ?? createDefaultGeometryOscillation(),
			item.topLineCount,
			item.bottomLineCount,
			item.mountLineCounts ?? createDefaultMountLineCounts(item.lineCount),
			item.unmountLineCountReset ?? createDefaultUnmountLineCountReset(item.lineCount),
		))), tx);
	}

	override dispose(): void {
		this._scrollView.get()?.dispose();
		this._scrollView.set(undefined, undefined);
		super.dispose();
	}
}

type FixtureVirtualizedItem = ManagedVirtualizedItem<FixtureItem, FixtureBinding, FixtureTemplate>;

function createSerializedFixtureItem(
	label: string,
	lineCount: number,
	bindingPhase: BindingPhase = 'active',
	mountLineCounts = createDefaultMountLineCounts(lineCount),
): ISerializedFixtureItem {
	return {
		label,
		lineCount,
		actualScrollOffset: 0,
		bindingPhase,
		mountLineCounts,
	};
}

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function parseSerializedFixtureState(text: string): ISerializedFixtureState {
	const value: JsonValue = JSON.parse(text);
	if (!isJsonObject(value)) {
		throw new Error('Fixture state must be a JSON object.');
	}
	const items = value.items;
	if (!Array.isArray(items)) {
		throw new Error('Fixture state must contain an items array.');
	}
	if (items.length === 0) {
		throw new Error('Fixture state must contain at least one item.');
	}
	return {
		viewportHeight: readNonNegativeNumber(value, 'viewportHeight', false),
		scrollTop: readNonNegativeNumber(value, 'scrollTop', true),
		itemGap: readNonNegativeNumber(value, 'itemGap', true),
		items: items.map((item, index) => parseSerializedFixtureItem(item, index)),
	};
}

function parseSerializedFixtureItem(value: JsonValue, index: number): ISerializedFixtureItem {
	if (!isJsonObject(value)) {
		throw new Error(`items[${index}] must be a JSON object.`);
	}
	const bindingPhase = value.bindingPhase;
	if (!isBindingPhase(bindingPhase)) {
		throw new Error(`items[${index}].bindingPhase must be unbound, binding, projecting, or active.`);
	}
	const path = `items[${index}]`;
	const lineCount = value.lineCount === undefined
		? heightToLineCount(readNonNegativeNumber(value, 'fullHeight', true, path))
		: readNonNegativeInteger(value, 'lineCount', path);
	const geometryOscillationValue = value.geometryOscillation;
	const geometryOscillation = geometryOscillationValue === undefined
		? createDefaultGeometryOscillation()
		: parseSerializedGeometryOscillation(geometryOscillationValue, index, lineCount);
	const topLineCountValue = value.topLineCount;
	const bottomLineCountValue = value.bottomLineCount;
	const legacyContentTopInset = value.contentTopInset;
	const mountLineCountsValue = value.mountLineCounts;
	const legacyMountHeightsValue = value.mountHeights;
	const unmountLineCountResetValue = value.unmountLineCountReset;
	return {
		label: readString(value, 'label', path),
		lineCount,
		actualScrollOffset: readNonNegativeNumber(value, 'actualScrollOffset', true, path),
		bindingPhase,
		topLineCount: topLineCountValue === undefined
			? legacyContentTopInset === undefined ? 0 : Math.round(readNonNegativeNumber(value, 'contentTopInset', true, path) / fixtureLineHeight)
			: readNonNegativeInteger(value, 'topLineCount', path),
		bottomLineCount: bottomLineCountValue === undefined ? 0 : readNonNegativeInteger(value, 'bottomLineCount', path),
		mountLineCounts: mountLineCountsValue !== undefined
			? parseSerializedMountLineCounts(mountLineCountsValue, index, false)
			: legacyMountHeightsValue !== undefined
				? parseSerializedMountLineCounts(legacyMountHeightsValue, index, true)
				: createDefaultMountLineCounts(lineCount),
		unmountLineCountReset: unmountLineCountResetValue === undefined
			? createDefaultUnmountLineCountReset(lineCount)
			: parseSerializedUnmountLineCountReset(unmountLineCountResetValue, index),
		geometryOscillation,
	};
}

function parseSerializedMountLineCounts(value: JsonValue, index: number, legacyHeights: boolean): ISerializedMountLineCounts {
	const path = `items[${index}].${legacyHeights ? 'mountHeights' : 'mountLineCounts'}`;
	if (!isJsonObject(value)) {
		throw new Error(`${path} must be a JSON object.`);
	}
	return {
		initial: legacyHeights ? heightToLineCount(readNonNegativeNumber(value, 'initial', true, path)) : readNonNegativeInteger(value, 'initial', path),
		immediate: legacyHeights ? heightToLineCount(readNonNegativeNumber(value, 'immediate', true, path)) : readNonNegativeInteger(value, 'immediate', path),
		after200ms: legacyHeights ? heightToLineCount(readNonNegativeNumber(value, 'after200ms', true, path)) : readNonNegativeInteger(value, 'after200ms', path),
	};
}

function parseSerializedUnmountLineCountReset(value: JsonValue, index: number): ISerializedUnmountLineCountReset {
	const path = `items[${index}].unmountLineCountReset`;
	if (!isJsonObject(value)) {
		throw new Error(`${path} must be a JSON object.`);
	}
	return {
		enabled: readBoolean(value, 'enabled', path),
		lineCount: readNonNegativeInteger(value, 'lineCount', path),
	};
}

function parseSerializedGeometryOscillation(value: JsonValue, index: number, lineCount: number): ISerializedGeometryOscillation {
	const path = `items[${index}].geometryOscillation`;
	if (!isJsonObject(value)) {
		throw new Error(`${path} must be a JSON object.`);
	}
	const ordering = value.ordering;
	if (!isGeometryChangeOrdering(ordering)) {
		throw new Error(`${path}.ordering must be atomic, lines-first, or offset-first.`);
	}
	const normalizedOrdering = ordering === 'height-first' ? 'lines-first' : ordering;
	if (value.topLineCountA !== undefined) {
		return {
			enabled: readBoolean(value, 'enabled', path),
			topLineCountA: readNonNegativeInteger(value, 'topLineCountA', path),
			topLineCountB: readNonNegativeInteger(value, 'topLineCountB', path),
			bottomLineCountA: readNonNegativeInteger(value, 'bottomLineCountA', path),
			bottomLineCountB: readNonNegativeInteger(value, 'bottomLineCountB', path),
			ordering: normalizedOrdering,
		};
	}
	const location = value.location;
	if (location !== 'above' && location !== 'below') {
		throw new Error(`${path}.location must be above or below when importing legacy height geometry.`);
	}
	const totalLineCountA = heightToLineCount(readNonNegativeNumber(value, 'heightA', false, path));
	const totalLineCountB = heightToLineCount(readNonNegativeNumber(value, 'heightB', false, path));
	const addedLineCountA = Math.max(0, totalLineCountA - lineCount);
	const addedLineCountB = Math.max(0, totalLineCountB - lineCount);
	return {
		enabled: readBoolean(value, 'enabled', path),
		topLineCountA: location === 'above' ? addedLineCountA : 0,
		topLineCountB: location === 'above' ? addedLineCountB : 0,
		bottomLineCountA: location === 'below' ? addedLineCountA : 0,
		bottomLineCountB: location === 'below' ? addedLineCountB : 0,
		ordering: normalizedOrdering,
	};
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBindingPhase(value: JsonValue | undefined): value is BindingPhase {
	return value === 'unbound' || value === 'binding' || value === 'projecting' || value === 'active';
}

function isGeometryChangeOrdering(value: JsonValue | undefined): value is GeometryChangeOrdering | 'height-first' {
	return value === 'atomic' || value === 'lines-first' || value === 'height-first' || value === 'offset-first';
}

function readNonNegativeNumber(value: { readonly [key: string]: JsonValue }, key: string, allowZero: boolean, path = 'fixture'): number {
	const result = value[key];
	const minimum = allowZero ? 0 : Number.MIN_VALUE;
	if (typeof result !== 'number' || !Number.isFinite(result) || result < minimum) {
		throw new Error(`${path}.${key} must be a finite number ${allowZero ? 'greater than or equal to zero' : 'greater than zero'}.`);
	}
	return result;
}

function readNonNegativeInteger(value: { readonly [key: string]: JsonValue }, key: string, path: string): number {
	const result = value[key];
	if (typeof result !== 'number' || !Number.isInteger(result) || result < 0) {
		throw new Error(`${path}.${key} must be a non-negative integer.`);
	}
	return result;
}

function normalizeLineCount(value: number): number {
	return Math.max(0, Math.round(value));
}

function lineCountToHeight(lineCount: number): number {
	return fixtureHeaderHeight + normalizeLineCount(lineCount) * fixtureLineHeight;
}

function heightToLineCount(height: number): number {
	return normalizeLineCount(Math.max(0, height - fixtureHeaderHeight) / fixtureLineHeight);
}

function readString(value: { readonly [key: string]: JsonValue }, key: string, path: string): string {
	const result = value[key];
	if (typeof result !== 'string' || result.length === 0) {
		throw new Error(`${path}.${key} must be a non-empty string.`);
	}
	return result;
}

function readBoolean(value: { readonly [key: string]: JsonValue }, key: string, path: string): boolean {
	const result = value[key];
	if (typeof result !== 'boolean') {
		throw new Error(`${path}.${key} must be a boolean.`);
	}
	return result;
}

const buttonStyles: IButtonStyles = {
	buttonBackground: 'var(--vscode-button-background)',
	buttonHoverBackground: 'var(--vscode-button-hoverBackground)',
	buttonSeparator: 'var(--vscode-button-separator)',
	buttonForeground: 'var(--vscode-button-foreground)',
	buttonSecondaryBackground: 'var(--vscode-button-secondaryBackground)',
	buttonSecondaryHoverBackground: 'var(--vscode-button-secondaryHoverBackground)',
	buttonSecondaryForeground: 'var(--vscode-button-secondaryForeground)',
	buttonBorder: 'var(--vscode-button-border)',
	buttonSecondaryBorder: 'var(--vscode-button-secondaryBorder)',
};

export default defineThemedFixtureGroup({ path: 'editor/multiDiff/' }, {
	ScrollModel: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'A controllable multi-diff scroll model with form controls, a virtualized fake-editor viewport, coordinate diagrams, and an invariant inspector.',
			'The conservation equation is shown as multi-diff scroll position equals rendered scroll position plus hidden content height.',
		],
		render: renderMultiDiffScrollFixture,
	}),
	TemplatePool: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'A 20-item mixed-line-count scenario rendered through the production VirtualizedItemManager with only the visible fake editor bound.',
			'The template pool log shows a template moving from an earlier item to the currently visible item without stale line content.',
		],
		render: context => renderMultiDiffScrollFixture(context, 'pooling', 1600),
	}),
	RealWidget: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'The real MultiDiffEditorWidget next to the same complete-content and compressed-rendering coordinate visualization used by the fake stress fixture.',
			'The diagnostics show the current layout revision and global leading and trailing scroll slack.',
		],
		render: renderRealMultiDiffScrollFixture,
	}),
});

function renderMultiDiffScrollFixture(
	{ container, disposableStore }: ComponentFixtureContext,
	initialScenario?: 'mixed' | 'tall' | 'pooling' | 'measurement',
	finalScrollTop?: number,
): void {
	container.classList.add('multi-diff-scroll-fixture');
	const model = disposableStore.add(new MultiDiffScrollFixtureModel());
	if (initialScenario) {
		model.applyScenario(initialScenario);
	}

	const heading = dom.append(container, dom.$('h1.multi-diff-scroll-fixture-title'));
	heading.textContent = 'Multi-diff scroll model';
	const description = dom.append(container, dom.$('p.multi-diff-scroll-fixture-description'));
	description.textContent = 'The production compacted virtualized scroll view and item manager render controllable fake templates, including mount-time line-count changes, the real scrollbar, smooth scrolling, layout projection, strict template rebinding, and delayed measurements.';

	const columns = dom.append(container, dom.$('.multi-diff-scroll-fixture-columns'));
	const controls = dom.append(columns, dom.$('section.multi-diff-scroll-fixture-panel.controls'));
	const visualization = dom.append(columns, dom.$('main.multi-diff-scroll-fixture-visualization'));
	const inspector = dom.append(columns, dom.$('section.multi-diff-scroll-fixture-panel.inspector'));

	renderControls(controls, model, disposableStore);
	renderVisualization(visualization, model, disposableStore);
	renderInspector(inspector, model, disposableStore);
	if (finalScrollTop !== undefined) {
		model.setScrollTop(finalScrollTop, 'Initialize scrolled template-pool fixture', false);
	}
}

function renderRealMultiDiffScrollFixture({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext): void {
	const viewportHeight = 480;
	const viewportWidth = 540;
	container.classList.add('multi-diff-scroll-fixture', 'real-widget');

	const heading = dom.append(container, dom.$('h1.multi-diff-scroll-fixture-title'));
	heading.textContent = 'Real multi-diff virtualized layout';
	const description = dom.append(container, dom.$('p.multi-diff-scroll-fixture-description'));
	description.textContent = 'The production MultiDiffEditorWidget renders through the same compacted layout and strict item-binding infrastructure shown by the coordinate visualization.';

	const columns = dom.append(container, dom.$('.multi-diff-scroll-fixture-columns'));
	const visualization = dom.append(columns, dom.$('main.multi-diff-scroll-fixture-visualization'));
	const editorPane = dom.append(visualization, dom.$('.multi-diff-scroll-fixture-editor-pane'));
	appendSectionHeading(editorPane, 'Real MultiDiffEditorWidget');
	const viewport = dom.append(editorPane, dom.$('.multi-diff-scroll-fixture-viewport'));
	viewport.style.width = `${viewportWidth}px`;
	viewport.style.height = `${viewportHeight}px`;
	viewport.setAttribute('aria-label', 'Real multi-diff editor');

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());
	const textModels = disposableStackStore.add(new DisposableStore());
	const { doc1, doc2, doc3 } = createMultiDiffEditorFixtureDocuments(instantiationService, textModels);
	const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(instantiationService, viewport));
	const model: IMultiDiffEditorModel = {
		documents: ValueWithChangeEvent.const([doc1, doc2, doc3]),
	};
	const viewModel = disposableStackStore.add(widget.createViewModel(model));
	widget.setViewModel(viewModel);
	widget.layout(new dom.Dimension(viewportWidth, viewportHeight));
	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));

	const coordinateState = derived(widget, reader => {
		const debugState = widget.getLayoutDebugState().read(reader);
		return {
			layout: {
				scrollHeight: debugState.layout.scrollHeight,
				renderedHeight: debugState.layout.renderedHeight,
				contentViewport: toCoordinateRange(debugState.layout.contentViewport),
				renderedViewport: toCoordinateRange(debugState.layout.renderedViewport),
				items: debugState.items.map(item => ({
					contentRange: toCoordinateRange(item.layout.contentRange),
					renderedRange: toCoordinateRange(item.layout.renderedRange),
					scrollOffset: item.layout.scrollOffset,
				})),
			},
			items: debugState.items.map(item => ({
				label: item.label,
				templateId: item.hasTemplate ? 'bound' : undefined,
			})),
		};
	});
	renderCoordinateVisualization(visualization, constObservable(viewportHeight), coordinateState, disposableStore);

	const diagnostics = dom.append(visualization, dom.$('pre.multi-diff-scroll-fixture-real-diagnostics'));
	diagnostics.tabIndex = 0;
	diagnostics.setAttribute('aria-label', 'Current multi-diff layout revision and scroll slack');
	disposableStore.add(autorun(reader => {
		const state = widget.getLayoutDebugState().read(reader);
		diagnostics.textContent = JSON.stringify({
			revision: state.layout.revision,
			logicalScrollHeight: state.layout.logicalScrollHeight,
			scrollHeight: state.layout.scrollHeight,
			leadingScrollSlack: state.layout.leadingScrollSlack,
			trailingScrollSlack: state.layout.trailingScrollSlack,
			geometryEdit: state.geometryEdit,
		}, undefined, '\t');
	}));
}

function toCoordinateRange(range: { readonly start: number; readonly endExclusive: number }): { readonly start: number; readonly endExclusive: number; readonly length: number } {
	return { ...range, length: range.endExclusive - range.start };
}

function renderControls(container: HTMLElement, model: MultiDiffScrollFixtureModel, store: DisposableStore): void {
	appendSectionHeading(container, 'Controls');
	const selectedTab = observableValue<'form' | 'json'>(container, 'form');
	const tabList = dom.append(container, dom.$('.multi-diff-scroll-fixture-tabs'));
	tabList.setAttribute('role', 'tablist');
	tabList.setAttribute('aria-label', 'Fixture state editor');
	const formTab = appendButton(tabList, 'Form', () => selectedTab.set('form', undefined), store, true);
	const jsonTab = appendButton(tabList, 'JSON', () => selectedTab.set('json', undefined), store, true);
	formTab.element.setAttribute('role', 'tab');
	jsonTab.element.setAttribute('role', 'tab');
	store.add(dom.addDisposableListener(tabList, dom.EventType.KEY_DOWN, event => {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
			return;
		}
		event.preventDefault();
		const tab = selectedTab.get() === 'form' ? 'json' : 'form';
		selectedTab.set(tab, undefined);
		(tab === 'form' ? formTab : jsonTab).element.focus();
	}));

	const formPanel = dom.append(container, dom.$('.multi-diff-scroll-fixture-tab-panel'));
	formPanel.setAttribute('role', 'tabpanel');
	formPanel.setAttribute('aria-label', 'Form');
	const jsonPanel = dom.append(container, dom.$('.multi-diff-scroll-fixture-tab-panel'));
	jsonPanel.setAttribute('role', 'tabpanel');
	jsonPanel.setAttribute('aria-label', 'JSON');
	store.add(autorun(reader => {
		const tab = selectedTab.read(reader);
		formPanel.hidden = tab !== 'form';
		jsonPanel.hidden = tab !== 'json';
		formTab.element.setAttribute('aria-selected', String(tab === 'form'));
		jsonTab.element.setAttribute('aria-selected', String(tab === 'json'));
		formTab.element.tabIndex = tab === 'form' ? 0 : -1;
		jsonTab.element.tabIndex = tab === 'json' ? 0 : -1;
	}));

	const scenarioLabel = dom.append(formPanel, dom.$('label.multi-diff-scroll-fixture-field'));
	dom.append(scenarioLabel, dom.$('span')).textContent = 'Scenario';
	const scenario = dom.append(scenarioLabel, dom.$('select')) as HTMLSelectElement;
	for (const [value, label] of [['mixed', 'Mixed line counts'], ['tall', 'Tall item'], ['pooling', '20-item template pool'], ['measurement', 'Estimated line counts']] as const) {
		const option = dom.append(scenario, dom.$('option')) as HTMLOptionElement;
		option.value = value;
		option.textContent = label;
	}
	store.add(dom.addDisposableListener(scenario, dom.EventType.CHANGE, () => model.applyScenario(scenario.value as 'mixed' | 'tall' | 'pooling' | 'measurement')));
	store.add(autorun(reader => {
		scenario.value = model.scenario.read(reader);
	}));

	appendNumberField(formPanel, 'Viewport height', model.viewportHeight, value => model.setViewportHeight(value), store);
	appendNumberField(formPanel, 'Multi-diff scroll top', model.scrollTop, value => model.setScrollTop(value), store);
	appendNumberField(formPanel, 'Item gap', model.itemGap, value => model.setItemGap(value), store);

	const deltaButtons = dom.append(formPanel, dom.$('.multi-diff-scroll-fixture-button-row'));
	for (const delta of [-100, -10, -1, 1, 10, 100]) {
		appendButton(deltaButtons, `${delta > 0 ? '+' : ''}${delta}`, () => model.setScrollTop(model.scrollTop.get() + delta, `Scroll multi-diff by ${delta}`), store, true);
	}

	const transactionButtons = dom.append(formPanel, dom.$('.multi-diff-scroll-fixture-button-column'));
	appendButton(transactionButtons, 'Apply Batched Geometry Change', () => model.applyBatchedGeometryChange(), store);
	appendButton(transactionButtons, 'Scroll One Viewport', () => model.scrollOneViewport(), store, true);

	appendSectionHeading(formPanel, 'Fake editor items');
	const itemDescription = dom.append(formPanel, dom.$('p.multi-diff-scroll-fixture-json-description'));
	itemDescription.textContent = 'Each pooled template mount uses its initial line count, synchronously reports its immediate line count, then reports its delayed line count after 200ms.';
	const itemControls = dom.append(formPanel, dom.$('.multi-diff-scroll-fixture-item-controls-list'));
	store.add(autorun(reader => {
		const items = model.items.read(reader);
		itemControls.replaceChildren();
		for (let index = 0; index < items.length; index++) {
			renderItemControls(itemControls, model, items[index], index, reader.store);
		}
	}));

	const jsonDescription = dom.append(jsonPanel, dom.$('p.multi-diff-scroll-fixture-json-description'));
	jsonDescription.textContent = 'Edit the complete fixture state. Copy this JSON to export a scenario, or paste JSON and apply it to import one.';
	const jsonEditor = dom.append(jsonPanel, dom.$('textarea.multi-diff-scroll-fixture-json-editor')) as HTMLTextAreaElement;
	jsonEditor.setAttribute('aria-label', 'Fixture state JSON');
	jsonEditor.spellcheck = false;
	const jsonError = dom.append(jsonPanel, dom.$('.multi-diff-scroll-fixture-json-error'));
	jsonError.setAttribute('role', 'alert');
	const jsonButtons = dom.append(jsonPanel, dom.$('.multi-diff-scroll-fixture-button-column'));
	appendButton(jsonButtons, 'Apply JSON', () => {
		try {
			model.applySerializedState(jsonEditor.value);
			jsonEditor.value = model.serializedState.get();
			jsonError.textContent = '';
		} catch (error) {
			jsonError.textContent = getErrorMessage(error);
		}
	}, store);
	appendButton(jsonButtons, 'Refresh From State', () => {
		jsonEditor.value = model.serializedState.get();
		jsonError.textContent = '';
	}, store, true);
	appendButton(jsonButtons, 'Select All JSON', () => {
		jsonEditor.focus();
		jsonEditor.select();
	}, store, true);
	store.add(autorun(reader => {
		const serializedState = model.serializedState.read(reader);
		if (dom.getActiveElement() !== jsonEditor) {
			jsonEditor.value = serializedState;
		}
	}));
}

function renderItemControls(container: HTMLElement, model: MultiDiffScrollFixtureModel, item: FixtureItem, index: number, store: DisposableStore): void {
	const card = dom.append(container, dom.$('fieldset.multi-diff-scroll-fixture-item-controls'));
	const legend = dom.append(card, dom.$('legend'));
	store.add(autorun(reader => {
		const templateId = item.templateId.read(reader);
		legend.textContent = `Item ${item.label} · ${templateId === undefined ? 'pool unbound' : `template #${templateId}`}`;
	}));

	appendNumberField(card, 'Line count', item.lineCount, value => model.setItemLineCount(index, value), store);
	appendNumberField(card, 'Initial mount line count', item.mountInitialLineCount, value => model.setMountLineCount(index, 'initial', value), store);
	appendNumberField(card, 'Synchronous mount line count', item.mountImmediateLineCount, value => model.setMountLineCount(index, 'immediate', value), store);
	appendNumberField(card, 'Mount line count after 200ms', item.mountDelayedLineCount, value => model.setMountLineCount(index, 'after200ms', value), store);
	appendNumberField(card, 'Actual editor offset', item.actualScrollOffset, value => model.setEditorScrollOffset(index, value), store);

	const resetLabel = dom.append(card, dom.$('label.multi-diff-scroll-fixture-checkbox-field'));
	const resetCheckbox = dom.append(resetLabel, dom.$('input')) as HTMLInputElement;
	resetCheckbox.type = 'checkbox';
	dom.append(resetLabel, dom.$('span')).textContent = 'Reset line count after unmount';
	store.add(dom.addDisposableListener(resetCheckbox, dom.EventType.CHANGE, () => model.setUnmountLineCountResetEnabled(index, resetCheckbox.checked)));
	store.add(autorun(reader => {
		resetCheckbox.checked = item.resetLineCountOnUnmount.read(reader);
	}));
	appendNumberField(card, 'Unmounted line count', item.unmountedLineCount, value => model.setUnmountedLineCount(index, value), store);

	const phaseLabel = dom.append(card, dom.$('label.multi-diff-scroll-fixture-field'));
	dom.append(phaseLabel, dom.$('span')).textContent = 'Binding phase';
	const phaseSelect = dom.append(phaseLabel, dom.$('select')) as HTMLSelectElement;
	for (const phase of ['unbound', 'binding', 'projecting', 'active'] as const) {
		const option = dom.append(phaseSelect, dom.$('option')) as HTMLOptionElement;
		option.value = phase;
		option.textContent = phase;
	}
	store.add(dom.addDisposableListener(phaseSelect, dom.EventType.CHANGE, () => model.setBindingPhase(index, phaseSelect.value as BindingPhase)));
	store.add(autorun(reader => {
		phaseSelect.value = item.bindingPhase.read(reader);
	}));

	const oscillationLabel = dom.append(card, dom.$('label.multi-diff-scroll-fixture-checkbox-field'));
	const oscillationCheckbox = dom.append(oscillationLabel, dom.$('input')) as HTMLInputElement;
	oscillationCheckbox.type = 'checkbox';
	dom.append(oscillationLabel, dom.$('span')).textContent = 'Oscillate geometry every second';
	store.add(dom.addDisposableListener(oscillationCheckbox, dom.EventType.CHANGE, () => model.setGeometryOscillationEnabled(index, oscillationCheckbox.checked)));
	store.add(autorun(reader => {
		oscillationCheckbox.checked = item.geometryOscillationEnabled.read(reader);
	}));

	appendNumberField(card, 'Top lines A', item.geometryOscillationTopLineCountA, value => model.setGeometryOscillationLineCount(index, 'top', 'A', value), store);
	appendNumberField(card, 'Top lines B', item.geometryOscillationTopLineCountB, value => model.setGeometryOscillationLineCount(index, 'top', 'B', value), store);
	appendNumberField(card, 'Bottom lines A', item.geometryOscillationBottomLineCountA, value => model.setGeometryOscillationLineCount(index, 'bottom', 'A', value), store);
	appendNumberField(card, 'Bottom lines B', item.geometryOscillationBottomLineCountB, value => model.setGeometryOscillationLineCount(index, 'bottom', 'B', value), store);

	const orderingLabel = dom.append(card, dom.$('label.multi-diff-scroll-fixture-field'));
	dom.append(orderingLabel, dom.$('span')).textContent = 'Delivery ordering';
	const orderingSelect = dom.append(orderingLabel, dom.$('select')) as HTMLSelectElement;
	for (const [value, label] of [['atomic', 'Atomic'], ['lines-first', 'Lines, then offset'], ['offset-first', 'Offset, then lines']] as const) {
		const option = dom.append(orderingSelect, dom.$('option')) as HTMLOptionElement;
		option.value = value;
		option.textContent = label;
	}
	store.add(dom.addDisposableListener(orderingSelect, dom.EventType.CHANGE, () => model.setGeometryChangeOrdering(index, orderingSelect.value as GeometryChangeOrdering)));
	store.add(autorun(reader => {
		orderingSelect.value = item.geometryChangeOrdering.read(reader);
	}));

	const editorButtons = dom.append(card, dom.$('.multi-diff-scroll-fixture-button-row'));
	const replayMountButton = appendButton(editorButtons, 'Replay Mount', () => model.replayItemMount(index), store, true);
	store.add(autorun(reader => {
		replayMountButton.enabled = item.templateId.read(reader) !== undefined;
	}));
	appendButton(editorButtons, 'Editor −100', () => model.setEditorScrollOffset(index, item.actualScrollOffset.get() - 100), store, true);
	appendButton(editorButtons, 'Editor +100', () => model.setEditorScrollOffset(index, item.actualScrollOffset.get() + 100), store, true);
	appendButton(editorButtons, 'Jump Once', () => model.toggleItemGeometry(index), store, true);
}

function renderVisualization(container: HTMLElement, model: MultiDiffScrollFixtureModel, store: DisposableStore): void {
	const editorPane = dom.append(container, dom.$('.multi-diff-scroll-fixture-editor-pane'));
	appendSectionHeading(editorPane, 'Virtualized fake editors');
	const viewport = dom.append(editorPane, dom.$('.multi-diff-scroll-fixture-viewport'));
	viewport.tabIndex = 0;
	viewport.setAttribute('aria-label', 'Virtualized multi-diff viewport. Use the arrow keys or mouse wheel to scroll.');
	const dimension = derived(model, reader => new dom.Dimension(500, model.viewportHeight.read(reader)));
	const scrollView = store.add(new CompressedVirtualizedScrollView(
		viewport,
		dimension,
		model.itemGap,
		context => model.createVirtualizedItems(context),
	));
	scrollView.domNode.classList.add('multi-diff-scroll-fixture-scroll-view');
	viewport.appendChild(scrollView.domNode);
	model.attachScrollView(scrollView);
	store.add(autorun(reader => {
		viewport.style.height = `${model.viewportHeight.read(reader)}px`;
	}));
	store.add(dom.addDisposableListener(viewport, dom.EventType.KEY_DOWN, event => {
		const delta = event.key === 'ArrowDown' ? 40
			: event.key === 'ArrowUp' ? -40
				: event.key === 'PageDown' ? model.viewportHeight.get()
					: event.key === 'PageUp' ? -model.viewportHeight.get()
						: undefined;
		if (delta !== undefined) {
			event.preventDefault();
			model.setScrollTop(model.scrollTop.get() + delta, `Scroll fixture with ${event.key}`);
		}
	}));
	const coordinateState = derived(model, reader => ({
		layout: model.layout.read(reader),
		items: model.items.read(reader).map(item => ({
			label: item.label,
			templateId: item.templateId.read(reader),
		})),
	}));
	renderCoordinateVisualization(container, model.viewportHeight, coordinateState, store);
}

interface ICoordinateVisualizationState {
	readonly layout: {
		readonly scrollHeight: number;
		readonly renderedHeight: number;
		readonly contentViewport: { readonly start: number; readonly endExclusive: number; readonly length: number };
		readonly renderedViewport: { readonly start: number; readonly endExclusive: number; readonly length: number };
		readonly items: readonly {
			readonly contentRange: { readonly start: number; readonly endExclusive: number; readonly length: number };
			readonly renderedRange: { readonly start: number; readonly endExclusive: number; readonly length: number };
			readonly scrollOffset: number;
		}[];
	};
	readonly items: readonly {
		readonly label: string;
		readonly templateId: number | string | undefined;
	}[];
}

function renderCoordinateVisualization(
	container: HTMLElement,
	viewportHeight: IObservable<number>,
	state: IObservable<ICoordinateVisualizationState>,
	store: DisposableStore,
): void {
	const coordinatePane = dom.append(container, dom.$('.multi-diff-scroll-fixture-coordinate-pane'));
	appendSectionHeading(coordinatePane, 'Coordinate systems');
	const coordinateGrid = dom.append(coordinatePane, dom.$('.multi-diff-scroll-fixture-coordinate-grid'));
	const contentScale = createCoordinateScale(coordinateGrid, 'Complete content');
	const renderedScale = createCoordinateScale(coordinateGrid, 'Compressed rendering with item-local viewports');
	store.add(autorun(reader => {
		const height = viewportHeight.read(reader);
		const value = state.read(reader);
		const coordinateHeight = Math.max(height, Math.min(1200, value.items.length * 60));
		contentScale.track.style.height = `${coordinateHeight}px`;
		renderedScale.track.style.height = `${coordinateHeight}px`;
		updateCoordinateScale(contentScale, value.layout, value.items, 'content');
		updateCoordinateScale(renderedScale, value.layout, value.items, 'rendered');
	}));
}

interface ICoordinateSegment {
	readonly root: HTMLElement;
	readonly itemRange: HTMLElement;
	readonly itemViewport: HTMLElement;
	readonly label: HTMLElement;
}

interface ICoordinateScale {
	readonly track: HTMLElement;
	readonly viewport: HTMLElement;
	readonly segments: ICoordinateSegment[];
}

function createCoordinateScale(container: HTMLElement, title: string): ICoordinateScale {
	const root = dom.append(container, dom.$('.multi-diff-scroll-fixture-coordinate-scale'));
	dom.append(root, dom.$('h3')).textContent = title;
	const track = dom.append(root, dom.$('.track'));
	const viewport = dom.append(track, dom.$('.viewport-marker'));
	viewport.setAttribute('aria-hidden', 'true');
	return { track, viewport, segments: [] };
}

function updateCoordinateScale(
	scale: ICoordinateScale,
	layout: ICoordinateVisualizationState['layout'],
	items: ICoordinateVisualizationState['items'],
	kind: 'content' | 'rendered',
): void {
	while (scale.segments.length > items.length) {
		scale.segments.pop()!.root.remove();
	}
	while (scale.segments.length < items.length) {
		const root = dom.$('.segment');
		const itemRange = dom.append(root, dom.$('.item-local-range'));
		const itemViewport = dom.append(itemRange, dom.$('.item-local-viewport'));
		const label = dom.append(root, dom.$('.segment-label'));
		scale.track.insertBefore(root, scale.viewport);
		scale.segments.push({ root, itemRange, itemViewport, label });
	}
	const height = kind === 'content' ? layout.scrollHeight : layout.renderedHeight;
	const safeHeight = Math.max(1, height);
	for (let index = 0; index < layout.items.length; index++) {
		const itemLayout = layout.items[index];
		const range = kind === 'content' ? itemLayout.contentRange : itemLayout.renderedRange;
		const segment = scale.segments[index];
		const templateId = items[index].templateId;
		segment.label.textContent = kind === 'content'
			? items[index].label
			: `${items[index].label} · ${templateId === undefined ? 'unbound' : `T${templateId}`} · viewport ${formatRange(itemLayout.scrollOffset, itemLayout.scrollOffset + itemLayout.renderedRange.length)}`;
		segment.root.style.top = `${range.start / safeHeight * 100}%`;
		segment.root.style.height = `${range.length / safeHeight * 100}%`;
		segment.itemRange.hidden = kind !== 'rendered';
		if (kind === 'rendered') {
			const itemHeight = Math.max(1, itemLayout.contentRange.length);
			segment.itemViewport.style.top = `${itemLayout.scrollOffset / itemHeight * 100}%`;
			segment.itemViewport.style.height = `${Math.min(itemLayout.renderedRange.length, itemHeight) / itemHeight * 100}%`;
		}
	}
	const viewport = kind === 'content' ? layout.contentViewport : layout.renderedViewport;
	scale.viewport.style.top = `${viewport.start / safeHeight * 100}%`;
	scale.viewport.style.height = `${viewport.length / safeHeight * 100}%`;
}

function renderFakeEditorLines(container: HTMLElement, itemLabel: string, lineCount: number, topLineCount: number, bottomLineCount: number): void {
	const lineNumbers = [
		...Array.from({ length: topLineCount }, (_, lineIndex) => lineIndex - topLineCount),
		...Array.from({ length: lineCount }, (_, lineIndex) => lineIndex + 1),
		...Array.from({ length: bottomLineCount }, (_, lineIndex) => lineCount + lineIndex + 1),
	];
	container.replaceChildren(...lineNumbers.map(lineNumber => {
		const line = dom.$('.multi-diff-scroll-fixture-editor-line');
		line.style.height = `${fixtureLineHeight}px`;
		line.style.lineHeight = `${fixtureLineHeight}px`;
		const gutter = dom.append(line, dom.$('span.line-number'));
		gutter.textContent = String(lineNumber);
		const content = dom.append(line, dom.$('span.line-content'));
		content.textContent = `Item ${itemLabel} Line ${lineNumber}`;
		return line;
	}));
}

function renderInspector(container: HTMLElement, model: MultiDiffScrollFixtureModel, store: DisposableStore): void {
	appendSectionHeading(container, 'Displacement conservation');
	const equation = dom.append(container, dom.$('.multi-diff-scroll-fixture-equation'));
	const equationValues = dom.append(equation, dom.$('code'));
	const equationStatus = dom.append(equation, dom.$('.status'));
	equationStatus.setAttribute('role', 'status');

	appendSectionHeading(container, 'Item state');
	const table = dom.append(container, dom.$('table.multi-diff-scroll-fixture-table'));
	const caption = dom.append(table, dom.$('caption'));
	caption.textContent = 'Multi-diff item layout state';
	const header = dom.append(table, dom.$('thead'));
	const headerRow = dom.append(header, dom.$('tr'));
	for (const label of ['Item', 'Content', 'Rendered', 'Max', 'Projected', 'Actual', 'Template', 'Phase']) {
		dom.append(headerRow, dom.$('th')).textContent = label;
	}
	const body = dom.append(table, dom.$('tbody'));

	appendSectionHeading(container, 'Template pool');
	const templateLog = dom.append(container, dom.$('ol.multi-diff-scroll-fixture-log.template-log'));

	appendSectionHeading(container, 'Transition log');
	const transitionLog = dom.append(container, dom.$('ol.multi-diff-scroll-fixture-log'));

	store.add(autorun(reader => {
		const layout = model.layout.read(reader);
		const conservationResidual = layout.scrollTop - layout.renderedViewport.start - layout.hiddenContentHeightAboveViewport;
		equationValues.textContent = `${formatNumber(layout.scrollTop)} = ${formatNumber(layout.renderedViewport.start)} + ${formatNumber(layout.hiddenContentHeightAboveViewport)}`;
		equationStatus.textContent = Math.abs(conservationResidual) < 0.0001 ? 'Invariant holds' : `Residual ${formatNumber(conservationResidual)}`;
		equation.classList.toggle('invalid', Math.abs(conservationResidual) >= 0.0001);

		templateLog.replaceChildren();
		for (const binding of model.templateBindings.read(reader)) {
			dom.append(templateLog, dom.$('li')).textContent = binding;
		}

		transitionLog.replaceChildren();
		const transitions = model.transitions.read(reader);
		for (const transition of transitions.toReversed()) {
			const entry = dom.append(transitionLog, dom.$('li'));
			entry.classList.toggle('invalid', Math.abs(transition.residual) >= 0.0001);
			const action = dom.append(entry, dom.$('span.action'));
			action.textContent = transition.action;
			const values = dom.append(entry, dom.$('code'));
			values.textContent = `Δscroll ${formatSigned(transition.scrollDelta)} = Δrendered ${formatSigned(transition.renderedDelta)} + Δhidden ${formatSigned(transition.hiddenDelta)} · residual ${formatSigned(transition.residual)}`;
		}
	}));

	store.add(autorun(reader => {
		const items = model.items.read(reader);
		body.replaceChildren();
		const tableRows = items.map(() => {
			const row = dom.append(body, dom.$('tr'));
			return {
				row,
				cells: Array.from({ length: 8 }, () => dom.append(row, dom.$('td'))),
			};
		});

		reader.store.add(autorun(tableReader => {
			const layout = model.layout.read(tableReader);
			if (layout.items.length !== items.length) {
				return;
			}
			for (let index = 0; index < items.length; index++) {
				const item = items[index];
				const itemLayout = layout.items[index];
				const cells = tableRows[index].cells;
				const values = [
					item.label,
					formatRange(itemLayout.contentRange.start, itemLayout.contentRange.endExclusive),
					formatRange(itemLayout.renderedRange.start, itemLayout.renderedRange.endExclusive),
					formatNumber(itemLayout.maxScrollOffset),
					formatNumber(itemLayout.scrollOffset),
					formatNumber(item.actualScrollOffset.read(tableReader)),
					item.templateId.read(tableReader) === undefined ? '—' : `#${item.templateId.read(tableReader)}`,
					item.bindingPhase.read(tableReader),
				];
				for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
					cells[cellIndex].textContent = values[cellIndex];
				}
				tableRows[index].row.classList.toggle(
					'desynchronized',
					itemLayout.visibility === 'visible' && item.actualScrollOffset.read(tableReader) !== itemLayout.scrollOffset
				);
			}
		}));
	}));
}

function appendSectionHeading(container: HTMLElement, label: string): void {
	dom.append(container, dom.$('h2')).textContent = label;
}

function appendNumberField(
	container: HTMLElement,
	label: string,
	value: IObservable<number>,
	onChange: (value: number) => void,
	store: DisposableStore,
): void {
	const field = dom.append(container, dom.$('label.multi-diff-scroll-fixture-field'));
	dom.append(field, dom.$('span')).textContent = label;
	const input = dom.append(field, dom.$('input')) as HTMLInputElement;
	input.type = 'number';
	input.step = '1';
	store.add(dom.addDisposableListener(input, dom.EventType.CHANGE, () => {
		const newValue = Number(input.value);
		if (Number.isFinite(newValue)) {
			onChange(newValue);
		}
	}));
	store.add(autorun(reader => {
		const formattedValue = formatNumber(value.read(reader));
		if (dom.getActiveElement() !== input) {
			input.value = formattedValue;
		}
	}));
	store.add(dom.addDisposableListener(input, dom.EventType.BLUR, () => {
		input.value = formatNumber(value.get());
	}));
}

function appendButton(
	container: HTMLElement,
	label: string,
	onClick: () => void,
	store: DisposableStore,
	secondary = false,
): Button {
	const button = store.add(new Button(container, { ...buttonStyles, secondary, title: label }));
	button.label = label;
	store.add(button.onDidClick(onClick));
	return button;
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSigned(value: number): string {
	return `${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatRange(start: number, endExclusive: number): string {
	return `${formatNumber(start)}–${formatNumber(endExclusive)}`;
}
