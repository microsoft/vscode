/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosModalDialogsService = createDecorator<IErdosModalDialogsService>('erdosModalDialogsService');

export interface IModalDialogPromptInstance {
	readonly onChoice: Event<boolean>;

	close(): void;
}

export interface ShowConfirmationModalDialogOptions {
	title: string;
	message: string;
	okButtonTitle?: string;
	cancelButtonTitle?: string;
	action: () => Promise<void>;
}

export interface IErdosModalDialogsService {

	readonly _serviceBrand: undefined;

	showConfirmationModalDialog(options: ShowConfirmationModalDialogOptions): void;

	showModalDialogPrompt(
		title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string
	): IModalDialogPromptInstance;

	showSimpleModalDialogPrompt(
		title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string
	): Promise<boolean>;

	showSimpleModalDialogMessage(
		title: string,
		message: string,
		okButtonTitle?: string
	): Promise<null>;
}






