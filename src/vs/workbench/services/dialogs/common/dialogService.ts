/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfirmation, IConfirmationResult, IDialogOptions, IDialogService, IInput, IInputResult, IShowResult } from 'vs/platform/dialogs/common/dialogs';
import { DialogsModel, IDialogsModel } from 'vs/workbench/common/dialogs';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class DialogService extends Disposable implements IDialogService {
	_serviceBrand: undefined;

	private _model: IDialogsModel = this._register(new DialogsModel());
	get model(): IDialogsModel { return this._model; }

	confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		const handle = this.model.show({ confirmArgs: { confirmation } });

		console.log('showing confirm');

		return handle.result.then(res => {
			return res as IConfirmationResult;
		});
	}

	show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): Promise<IShowResult> {
		const handle = this.model.show({ showArgs: { severity, message, buttons, options } });

		console.log('showing show');


		return handle.result.then(res => {
			return res as IShowResult;
		});
	}

	input(severity: Severity, message: string, buttons: string[], inputs: IInput[], options?: IDialogOptions): Promise<IInputResult> {
		console.log('showing input');
		const handle = this.model.show({ inputArgs: { severity, message, buttons, inputs, options } });

		return handle.result.then(res => {
			return res as IInputResult;
		});
	}

	about(): Promise<void> {
		console.log('showing about');
		const handle = this.model.show({ aboutArgs: {} });

		return handle.result.then();
	}
}

registerSingleton(IDialogService, DialogService, true);
