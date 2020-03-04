/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IQuickInputService, IQuickPickItem, IQuickInputButton, IQuickPick, IInputBox, QuickPickInput, IPickOptions, IInputOptions, IQuickNavigateConfiguration } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';

export abstract class PlatformQuickInputService extends Themable implements IQuickInputService {

	public _serviceBrand: undefined;

	readonly backButton!: IQuickInputButton;

	get onShow() { return Event.None; }
	get onHide() { return Event.None; }

	constructor(
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancellationToken = CancellationToken.None): Promise<O extends { canPickMany: true } ? T[] : T> {
		throw new Error('Method not implemented.');
	}

	input(options?: IInputOptions | undefined, token?: CancellationToken | undefined): Promise<string> {
		throw new Error('Method not implemented.');
	}

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		throw new Error('Method not implemented.');
	}

	createInputBox(): IInputBox {
		throw new Error('Method not implemented.');
	}

	focus(): void {
		throw new Error('Method not implemented.');
	}

	toggle(): void {
		throw new Error('Method not implemented.');
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration | undefined): void {
		throw new Error('Method not implemented.');
	}

	accept(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	back(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	cancel(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	hide(focusLost?: boolean): void {
		throw new Error('Method not implemented.');
	}
}
