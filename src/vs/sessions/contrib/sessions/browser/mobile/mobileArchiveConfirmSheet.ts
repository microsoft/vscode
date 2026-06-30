/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { showMobileContentSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

export interface IMobileArchiveConfirmOptions {
	/** Sheet header title (single line). */
	readonly title: string;
	/** Bold message describing the scope of the action (wraps). */
	readonly message: string;
	/** Muted detail line beneath the message (wraps). */
	readonly detail: string;
	/** Label for the primary, destructive action button. */
	readonly primaryLabel: string;
}

/**
 * Phone-only confirmation for a destructive "Mark All as Done" bulk action.
 * Presents a native bottom sheet (matching the other Agents-window mobile
 * surfaces) with an explicit, full-width destructive action and Cancel,
 * instead of squeezing the desktop modal dialog onto a phone.
 *
 * Resolves `true` only when the user taps the destructive action; any other
 * dismissal (Cancel, backdrop tap, Escape) resolves `false`.
 *
 * Unlike the desktop dialog, the sheet intentionally omits the "Do not ask
 * me again" opt-out: the persisted skip flag is shared across layouts, and
 * letting a mis-tap permanently disable confirmation for a destructive bulk
 * action is exactly the footgun this mobile treatment avoids.
 */
export async function confirmArchiveOnPhone(layoutService: IWorkbenchLayoutService, options: IMobileArchiveConfirmOptions): Promise<boolean> {
	let confirmed = false;

	// Remember what had focus so we can restore it when the sheet closes,
	// mirroring `IDialogService.confirm`'s focus handling.
	const previouslyFocused = getActiveElement();

	await showMobileContentSheet(
		layoutService.mainContainer,
		options.title,
		(body, api) => {
			const store = new DisposableStore();

			const message = append(body, $('.mobile-content-sheet-message'));
			message.textContent = options.message;

			const detail = append(body, $('.mobile-content-sheet-detail'));
			detail.textContent = options.detail;

			const actions = append(body, $('.mobile-content-sheet-actions'));

			const archiveButton = store.add(new Button(actions, { ...defaultButtonStyles }));
			archiveButton.label = options.primaryLabel;
			store.add(archiveButton.onDidClick(() => {
				confirmed = true;
				api.close();
			}));

			const cancelButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
			cancelButton.label = localize('mobileArchiveConfirm.cancel', "Cancel");
			store.add(cancelButton.onDidClick(() => {
				confirmed = false;
				api.close();
			}));

			// Move focus into the modal sheet for keyboard / screen reader
			// users, defaulting to the safe action so an accidental Enter
			// cancels rather than performing the destructive action.
			cancelButton.focus();

			return store;
		},
		{ hideDoneButton: true },
	);

	if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
		previouslyFocused.focus();
	}

	return confirmed;
}
