/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../browser/dom.js';
import { BreadcrumbsItem, BreadcrumbsWidget, IBreadcrumbsWidgetStyles } from '../../../../browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { mainWindow } from '../../../../browser/window.js';
import { Codicon } from '../../../../common/codicons.js';
import { IDisposable, toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class TestBreadcrumbsItem extends BreadcrumbsItem {

	constructor(private readonly label: string) {
		super();
	}

	override dispose(): void { }

	override equals(other: BreadcrumbsItem): boolean {
		return other instanceof TestBreadcrumbsItem && other.label === this.label;
	}

	override render(container: HTMLElement): void {
		container.textContent = this.label;
	}
}

const styles: IBreadcrumbsWidgetStyles = {
	breadcrumbsBackground: undefined,
	breadcrumbsForeground: undefined,
	breadcrumbsFocusForeground: undefined,
	breadcrumbsFocusAndSelectionForeground: undefined,
	breadcrumbsHoverForeground: undefined,
};

suite('BreadcrumbsWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('defers non-focus reveals and cancels them when focus changes', () => {
		const operations: string[] = [];
		const measure = (_targetWindow: Window, _callback: () => void): IDisposable => {
			operations.push('schedule');
			return toDisposable(() => operations.push('cancel'));
		};
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(new BreadcrumbsWidget(container, 3, undefined, Codicon.chevronRight, styles, measure));
		const first = new TestBreadcrumbsItem('first');
		const last = new TestBreadcrumbsItem('last');
		widget.setItems([first, last]);

		widget.revealLast();
		widget.reveal(first);
		widget.domFocus();

		assert.deepStrictEqual(operations, ['schedule', 'cancel', 'schedule', 'cancel']);
	});

	test('applies the latest requested dimension when an earlier one is still pending', async () => {
		const nextFrames = async () => {
			for (let i = 0; i < 2; i++) {
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			}
		};
		const container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(new BreadcrumbsWidget(container, 3, undefined, Codicon.chevronRight, styles));
		const domNode = container.querySelector<HTMLElement>('.monaco-breadcrumbs')!;

		widget.layout(new Dimension(300, 22));
		await nextFrames();
		const initial = domNode.style.width;

		// A narrower layout is requested and superseded by the previous width before it applies.
		widget.layout(new Dimension(120, 22));
		widget.layout(new Dimension(300, 22));
		await nextFrames();

		assert.deepStrictEqual({ initial, restored: domNode.style.width }, { initial: '300px', restored: '300px' });
	});
});
