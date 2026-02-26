/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from '../../../../base/common/severity.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IAsyncPromptResult, IAsyncPromptResultWithCancel, IConfirmation, IConfirmationResult, IDialogService, IInput, IInputResult, IPrompt, IPromptResult, IPromptResultWithCancel, IPromptWithCustomCancel, IPromptWithDefaultCancel } from '../../../../platform/dialogs/common/dialogs.js';
import { DialogsModel } from '../../../common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class DialogService extends Disposable implements IDialogService {

	declare readonly _serviceBrand: undefined;

	readonly model = this._register(new DialogsModel());

	readonly onWillShowDialog = this.model.onWillShowDialog;

	readonly onDidShowDialog = this.model.onDidShowDialog;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	private skipDialogs(): boolean {
		if (this.environmentService.enableSmokeTestDriver) {
			this.logService.warn('DialogService: Dialog requested during smoke test.');
		}
		// integration tests
		return this.environmentService.isExtensionDevelopment && !!this.environmentService.extensionTestsLocationURI;
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		if (this.skipDialogs()) {
			this.logService.trace('DialogService: refused to show confirmation dialog in tests.');

			return { confirmed: true };
		}

		const handle = this.model.show({ confirmArgs: { confirmation } });

		return await handle.result as IConfirmationResult;
	}

	prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	async prompt<T>(prompt: IPrompt<T> | IPromptWithCustomCancel<T> | IPromptWithDefaultCancel<T>): Promise<IPromptResult<T> | IPromptResultWithCancel<T>> {
		if (this.skipDialogs()) {
			throw new Error(`DialogService: refused to show dialog in tests. Contents: ${prompt.message}`);
		}

		const handle = this.model.show({ promptArgs: { prompt } });

		const dialogResult = await handle.result as IAsyncPromptResult<T> | IAsyncPromptResultWithCancel<T>;

		return {
			result: await dialogResult.result,
			checkboxChecked: dialogResult.checkboxChecked
		};
	}

	async input(input: IInput): Promise<IInputResult> {
		if (this.skipDialogs()) {
			throw new Error('DialogService: refused to show input dialog in tests.');
		}

		const handle = this.model.show({ inputArgs: { input } });

		return await handle.result as IInputResult;
	}

	async info(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Info, message, detail });
	}

	async warn(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Warning, message, detail });
	}

	async error(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Error, message, detail });
	}

	async about(): Promise<void> {
		if (this.skipDialogs()) {
			throw new Error('DialogService: refused to show about dialog in tests.');
		}

		const handle = this.model.show({});
		await handle.result;
	}
}

registerSingleton(IDialogService, DialogService, InstantiationType.Delayed);
