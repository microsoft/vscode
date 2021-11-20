/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export class CellDecorations extends Disposable {
	constructor(
		rootContainer: HTMLElement,
		decorationContainer: HTMLElement,
		element: ICellViewModel
	) {
		super();

		const removedClassNames: string[] = [];
		rootContainer.classList.forEach(className => {
			if (/^nb\-.*$/.test(className)) {
				removedClassNames.push(className);
			}
		});

		removedClassNames.forEach(className => {
			rootContainer.classList.remove(className);
		});

		decorationContainer.innerText = '';

		const generateCellTopDecorations = () => {
			decorationContainer.innerText = '';

			element.getCellDecorations().filter(options => options.topClassName !== undefined).forEach(options => {
				decorationContainer.append(DOM.$(`.${options.topClassName!}`));
			});
		};

		this._register(element.onCellDecorationsChanged((e) => {
			const modified = e.added.find(e => e.topClassName) || e.removed.find(e => e.topClassName);

			if (modified) {
				generateCellTopDecorations();
			}
		}));

		generateCellTopDecorations();
	}
}
