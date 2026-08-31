/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ITransaction, mapObservableArrayCached, observableValue, transaction } from '../../../../base/common/observable.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ICompressedVirtualizedScrollItem, ICompressedVirtualizedScrollItemContext, ICompressedVirtualizedScrollViewContext } from './compressedVirtualizedScrollView.js';

export interface IVirtualizedItemBindingContext {
	readonly initialSize: number;
	runWithScrollAnchor(getItemOffset: () => number, update: (tx: ITransaction) => void): void;
}

export interface IVirtualizedItemBinding<TItem> extends IDisposable {
	readonly item: TItem;
	readonly size: IObservable<number>;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }>;
	readonly shouldKeepAlive: IObservable<boolean>;
	readonly onDidDispose: Event<void>;
	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void;
	hide(): void;
}

export abstract class VirtualizedItemBinding<TItem> extends Disposable implements IVirtualizedItemBinding<TItem> {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;
	abstract readonly size: IObservable<number>;
	abstract readonly maxScroll: IObservable<{ readonly maxScroll: number }>;
	abstract readonly shouldKeepAlive: IObservable<boolean>;

	constructor(readonly item: TItem) {
		super();
	}

	abstract render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void;
	abstract hide(): void;

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._onDidDispose.fire();
		super.dispose();
	}
}

export interface IVirtualizedItemTemplate<TItem, TBinding extends IVirtualizedItemBinding<TItem>> extends IDisposable {
	readonly currentBinding: IObservable<TBinding | undefined>;
	bind(item: TItem, context: IVirtualizedItemBindingContext): TBinding;
}

export abstract class VirtualizedItemTemplate<TItem, TBinding extends IVirtualizedItemBinding<TItem>> extends Disposable implements IVirtualizedItemTemplate<TItem, TBinding> {
	private readonly _currentBinding = observableValue<TBinding | undefined>(this, undefined);
	readonly currentBinding: IObservable<TBinding | undefined> = this._currentBinding;
	private readonly _bindingStore = this._register(new DisposableStore());

	bind(item: TItem, context: IVirtualizedItemBindingContext): TBinding {
		if (this._currentBinding.get()) {
			throw new BugIndicatingError('Cannot rebind a virtualized template before disposing its current binding');
		}
		const binding = this.createBinding(item, context);
		this._bindingStore.clear();
		this._bindingStore.add(Event.once(binding.onDidDispose)(() => {
			if (this._currentBinding.get() !== binding) {
				throw new BugIndicatingError('Disposed binding does not own its virtualized template');
			}
			this._currentBinding.set(undefined, undefined);
		}));
		this._currentBinding.set(binding, undefined);
		return binding;
	}

	protected abstract createBinding(item: TItem, context: IVirtualizedItemBindingContext): TBinding;

	override dispose(): void {
		this._currentBinding.get()?.dispose();
		super.dispose();
	}
}

export interface IVirtualizedItemDelegate<TItem, TBinding extends IVirtualizedItemBinding<TItem>, TTemplate extends IVirtualizedItemTemplate<TItem, TBinding>> {
	getId(item: TItem): unknown;
	getTemplateId(item: TItem): string;
	getUnboundSize(item: TItem): IObservable<number>;
	createTemplate(templateId: string, context: ICompressedVirtualizedScrollViewContext): TTemplate;
	onDidBind?(binding: TBinding, tx: ITransaction): void;
	onWillUnbind?(binding: TBinding, tx: ITransaction): void;
}

export class VirtualizedItemManager<TItem, TBinding extends IVirtualizedItemBinding<TItem>, TTemplate extends IVirtualizedItemTemplate<TItem, TBinding>> extends Disposable {
	private readonly _pools = new Map<string, VirtualizedTemplatePool<TItem, TBinding, TTemplate>>();
	readonly virtualizedItems: IObservable<readonly ManagedVirtualizedItem<TItem, TBinding, TTemplate>[]>;

	constructor(
		items: IObservable<readonly TItem[]>,
		private readonly _context: ICompressedVirtualizedScrollViewContext,
		private readonly _delegate: IVirtualizedItemDelegate<TItem, TBinding, TTemplate>,
	) {
		super();
		this.virtualizedItems = mapObservableArrayCached(
			this,
			items,
			(item, store) => store.add(new ManagedVirtualizedItem(item, this, _delegate)),
			item => _delegate.getId(item),
		).recomputeInitiallyAndOnChange(this._store);
		this._register(toDisposable(() => {
			for (const pool of this._pools.values()) {
				pool.dispose();
			}
			this._pools.clear();
		}));
	}

	acquire(item: TItem): IReference<TTemplate> {
		const templateId = this._delegate.getTemplateId(item);
		let pool = this._pools.get(templateId);
		if (!pool) {
			pool = new VirtualizedTemplatePool(() => this._delegate.createTemplate(templateId, this._context));
			this._pools.set(templateId, pool);
		}
		return pool.acquire();
	}

}

export class ManagedVirtualizedItem<TItem, TBinding extends IVirtualizedItemBinding<TItem>, TTemplate extends IVirtualizedItemTemplate<TItem, TBinding>> extends Disposable implements ICompressedVirtualizedScrollItem {
	private readonly _templateReference = observableValue<IReference<TTemplate> | undefined>(this, undefined);
	private readonly _isHidden = observableValue(this, false);
	private _lastRender: { renderedRange: OffsetRange; scrollOffset: number; width: number; renderedViewport: OffsetRange; context: ICompressedVirtualizedScrollItemContext | undefined } | undefined;
	readonly template = derived(this, reader => this._templateReference.read(reader)?.object);
	readonly binding = derived(this, reader => this.template.read(reader)?.currentBinding.read(reader));
	readonly size;
	readonly maxScroll;

	constructor(
		readonly item: TItem,
		private readonly _manager: VirtualizedItemManager<TItem, TBinding, TTemplate>,
		private readonly _delegate: IVirtualizedItemDelegate<TItem, TBinding, TTemplate>,
	) {
		super();
		const unboundSize = _delegate.getUnboundSize(item);
		this.size = derived(this, reader => this.binding.read(reader)?.size.read(reader) ?? unboundSize.read(reader));
		this.maxScroll = derived(this, reader => this.binding.read(reader)?.maxScroll.read(reader) ?? { maxScroll: 0 });
		this._register(autorun(reader => {
			const binding = this.binding.read(reader);
			if (!binding || !this._isHidden.read(reader) || binding.shouldKeepAlive.read(reader)) {
				return;
			}
			this._clearBinding();
		}));
	}

	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange, context?: ICompressedVirtualizedScrollItemContext): void {
		this._lastRender = { renderedRange, scrollOffset, width, renderedViewport, context };
		this._isHidden.set(false, undefined);
		let binding = this.binding.get();
		if (!binding) {
			const templateReference = this._manager.acquire(this.item);
			const template = templateReference.object;
			if (template.currentBinding.get()) {
				templateReference.dispose();
				throw new BugIndicatingError('Virtualized template pool returned a bound template');
			}
			const newBinding = template.bind(this.item, {
				initialSize: this.size.get(),
				runWithScrollAnchor: (getItemOffset, update) => {
					if (!context) {
						throw new BugIndicatingError('Cannot preserve a virtualized item scroll anchor without a render context');
					}
					context.runWithScrollAnchor(getItemOffset, update);
				},
			});
			if (newBinding.item !== this.item || template.currentBinding.get() !== newBinding) {
				newBinding.dispose();
				templateReference.dispose();
				throw new BugIndicatingError('Virtualized template returned a binding for a different item');
			}
			binding = newBinding;
			transaction(tx => {
				this._templateReference.set(templateReference, tx);
				this._delegate.onDidBind?.(newBinding, tx);
			});
		}
		binding.render(renderedRange, scrollOffset, width, renderedViewport);
	}

	hide(): void {
		this._isHidden.set(true, undefined);
		this.binding.get()?.hide();
	}

	rebind(): void {
		if (!this.binding.get() || !this._lastRender) {
			return;
		}
		const lastRender = this._lastRender;
		this._clearBinding();
		this.render(lastRender.renderedRange, lastRender.scrollOffset, lastRender.width, lastRender.renderedViewport, lastRender.context);
	}

	private _clearBinding(): void {
		const templateReference = this._templateReference.get();
		const binding = templateReference?.object.currentBinding.get();
		if (!templateReference || !binding) {
			return;
		}
		transaction(tx => {
			this._delegate.onWillUnbind?.(binding, tx);
		});
		binding.hide();
		binding.dispose();
		if (templateReference.object.currentBinding.get()) {
			throw new BugIndicatingError('Virtualized binding did not release its template when disposed');
		}
		transaction(tx => {
			this._templateReference.set(undefined, tx);
		});
		templateReference.dispose();
	}

	override dispose(): void {
		this._clearBinding();
		super.dispose();
	}
}

class VirtualizedTemplatePool<TItem, TBinding extends IVirtualizedItemBinding<TItem>, TTemplate extends IVirtualizedItemTemplate<TItem, TBinding>> implements IDisposable {
	private readonly _unused = new Set<TTemplate>();
	private readonly _used = new Set<TTemplate>();

	constructor(private readonly _create: () => TTemplate) { }

	acquire(): IReference<TTemplate> {
		const template = this._unused.values().next().value ?? this._create();
		this._unused.delete(template);
		if (template.currentBinding.get()) {
			throw new BugIndicatingError('Cannot acquire a bound virtualized template');
		}
		this._used.add(template);
		let disposed = false;
		return {
			object: template,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				if (template.currentBinding.get()) {
					throw new BugIndicatingError('Cannot pool a virtualized template with a current binding');
				}
				this._used.delete(template);
				if (this._unused.size >= 5) {
					template.dispose();
				} else {
					this._unused.add(template);
				}
			},
		};
	}

	dispose(): void {
		for (const template of this._used) {
			template.dispose();
		}
		for (const template of this._unused) {
			template.dispose();
		}
		this._used.clear();
		this._unused.clear();
	}
}
