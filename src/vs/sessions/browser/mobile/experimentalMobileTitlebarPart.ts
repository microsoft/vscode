/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType, getActiveElement, isHTMLElement } from '../../../base/browser/dom.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { SideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { IsNewChatSessionContext } from '../../common/contextkeys.js';
import { MobileTitlebarPart } from '../parts/mobile/mobileTitlebarPart.js';

/** Title and account-sheet presentation for the experimental mobile workbench. */
export class ExperimentalMobileTitlebarPart extends MobileTitlebarPart {

	protected override registerTitleListener(): void {
		const titleKeys = new Set([IsNewChatSessionContext.key, SideBarVisibleContext.key]);
		const titleContext = observableSignalFromEvent(this, Event.filter(this.contextKeyService.onDidChangeContext, event => event.affectsSome(titleKeys)));
		this._register(autorun(reader => {
			titleContext.read(reader);
			const session = this.sessionsService.activeSession.read(reader);
			const title = session?.title.read(reader);
			if (SideBarVisibleContext.getValue(this.contextKeyService)) {
				this.setTitle(localize('mobileTopBar.sessions', "Sessions"));
			} else if (IsNewChatSessionContext.getValue(this.contextKeyService)) {
				this.setTitle(localize('mobileTopBar.home', "Agents"));
			} else {
				this.setTitle(title || localize('mobileTopBar.newSession', "New Session"));
			}
		}));
	}

	protected override createAccountSheet(panelStore: DisposableStore, closeSheet: () => void): { sheet: HTMLElement; closeButton: HTMLButtonElement; registerAction?: (button: HTMLButtonElement) => void } {
		const opener = getActiveElement();
		const result = super.createAccountSheet(panelStore, closeSheet);
		const { sheet, closeButton } = result;
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('tabindex', '-1');
		sheet.setAttribute('aria-label', localize('mobileAccount.title', "Account"));
		panelStore.add(toDisposable(() => {
			if (isHTMLElement(opener) && opener.isConnected) {
				opener.focus();
			}
		}));
		let lastFocusTarget: HTMLElement = closeButton;
		panelStore.add(addDisposableListener(sheet, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				EventHelper.stop(event, true);
				closeSheet();
				return;
			}
			if (event.key !== 'Tab') {
				return;
			}
			if (event.shiftKey && (event.target === closeButton || event.target === sheet)) {
				EventHelper.stop(event, true);
				lastFocusTarget.focus();
			} else if (!event.shiftKey && event.target === lastFocusTarget) {
				EventHelper.stop(event, true);
				closeButton.focus();
			}
		}));
		closeButton.focus();
		return {
			...result,
			registerAction: button => {
				if (!button.disabled) {
					lastFocusTarget = button;
				}
			},
		};
	}
}
