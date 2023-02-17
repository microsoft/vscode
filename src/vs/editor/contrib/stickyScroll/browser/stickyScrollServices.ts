/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollController';

export interface IStickyScrollFocusService {
	focus(editor: ICodeEditor | null): void;
}

export class StickyScrollFocusService {

	focused: boolean;

	constructor() {
		this.focused = false;
	}

	focus(editor: ICodeEditor | null): void {
		if (!editor) {
			return;
		}
		this.focused = true;
		const stickyScrollController = StickyScrollController.get(editor);
		if (stickyScrollController) {
			stickyScrollController.focus();
		}
	}
}

export const IStickyScrollFocusService = createDecorator<IStickyScrollFocusService>('IStickyScrollFocusService');
registerSingleton(IStickyScrollFocusService, StickyScrollFocusService, InstantiationType.Eager);

