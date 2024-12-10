/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from './viewlet';
import { Code } from './code';

export class Explorer extends Viewlet {

	private static readonly EXPLORER_VIEWLET = 'div[id="workbench.view.explorer"]';
	private static readonly OPEN_EDITORS_VIEW = `${Explorer.EXPLORER_VIEWLET} .split-view-view:nth-child(1) .title`;

	constructor(code: Code) {
		super(code);
	}

	async openExplorerView(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+shift+e');
		} else {
			await this.code.dispatchKeybinding('ctrl+shift+e');
		}
	}

	async waitForOpenEditorsViewTitle(fn: (title: string) => boolean): Promise<void> {
		await this.code.waitForTextContent(Explorer.OPEN_EDITORS_VIEW, undefined, fn);
	}

	getExtensionSelector(fileName: string): string {
		const extension = fileName.split('.')[1];
		if (extension === 'js') {
			return 'js-ext-file-icon ext-file-icon javascript-lang-file-icon';
		} else if (extension === 'json') {
			return 'json-ext-file-icon ext-file-icon json-lang-file-icon';
		} else if (extension === 'md') {
			return 'md-ext-file-icon ext-file-icon markdown-lang-file-icon';
		}
		throw new Error('No class defined for this file extension');
	}

}
