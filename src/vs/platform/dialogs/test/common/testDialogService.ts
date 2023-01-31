/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { IConfirmation, IConfirmationResult, IDialogOptions, IDialogService, IInputResult, ITwoButtonPrompt, ITwoButtonPromptResult, IShowResult, IFourButtonPrompt, IFourButtonPromptResult, IThreeButtonPrompt, IThreeButtonPromptResult, IOneButtonPrompt, IOneButtonPromptResult, TwoButtonPromptResult } from 'vs/platform/dialogs/common/dialogs';

export class TestDialogService implements IDialogService {

	declare readonly _serviceBrand: undefined;

	readonly onWillShowDialog = Event.None;
	readonly onDidShowDialog = Event.None;

	constructor(private defaultConfirmResult: IConfirmationResult | undefined = undefined) { }

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

		return this.defaultConfirmResult ?? { confirmed: false };
	}

	prompt(prompt: IOneButtonPrompt): Promise<IOneButtonPromptResult>;
	prompt(prompt: ITwoButtonPrompt): Promise<ITwoButtonPromptResult>;
	prompt(prompt: IThreeButtonPrompt): Promise<IThreeButtonPromptResult>;
	prompt(prompt: IFourButtonPrompt): Promise<IFourButtonPromptResult>;
	async prompt(prompt: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): Promise<IOneButtonPromptResult | ITwoButtonPromptResult | IThreeButtonPromptResult | IFourButtonPromptResult> {
		return { choice: TwoButtonPromptResult.Primary };
	}
	async show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult> { return { choice: 0 }; }
	async info(message: string): Promise<void> {
		await this.prompt({ type: Severity.Info, message });
	}

	async warn(message: string): Promise<void> {
		await this.prompt({ type: Severity.Warning, message });
	}

	async error(message: string): Promise<void> {
		await this.prompt({ type: Severity.Error, message });
	}
	async input(): Promise<IInputResult> { { return { confirmed: true, values: [] }; } }
	async about(): Promise<void> { }
}
