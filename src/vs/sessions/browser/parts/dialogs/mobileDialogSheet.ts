/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { showMobileContentSheet } from '../mobile/mobilePickerSheet.js';

/** Monotonic seed for unique aria id wiring across concurrent sheets. */
let idSeed = 0;

/** A single action button rendered in the dialog sheet. */
export interface IMobileDialogSheetButton {
	/** Display label (already stripped of mnemonics). */
	readonly label: string;
	/** When true the button is styled as the secondary / safe action. */
	readonly isCancel: boolean;
}

export interface IMobileDialogSheetOptions {
	/** Sheet header title (single line). Usually a short category label. */
	readonly title: string;
	/** Primary message describing the action (wraps). */
	readonly message: string;
	/** Optional muted detail line beneath the message (wraps). */
	readonly detail?: string;
	/** Action buttons, in the dialog's canonical order (index is returned). */
	readonly buttons: readonly IMobileDialogSheetButton[];
	/** Index of the button to focus on open (typically the safe action). */
	readonly defaultButtonIndex: number;
	/** Optional checkbox row (e.g. "Do not ask me again"). */
	readonly checkbox?: { readonly label: string; readonly checked?: boolean };
}

export interface IMobileDialogSheetResult {
	/** Index of the chosen button, or the cancel index when dismissed. */
	readonly button: number;
	readonly checkboxChecked?: boolean;
}

/**
 * Render a generic confirmation / prompt as a native mobile bottom sheet.
 *
 * Maps the workbench dialog model (message + detail + ordered buttons +
 * optional checkbox) onto {@link showMobileContentSheet}: full-width stacked
 * buttons with 44px tap targets, the safe action styled secondary. Tapping a
 * button resolves with its index; dismissing the sheet (backdrop / Escape)
 * resolves with the cancel index (or -1 when the dialog has no cancel).
 *
 * Focus is moved into the sheet on open (defaulting to the safe action) and
 * restored to the previously focused element on close, mirroring the desktop
 * dialog's behavior.
 */
export async function showMobileDialogSheet(layoutService: IWorkbenchLayoutService, options: IMobileDialogSheetOptions): Promise<IMobileDialogSheetResult> {
	const cancelIndex = options.buttons.findIndex(button => button.isCancel);

	// Tracked across the whole interaction so both the dismiss path
	// (backdrop / Escape) and a button tap return the live values, not a
	// stale snapshot taken at click time.
	let chosenButton = cancelIndex;
	let checkboxChecked = options.checkbox?.checked;

	const previouslyFocused = getActiveElement();

	await showMobileContentSheet(
		layoutService.mainContainer,
		options.title,
		(body, api) => {
			const store = new DisposableStore();

			const id = `mobile-dialog-${++idSeed}`;
			const describedBy: string[] = [];

			const message = append(body, $('.mobile-content-sheet-message'));
			message.id = `${id}-message`;
			message.textContent = options.message;
			describedBy.push(message.id);

			if (options.detail) {
				const detail = append(body, $('.mobile-content-sheet-detail'));
				detail.id = `${id}-detail`;
				detail.textContent = options.detail;
				describedBy.push(detail.id);
			}

			// Associate the message / detail with the sheet's dialog element so
			// screen readers announce them when the sheet opens (the shell only
			// sets an aria-label from the title).
			body.closest('[role="dialog"]')?.setAttribute('aria-describedby', describedBy.join(' '));

			if (options.checkbox) {
				const row = append(body, $('label.mobile-content-sheet-checkbox'));
				const checkbox = append(row, $('input')) as HTMLInputElement;
				checkbox.type = 'checkbox';
				checkbox.checked = !!options.checkbox.checked;
				append(row, $('span')).textContent = options.checkbox.label;
				store.add(addDisposableListener(checkbox, 'change', () => { checkboxChecked = checkbox.checked; }));
			}

			const actions = append(body, $('.mobile-content-sheet-actions'));

			let buttonToFocus: Button | undefined;
			options.buttons.forEach((descriptor, index) => {
				const button = store.add(new Button(actions, { ...defaultButtonStyles, secondary: descriptor.isCancel }));
				button.label = descriptor.label;
				store.add(button.onDidClick(() => {
					chosenButton = index;
					api.close();
				}));
				if (index === options.defaultButtonIndex) {
					buttonToFocus = button;
				}
			});

			// Move focus into the modal sheet for keyboard / screen reader users.
			buttonToFocus?.focus();

			return store;
		},
		{ hideDoneButton: true },
	);

	if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
		previouslyFocused.focus();
	}

	return { button: chosenButton, checkboxChecked };
}

