/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { IConfirmation, IConfirmationResult, IDialogService, IDialogOptions, IShowResult, IInputResult } from 'vs/platform/dialogs/common/dialogs';

export class TestDialogService implements IDialogService {

	declare readonly _serviceBrand: undefined;

	confirm(_confirmation: IConfirmation): Promise<IConfirmationResult> { return Promise.resolve({ confirmed: false }); }
	show(_severity: Severity, _message: string, _buttons: string[], _options?: IDialogOptions): Promise<IShowResult> { return Promise.resolve({ choice: 0 }); }
	input(): Promise<IInputResult> { { return Promise.resolve({ choice: 0, values: [] }); } }
	about(): Promise<void> { return Promise.resolve(); }
}
