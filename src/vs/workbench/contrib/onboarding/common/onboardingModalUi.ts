/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

/**
 * Modal UI that onboarding never shows over: a dialog, showing or queued, or the Quick Input. An automatic
 * tour does not start while it is open, and a visible spotlight steps aside for it.
 *
 * The observables listen to the dialog and Quick Input services only while they are observed.
 */
export class OnboardingModalUi {

	/** Whether a dialog is showing or queued. */
	readonly dialogVisible: IObservable<boolean>;

	/** Whether the Quick Input is showing. */
	readonly quickInputVisible: IObservable<boolean>;

	/** Whether any modal UI is open. */
	readonly visible: IObservable<boolean>;

	constructor(dialogService: IDialogService, quickInputService: IQuickInputService) {
		this.dialogVisible = observableFromEvent(this, Event.any(dialogService.onWillShowDialog, dialogService.onDidShowDialog), () => dialogService.hasDialog);
		this.quickInputVisible = observableFromEvent(this, Event.any(quickInputService.onShow, quickInputService.onHide), () => !!quickInputService.currentQuickInput);
		this.visible = derived(this, reader => this.dialogVisible.read(reader) || this.quickInputVisible.read(reader));
	}
}
