/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BreadcrumbsItem, BreadcrumbsWidget } from '../../../../browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Codicon } from '../../../../common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class TestBreadcrumbsItem extends BreadcrumbsItem {
	constructor(private readonly _id: string) {
		super();
	}

	override dispose(): void {
	}

	override equals(other: BreadcrumbsItem): boolean {
		return other instanceof TestBreadcrumbsItem && this._id === other._id;
	}

	override render(container: HTMLElement): void {
		container.textContent = this._id;
	}
}

suite('BreadcrumbsWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(itemOffsetLeft: number, initialScrollLeft: number): { widget: BreadcrumbsWidget; item: BreadcrumbsItem; getScrollLeft: () => number } {
		const container = document.createElement('div');
		const widget = store.add(new BreadcrumbsWidget(container, 3, undefined, Codicon.chevronRight, {
			breadcrumbsBackground: undefined,
			breadcrumbsForeground: undefined,
			breadcrumbsHoverForeground: undefined,
			breadcrumbsFocusForeground: undefined,
			breadcrumbsFocusAndSelectionForeground: undefined
		}));
		const items = [new TestBreadcrumbsItem('a'), new TestBreadcrumbsItem('b')];
		widget.setItems(items);

		const nodes = (widget as any)._nodes as HTMLElement[];
		Object.defineProperty(nodes[1], 'offsetLeft', { configurable: true, get: () => itemOffsetLeft });
		Object.defineProperty(nodes[1], 'offsetWidth', { configurable: true, get: () => 40 });

		let scrollLeft = initialScrollLeft;
		const scrollable = (widget as any)._scrollable;
		scrollable.getScrollDimensions = () => ({ width: 100 });
		scrollable.getScrollPosition = () => ({ scrollLeft });
		scrollable.setRevealOnScroll = () => { };
		scrollable.setScrollPosition = (position: { scrollLeft?: number }) => {
			scrollLeft = position.scrollLeft ?? scrollLeft;
		};

		return { widget, item: items[1], getScrollLeft: () => scrollLeft };
	}

	test('focus keeps minimal reveal behavior', () => {
		const { widget, item, getScrollLeft } = setup(80, 0);
		widget.setFocused(item);
		assert.strictEqual(getScrollLeft(), 0);
	});

	test('selection reveals fully', () => {
		const { widget, item, getScrollLeft } = setup(80, 0);
		widget.setSelection(item);
		assert.strictEqual(getScrollLeft(), 80);
	});
});
