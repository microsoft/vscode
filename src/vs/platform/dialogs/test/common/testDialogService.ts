/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { IConfirmation, IConfirmationResult, IDialogOptions, IDialogService, IInputResult, IShowResult } from 'vs/platform/dialogs/common/dialogs';

export class TestDialogService implements IDialogService {

	declare readonly _serviceBrand: undefined;

	private confirmResult: IConfirmationResult | undefined = undefined;
	setConfirmResult(result: IConfirmationResult) {
		this.confirmResult = result;
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		if (this.confirmResult) {
			const confirmResult = this.confirmResult;
			this.confirmResult = undefined;

			return confirmResult;
		}

		return { confirmed: false };
	}

	async show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult> { return { choice: 0 }; }
	async input(): Promise<IInputResult> { { return { choice: 0, values: [] }; } }
	async about(): Promise<void> { }
}
