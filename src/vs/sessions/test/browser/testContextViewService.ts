/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveElement } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../platform/contextview/browser/contextView.js';

/** Renders context views into the document so the real submenu `Menu` can be driven. */
export class TestContextViewService extends mock<IContextViewService>() {

	private current: { readonly delegate: IContextViewDelegate; readonly container: HTMLElement; readonly rendered: IDisposable } | undefined;

	get openSubmenu(): { items: (string | null)[]; focused: boolean } | undefined {
		if (!this.current) {
			return undefined;
		}
		const container = this.current.container;
		return {
			items: [...container.querySelectorAll('.action-item .action-label')].map(label => label.textContent),
			focused: container.contains(getActiveElement()),
		};
	}

	get container(): HTMLElement | undefined {
		return this.current?.container;
	}

	/** The open context view's delegate, for checking where it asks to be placed. */
	get delegate(): IContextViewDelegate | undefined {
		return this.current?.delegate;
	}

	override showContextView(delegate: IContextViewDelegate): IOpenContextView {
		this.hideContextView();
		const container = append(mainWindow.document.body, $('.test-context-view'));
		const rendered = delegate.render(container);
		this.current = { delegate, container, rendered };
		delegate.focus?.();
		return {
			close: () => {
				if (this.current?.delegate === delegate) {
					this.hideContextView();
				}
			}
		};
	}

	override hideContextView(): void {
		const current = this.current;
		if (!current) {
			return;
		}
		this.current = undefined;
		// Like the real context view: `onHide` runs while the rendered content is still attached.
		current.delegate.onHide?.();
		current.rendered.dispose();
		current.container.remove();
	}
}
