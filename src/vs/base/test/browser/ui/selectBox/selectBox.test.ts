/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextViewProvider, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
import { ISelectOptionItem, unthemedSelectBoxStyles } from '../../../../browser/ui/selectBox/selectBox.js';
import { SelectBoxList } from '../../../../browser/ui/selectBox/selectBoxCustom.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class TestContextViewProvider extends Disposable implements IContextViewProvider {

	readonly container = document.createElement('div');

	private readonly view = this._register(new MutableDisposable<IDisposable>());
	private delegate: IDelegate | undefined;

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
});
