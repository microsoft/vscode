/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IErdosModalDialogsService, IModalDialogPromptInstance, ShowConfirmationModalDialogOptions } from '../common/erdosModalDialogs.js';

/**
 * Simple implementation of modal dialog prompt instance
 */
class ModalDialogPromptInstance extends Disposable implements IModalDialogPromptInstance {
	private readonly _onChoice = this._register(new Emitter<boolean>());
	readonly onChoice: Event<boolean> = this._onChoice.event;

	constructor(promise: Promise<boolean>) {
		super();
		
		// Forward the promise result to the event
		promise.then(result => {
			this._onChoice.fire(result);
		}).catch(() => {
			this._onChoice.fire(false);
		});
	}

	close(): void {
		// Fire false to indicate cancellation
		this._onChoice.fire(false);
	}
}

/**
 * Erdos Modal Dialogs Service implementation.
 * Uses VSCode's native dialog service as a fallback implementation.
 */
export class ErdosModalDialogsService extends Disposable implements IErdosModalDialogsService {
	
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();
	}

	showConfirmationModalDialog(options: ShowConfirmationModalDialogOptions): void {
		// Use VSCode's dialog service for confirmation
		this.dialogService.confirm({
			message: options.message,
			detail: options.title,
			primaryButton: options.okButtonTitle || 'OK',
			cancelButton: options.cancelButtonTitle || 'Cancel'
		}).then(result => {
			if (result.confirmed) {
				options.action().catch(() => {
					// Handle action errors silently
				});
			}
		});
	}

	showModalDialogPrompt(
		title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string
	): IModalDialogPromptInstance {
		const promise = this.dialogService.confirm({
			message: message,
			detail: title,
			primaryButton: okButtonTitle || 'OK',
			cancelButton: cancelButtonTitle || 'Cancel'
		}).then(result => result.confirmed);

		return new ModalDialogPromptInstance(promise);
	}

	async showSimpleModalDialogPrompt(
		title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string
	): Promise<boolean> {
		const result = await this.dialogService.confirm({
			message: message,
			detail: title,
			primaryButton: okButtonTitle || 'OK',
			cancelButton: cancelButtonTitle || 'Cancel'
		});
		return result.confirmed;
	}

	async showSimpleModalDialogMessage(
		title: string,
		message: string,
		okButtonTitle?: string
	): Promise<null> {
		await this.dialogService.info(message, title);
		return null;
	}
}
