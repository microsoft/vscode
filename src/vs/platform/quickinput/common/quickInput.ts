/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IQuickPickItem, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickPick, IQuickInputButton, IInputBox, QuickPickInput } from 'vs/base/parts/quickinput/common/quickInput';

export { IQuickPickItem, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickPick, IQuickInput, IQuickInputButton, IInputBox, IQuickPickItemButtonEvent, QuickPickInput, IQuickPickSeparator, IKeyMods } from 'vs/base/parts/quickinput/common/quickInput';

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export interface IQuickInputService {

	_serviceBrand: undefined;

	/**
	 * Opens the quick input box for selecting items and returns a promise with the user selected item(s) if any.
	 */
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[]>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T>;

	/**
	 * Opens the quick input box for text input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): Promise<string>;

	backButton: IQuickInputButton;

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T>;
	createInputBox(): IInputBox;

	focus(): void;

	toggle(): void;

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	accept(): Promise<void>;

	back(): Promise<void>;

	cancel(): Promise<void>;
}
