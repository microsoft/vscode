/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
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
