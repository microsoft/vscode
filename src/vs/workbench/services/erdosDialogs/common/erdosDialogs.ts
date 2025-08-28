/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Service identifier for the Erdos Dialog service.
 */
export const IErdosDialogService = createDecorator<IErdosDialogService>('erdosDialogService');

/**
 * Options for dialog display
 */
export interface DialogOptions {
	message: string;
	detail?: string;
	primaryButton?: string;
	cancelButton?: string;
}

/**
 * Result from dialog interaction
 */
export interface DialogResult {
	confirmed: boolean;
	checkboxChecked?: boolean;
}

/**
 * Service for displaying dialogs and notifications in Erdos.
 * Uses VSCode's native dialog system for better integration.
 */
export interface IErdosDialogService {
	readonly _serviceBrand: undefined;

	/**
	 * Shows a confirmation dialog with OK/Cancel buttons
	 */
	showConfirmationDialog(options: DialogOptions): Promise<DialogResult>;

	/**
	 * Shows an information dialog
	 */
	showInformationDialog(options: DialogOptions): Promise<void>;

	/**
	 * Shows a warning dialog
	 */
	showWarningDialog(options: DialogOptions): Promise<void>;

	/**
	 * Shows an error dialog
	 */
	showErrorDialog(options: DialogOptions): Promise<void>;

	/**
	 * Shows a quick notification (toast-style)
	 */
	showQuickNotification(message: string, type?: 'info' | 'warning' | 'error'): void;

	/**
	 * Executes an action with confirmation dialog
	 */
	executeWithConfirmation(message: string, action: () => Promise<void>, confirmButton?: string): Promise<boolean>;
}
