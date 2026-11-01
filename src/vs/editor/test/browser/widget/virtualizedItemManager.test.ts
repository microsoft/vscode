/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ICompressedVirtualizedScrollViewContext } from '../../../browser/widget/multiDiffEditor/compressedVirtualizedScrollView.js';
import { IVirtualizedItemBindingContext, VirtualizedItemBinding, VirtualizedItemManager, VirtualizedItemTemplate } from '../../../browser/widget/multiDiffEditor/virtualizedItemManager.js';

suite('VirtualizedItemManager', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('strictly transfers a pooled template between typed bindings', () => {
		const itemA = new TestItem('a', 100);
		const itemB = new TestItem('b', 200);
		const items = observableValue<readonly TestItem[]>('items', [itemA, itemB]);
		const templates: TestTemplate[] = [];
		const manager = disposables.add(new VirtualizedItemManager<TestItem, TestBinding, TestTemplate>(items, createContext(), {
			getId: item => item.id,
			getTemplateId: () => 'test',
			getUnboundSize: item => item.size,
			createTemplate: () => {
				const template = new TestTemplate();
				templates.push(template);
				return template;
			},
		}));
		const [virtualA, virtualB] = manager.virtualizedItems.get();
		const range = new OffsetRange(0, 100);

		virtualA.render(range, 0, 800, range);
		const bindingA = virtualA.binding.get()!;
		assert.throws(() => templates[0].bind(itemB, {
			initialSize: itemB.size.get(),
			runWithScrollAnchor: () => { },
		}));
		virtualA.hide();
		virtualB.render(range, 0, 800, range);
		const bindingB = virtualB.binding.get()!;

		assert.deepStrictEqual({
			templateCount: templates.length,
			firstBindingItem: bindingA.item.id,
			firstBindingDisposed: bindingA.didDispose,
			currentBindingItem: templates[0].currentBinding.get()?.item.id,
			secondBindingItem: bindingB.item.id,
			virtualASize: virtualA.size.get(),
			virtualBSize: virtualB.size.get(),
		}, {
			templateCount: 1,
			firstBindingItem: 'a',
			firstBindingDisposed: true,
			currentBindingItem: 'b',
			secondBindingItem: 'b',
			virtualASize: 100,
			virtualBSize: 200,
		});
	});

	test('uses separate pools for different template IDs', () => {
		const itemA = new TestItem('a', 100, 'text');
		const itemB = new TestItem('b', 200, 'image');
		const createdTemplateIds: string[] = [];
		const manager = disposables.add(new VirtualizedItemManager<TestItem, TestBinding, TestTemplate>(constObservable([itemA, itemB]), createContext(), {
			getId: item => item.id,
			getTemplateId: item => item.templateId,
			getUnboundSize: item => item.size,
			createTemplate: templateId => {
				createdTemplateIds.push(templateId);
				return new TestTemplate();
			},
		}));
		const range = new OffsetRange(0, 100);
		for (const item of manager.virtualizedItems.get()) {
			item.render(range, 0, 800, range);
		}

		assert.deepStrictEqual(createdTemplateIds, ['text', 'image']);
	});

	test('preserves a new binding when unbinding triggers synchronous template reuse', () => {
		const template = disposables.add(new TestTemplate());
		const context = { initialSize: 100, runWithScrollAnchor: () => { } };
		const bindingA = template.bind(new TestItem('a', 100), context);
		let bindingB: TestBinding | undefined;
		disposables.add(autorun(reader => {
			if (!template.currentBinding.read(reader) && !bindingB) {
				bindingB = template.bind(new TestItem('b', 100), context);
			}
		}));
		bindingA.dispose();
		const currentItem = template.currentBinding.get()?.item.id;
		bindingA.dispose();
		bindingB!.dispose();

		assert.deepStrictEqual({
			currentItem,
			firstDisposed: bindingA.didDispose,
			secondDisposed: bindingB!.didDispose,
			currentBinding: template.currentBinding.get(),
		}, {
			currentItem: 'b',
			firstDisposed: true,
			secondDisposed: true,
			currentBinding: undefined,
		});
	});

	test('manager disposal releases both active and idle templates', () => {
		const templates: TestTemplate[] = [];
		const manager = disposables.add(new VirtualizedItemManager<TestItem, TestBinding, TestTemplate>(
			constObservable([new TestItem('a', 100), new TestItem('b', 100)]), createContext(), {
			getId: item => item.id,
			getTemplateId: () => 'test',
			getUnboundSize: item => item.size,
			createTemplate: () => {
				const template = new TestTemplate();
				templates.push(template);
				return template;
			},
		}));
		const [itemA, itemB] = manager.virtualizedItems.get();
		const range = new OffsetRange(0, 100);
		itemA.render(range, 0, 800, range);
		itemB.render(range, 0, 800, range);
		const bindings = [itemA.binding.get()!, itemB.binding.get()!];
		itemA.hide();
		manager.dispose();
		manager.dispose();

		assert.deepStrictEqual({
			bindingsDisposed: bindings.map(binding => binding.didDispose),
			templates: templates.map(template => ({
				disposed: template.isDisposed,
				currentBinding: template.currentBinding.get(),
			})),
		}, {
			bindingsDisposed: [true, true],
			templates: [
				{ disposed: true, currentBinding: undefined },
				{ disposed: true, currentBinding: undefined },
			],
		});
	});

	function captureDisposedBinding(template: TestTemplate) {
		const item = new TestItem('a', 100);
		const binding = template.bind(item, { initialSize: 100, runWithScrollAnchor: () => { } });
		binding.dispose();
		return { item: new WeakRef(item), binding: new WeakRef(binding) };
	}

	test('idle templates allow previous bindings and items to be collected after repeated reuse', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip();
		}
		const template = disposables.add(new TestTemplate());
		const captured = Array.from({ length: 20 }, () => captureDisposedBinding(template));
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });

		assert.deepStrictEqual({
			currentBinding: template.currentBinding.get(),
			retainedBindings: captured.filter(ref => ref.binding.deref() !== undefined).length,
			retainedItems: captured.filter(ref => ref.item.deref() !== undefined).length,
		}, {
			currentBinding: undefined,
			retainedBindings: 0,
			retainedItems: 0,
		});
	});

	test('isolates a failed binding without changing cached layout state', () => {
		const itemA = new TestItem('a', 100);
		const itemB = new TestItem('b', 200);
		const bindingAttempts: string[] = [];
		const errors: string[] = [];
		const manager = disposables.add(new VirtualizedItemManager<TestItem, TestBinding, TestTemplate>(constObservable([itemA, itemB]), createContext(), {
			getId: item => item.id,
			getTemplateId: () => 'test',
			getUnboundSize: item => item.size,
			createTemplate: () => new TestTemplate(bindingAttempts, 'a'),
		}));
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error.message));
		try {
			const [virtualA, virtualB] = manager.virtualizedItems.get();
			const range = new OffsetRange(0, 100);
			virtualA.render(range, 0, 800, range);
			virtualA.render(range, 0, 800, range);
			virtualB.render(range, 0, 800, range);

			assert.deepStrictEqual({
				bindingAttempts,
				errors,
				virtualABinding: virtualA.binding.get(),
				virtualASize: virtualA.size.get(),
				virtualBBindingItem: virtualB.binding.get()?.item.id,
			}, {
				bindingAttempts: ['a', 'b'],
				errors: ['Failed to bind a'],
				virtualABinding: undefined,
				virtualASize: 100,
				virtualBBindingItem: 'b',
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});
});

class TestItem {
	readonly size;

	constructor(
		readonly id: string,
		size: number,
		readonly templateId = 'test',
	) {
		this.size = observableValue(this, size);
	}
}

class TestBinding extends VirtualizedItemBinding<TestItem> {
	readonly size = this.item.size;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }> = constObservable({ maxScroll: 0 });
	readonly shouldKeepAlive = constObservable(false);
	didDispose = false;

	constructor(
		item: TestItem,
		private readonly _template: TestTemplate,
	) {
		super(item);
	}

	render(_renderedRange: OffsetRange, _scrollOffset: number, _width: number, _renderedViewport: OffsetRange): void { }

	hide(): void { }

	override dispose(): void {
		if (this.didDispose) {
			return;
		}
		this.didDispose = true;
		this._template.unbind(this);
		super.dispose();
	}
}

class TestTemplate extends VirtualizedItemTemplate<TestItem, TestBinding> {
	get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	constructor(
		private readonly _bindingAttempts?: string[],
		private readonly _itemToFail?: string,
	) {
		super();
	}

	protected createBinding(item: TestItem, _context: IVirtualizedItemBindingContext): TestBinding {
		this._bindingAttempts?.push(item.id);
		if (item.id === this._itemToFail) {
			throw new Error(`Failed to bind ${item.id}`);
		}
		return new TestBinding(item, this);
	}

	unbind(binding: TestBinding): void {
		if (this.currentBinding.get() !== binding) {
			throw new Error('Binding does not own this template');
		}
	}
}

function createContext(): ICompressedVirtualizedScrollViewContext {
	return {
		contentDomNode: document.createElement('div'),
		overflowWidgetsDomNode: document.createElement('div'),
		scrollLeft: constObservable(0),
	};
}
