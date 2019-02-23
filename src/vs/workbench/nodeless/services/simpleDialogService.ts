/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDialogService, IConfirmation, IConfirmationResult, IDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';

export class SimpleDialogService implements IDialogService {

	_serviceBrand: any;

	confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		return Promise.resolve({ confirmed: true });
	}

	show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): Promise<number> {
		return Promise.resolve(0);
	}
}