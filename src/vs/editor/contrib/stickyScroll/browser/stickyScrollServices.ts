/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStickyScrollController, StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollController';

export interface IStickyScrollFocusService {
	focus(editor: ICodeEditor | null): void;
	focusNext(): void;
	focusPrevious(): void;
	goToFocused(): void;
	cancelFocus(): void;
}

export class StickyScrollFocusService {

	stickyScrollController: IStickyScrollController | undefined;

	constructor() { }

	focus(editor: ICodeEditor | null): void {
		if (!editor) {
			return;
		}
		const stickyScrollController = StickyScrollController.get(editor);
		if (stickyScrollController) {
			this.stickyScrollController = stickyScrollController;
			this.stickyScrollController.focus();
		}
	}

	focusNext(): void {
		if (this.stickyScrollController) {
			this.stickyScrollController.focusNext();
		}
	}

	focusPrevious(): void {
		if (this.stickyScrollController) {
			this.stickyScrollController.focusPrevious();
		}
	}

	goToFocused(): void {
		if (this.stickyScrollController) {
			this.stickyScrollController.goToFocused();
		}
	}

	cancelFocus(): void {
		if (this.stickyScrollController) {
			this.stickyScrollController.cancelFocus();
		}
	}
}

export const IStickyScrollFocusService = createDecorator<IStickyScrollFocusService>('IStickyScrollFocusService');
registerSingleton(IStickyScrollFocusService, StickyScrollFocusService, InstantiationType.Eager);

