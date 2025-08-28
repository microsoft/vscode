/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IErdosDialogService, DialogOptions, DialogResult } from '../../../services/erdosDialogs/common/erdosDialogs.js';

/**
 * Erdos Dialog Service implementation.
 * Uses VSCode's native dialog and notification services instead of custom modals.
 * This approach integrates better with the platform and avoids UI complexity.
 */
export class ErdosDialogService extends Disposable implements IErdosDialogService {
	
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}

	async showConfirmationDialog(options: DialogOptions): Promise<DialogResult> {
		const result = await this.dialogService.confirm({
			message: options.message,
			detail: options.detail,
			primaryButton: options.primaryButton || 'OK',
			cancelButton: options.cancelButton || 'Cancel',
			type: 'question'
		});

		return {
			confirmed: result.confirmed,
			checkboxChecked: result.checkboxChecked
		};
	}

	async showInformationDialog(options: DialogOptions): Promise<void> {
		await this.dialogService.info(options.message, options.detail);
	}

	async showWarningDialog(options: DialogOptions): Promise<void> {
		await this.dialogService.warn(options.message, options.detail);
	}

	async showErrorDialog(options: DialogOptions): Promise<void> {
		await this.dialogService.error(options.message, options.detail);
	}

	showQuickNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
		switch (type) {
			case 'info':
				this.notificationService.info(message);
				break;
			case 'warning':
				this.notificationService.warn(message);
				break;
			case 'error':
				this.notificationService.error(message);
				break;
		}
	}

	async executeWithConfirmation(
		message: string, 
		action: () => Promise<void>, 
		confirmButton: string = 'Execute'
	): Promise<boolean> {
		const result = await this.showConfirmationDialog({
			message,
			primaryButton: confirmButton,
			cancelButton: 'Cancel'
		});

		if (result.confirmed) {
			try {
				await action();
				return true;
			} catch (error) {
				this.showErrorDialog({
					message: 'Action failed',
					detail: error instanceof Error ? error.message : String(error)
				});
				return false;
			}
		}

		return false;
	}
}
