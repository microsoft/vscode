/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BreadcrumbsItem, BreadcrumbsWidget } from '../../../../browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { ScrollbarVisibility } from '../../../../common/scrollable.js';
import { Codicon } from '../../../../common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('BreadcrumbsWidget', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('revealLast avoids redundant scroll update when aligned', function () {
		class TestBreadcrumbItem extends BreadcrumbsItem {
			constructor(private readonly value: string) {
				super();
			}

			override render(container: HTMLElement): void {
				container.textContent = this.value;
			}

			override equals(other: BreadcrumbsItem): boolean {
				return other instanceof TestBreadcrumbItem && other.value === this.value;
			}

			override dispose(): void {
				// noop
			}
		}

		const widget = store.add(new BreadcrumbsWidget(
			document.createElement('div'),
			10,
			ScrollbarVisibility.Auto,
			Codicon.chevronRight,
			{
				breadcrumbsBackground: undefined,
				breadcrumbsForeground: undefined,
				breadcrumbsHoverForeground: undefined,
				breadcrumbsFocusForeground: undefined,
				breadcrumbsFocusAndSelectionForeground: undefined
			}
		));

		widget.setItems([new TestBreadcrumbItem('one'), new TestBreadcrumbItem('two')]);

		const widgetWithInternals = widget as unknown as {
			_nodes: HTMLDivElement[];
			_scrollable: {
				getScrollDimensions: () => { width: number };
				getScrollPosition: () => { scrollLeft: number };
				setScrollPosition: (position: { scrollLeft: number }) => void;
				setRevealOnScroll: (value: boolean) => void;
			};
		};
		let setScrollPositionCallCount = 0;
		let revealOnScrollCallCount = 0;
		let scrollLeft = 40;
		const lastNode = widgetWithInternals._nodes[widgetWithInternals._nodes.length - 1];
		Object.defineProperty(lastNode, 'offsetLeft', { value: scrollLeft });
		widgetWithInternals._scrollable.getScrollDimensions = () => ({ width: 100 });
		widgetWithInternals._scrollable.getScrollPosition = () => ({ scrollLeft });
		widgetWithInternals._scrollable.setScrollPosition = position => {
			setScrollPositionCallCount++;
			scrollLeft = position.scrollLeft;
		};
		widgetWithInternals._scrollable.setRevealOnScroll = () => {
			revealOnScrollCallCount++;
		};

		widget.revealLast();

		assert.strictEqual(setScrollPositionCallCount, 0);
		assert.strictEqual(revealOnScrollCallCount, 0);
	});
});
