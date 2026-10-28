/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AnchorPosition, IContextViewProvider, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
import { ISelectOptionItem, unthemedSelectBoxStyles } from '../../../../browser/ui/selectBox/selectBox.js';
import { SelectBoxList } from '../../../../browser/ui/selectBox/selectBoxCustom.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class TestContextViewProvider extends Disposable implements IContextViewProvider {

	readonly container = document.createElement('div');

	private readonly view = this._register(new MutableDisposable<IDisposable>());
	private delegate: IDelegate | undefined;

	get activeLayer(): number | undefined {
		return this.delegate?.layer;
	}

	get anchorPosition(): AnchorPosition | undefined {
		return this.delegate?.anchorPosition;
	}

	constructor() {
		super();
		document.body.appendChild(this.container);
		this._register(toDisposable(() => this.container.remove()));
	}

	showContextView(delegate: IDelegate): void {
		this.view.clear();
		this.container.replaceChildren();
		this.delegate = delegate;
		this.view.value = delegate.render(this.container) ?? undefined;
		delegate.layout?.();
	}

	hideContextView(): void {
		this.view.clear();
		this.delegate?.onHide?.();
		this.delegate = undefined;
	}

	layout(): void {
		this.delegate?.layout?.();
	}
}

suite('SelectBoxList', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const { name, anchorPosition, top, count, expected } of [
		{ name: 'defaults to below', anchorPosition: undefined, top: '50%', count: 10, expected: AnchorPosition.BELOW },
		{ name: 'honors below preference', anchorPosition: AnchorPosition.BELOW, top: '50%', count: 10, expected: AnchorPosition.BELOW },
		{ name: 'honors above preference', anchorPosition: AnchorPosition.ABOVE, top: '50%', count: 10, expected: AnchorPosition.ABOVE },
		{ name: 'flips above when space below is limited', anchorPosition: undefined, top: 'calc(100% - 100px)', count: 10, expected: AnchorPosition.ABOVE },
		{ name: 'flips below when space above is limited', anchorPosition: AnchorPosition.ABOVE, top: '30px', count: 10, expected: AnchorPosition.BELOW },
		{ name: 'stays above when a short list fits', anchorPosition: AnchorPosition.ABOVE, top: '30px', count: 1, expected: AnchorPosition.ABOVE },
		{ name: 'stays below when a short list fits', anchorPosition: undefined, top: 'calc(100% - 100px)', count: 1, expected: AnchorPosition.BELOW },
	]) {
		test(name, () => {
			const contextViewProvider = disposables.add(new TestContextViewProvider());
			const selectBox = disposables.add(new SelectBoxList(
				Array.from({ length: count }, (_, index) => ({ text: `Option ${index}` })),
				0,
				contextViewProvider,
				unthemedSelectBoxStyles,
				{ anchorPosition },
			));
			const container = document.createElement('div');
			container.style.position = 'fixed';
			container.style.top = top;
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			selectBox.render(container);
			const select = container.querySelector('select')!;
			select.click();
			const initialPosition = contextViewProvider.anchorPosition;
			const expanded = select.getAttribute('aria-expanded');
			document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			const closed = {
				expanded: select.getAttribute('aria-expanded'),
				focused: document.activeElement === select,
				selected: select.selectedIndex,
			};
			container.style.top = '50%';
			select.click();
			assert.deepStrictEqual({
				initialPosition, expanded, closed,
				reopenedPosition: contextViewProvider.anchorPosition,
			}, {
				initialPosition: expected,
				expanded: 'true',
				closed: { expanded: 'false', focused: true, selected: 0 },
				reopenedPosition: anchorPosition ?? AnchorPosition.BELOW,
			});
		});
	}

	test('hides disabled options from the custom dropdown while retaining the closed value', () => {
		const options: ISelectOptionItem[] = [
			{ text: 'Pick an option', isDisabled: true },
			{ text: 'None', description: 'Do not show external sessions.' },
			{ text: 'All', description: 'Show all external sessions.' },
		];
		const contextViewProvider = disposables.add(new TestContextViewProvider());
		const selectBox = disposables.add(new SelectBoxList(
			options,
			0,
			contextViewProvider,
			unthemedSelectBoxStyles,
			{ hideDisabledOptions: true, showOptionDescriptionHovers: true }
		));
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.top = '100px';
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		selectBox.render(container);
		const closedText = container.querySelector('select')?.selectedOptions[0]?.text;
		container.querySelector('select')?.click();
		const openText = container.querySelector('select')?.selectedOptions[0]?.text;
		const optionTexts = Array.from(contextViewProvider.container.querySelectorAll('.option-text'), element => element.textContent);
		const detailsDisplay = contextViewProvider.container.querySelector<HTMLElement>('.select-box-details-pane')?.style.display;
		container.querySelector('select')?.click();

		assert.deepStrictEqual({
			closedText,
			openText,
			optionTexts,
			detailsDisplay,
			cancelledText: container.querySelector('select')?.selectedOptions[0]?.text,
		}, {
			closedText: 'Pick an option',
			openText: 'None',
			optionTexts: ['None', 'All'],
			detailsDisplay: 'none',
			cancelledText: 'Pick an option',
		});
	});

	for (const { name, top, anchorPosition, count, expectedHeight, expectedPosition } of [
		{ name: 'caps upward lists at six options', top: '50%', anchorPosition: AnchorPosition.ABOVE, count: 96, expectedHeight: 132, expectedPosition: AnchorPosition.ABOVE },
		{ name: 'caps downward lists at six options', top: '50%', anchorPosition: AnchorPosition.BELOW, count: 96, expectedHeight: 132, expectedPosition: AnchorPosition.BELOW },
		{ name: 'keeps the cap when falling back within the viewport', top: '30px', anchorPosition: AnchorPosition.ABOVE, count: 96, expectedHeight: 132, expectedPosition: AnchorPosition.BELOW },
		{ name: 'does not pad short lists to the cap', top: '50%', anchorPosition: AnchorPosition.ABOVE, count: 4, expectedHeight: 88, expectedPosition: AnchorPosition.ABOVE },
	]) {
		test(name, () => {
			const contextViewProvider = disposables.add(new TestContextViewProvider());
			const container = document.createElement('div');
			container.style.cssText = `position: fixed; top: ${top}; width: 150px;`;
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const selectBox = disposables.add(new SelectBoxList(
				Array.from({ length: count }, (_, index) => ({ text: `Option ${index}` })),
				0,
				contextViewProvider,
				unthemedSelectBoxStyles,
				{ anchorPosition, maxVisibleOptions: 6 },
			));
			selectBox.render(container);
			const select = container.querySelector('select')!;
			select.click();
			const position = contextViewProvider.anchorPosition;
			const list = contextViewProvider.container.querySelector<HTMLElement>('[role="listbox"]')!;
			const popup = contextViewProvider.container.querySelector<HTMLElement>('.monaco-select-box-dropdown-container')!;
			const sizes = { list: list.clientHeight, popup: popup.clientHeight };
			list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', keyCode: 35, bubbles: true }));
			const focusedRow = list.querySelector<HTMLElement>('.monaco-list-row.focused')!;
			const rowBounds = focusedRow.getBoundingClientRect();
			const listBounds = list.getBoundingClientRect();
			const lastOptionVisible = rowBounds.top >= listBounds.top && rowBounds.bottom <= listBounds.bottom;
			list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			assert.deepStrictEqual({
				position, sizes, lastOptionVisible,
				selected: select.selectedIndex,
				expanded: select.getAttribute('aria-expanded'),
				focused: document.activeElement === select,
			}, {
				position: expectedPosition,
				sizes: { list: expectedHeight, popup: expectedHeight },
				lastOptionVisible: true,
				selected: count - 1,
				expanded: 'false',
				focused: true,
			});
		});
	}

	test('passes the requested context view layer to the dropdown', () => {
		const contextViewProvider = disposables.add(new TestContextViewProvider());
		const selectBox = disposables.add(new SelectBoxList(
			[{ text: 'One' }, { text: 'Two' }],
			0,
			contextViewProvider,
			unthemedSelectBoxStyles,
			{ contextViewLayer: 1 }
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		selectBox.render(container);
		container.querySelector('select')?.click();

		assert.strictEqual(contextViewProvider.activeLayer, 1);
	});
});
