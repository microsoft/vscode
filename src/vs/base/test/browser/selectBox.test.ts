/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextViewProvider } from '../../browser/ui/contextview/contextview.js';
import { SelectBox, unthemedSelectBoxStyles } from '../../browser/ui/selectBox/selectBox.js';
import { ThemeIcon } from '../../common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('SelectBox', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders option icons in the custom dropdown', () => {
		const host = document.createElement('div');
		host.style.width = '240px';
		document.body.appendChild(host);

		const renderedContainers: HTMLElement[] = [];
		const contextViewProvider: IContextViewProvider = {
			showContextView: delegate => {
				const container = document.createElement('div');
				renderedContainers.push(container);
				document.body.appendChild(container);
				delegate.render(container);
			},
			hideContextView: () => {
				while (renderedContainers.length) {
					renderedContainers.pop()!.remove();
				}
			},
			layout: () => { }
		};

		const selectBox = store.add(new SelectBox([{
			text: 'Fast',
			icon: ThemeIcon.fromId('zap')
		}], 0, contextViewProvider, unthemedSelectBoxStyles, { useCustomDrawn: true }));
		selectBox.render(host);

		host.querySelector('select')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		assert.ok(document.querySelector('.option-icon.codicon.codicon-zap'));

		host.remove();
		contextViewProvider.hideContextView();
	});
});
