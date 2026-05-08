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

	test('revealLast uses minimal reveal', function () {
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

		let minimalParamValue: boolean | undefined;
		const widgetWithReveal = widget as unknown as { _reveal: (nth: number, minimal: boolean) => void };
		widgetWithReveal._reveal = (_nth: number, minimal: boolean) => {
			minimalParamValue = minimal;
		};

		widget.revealLast();

		assert.strictEqual(minimalParamValue, true);
	});
});
