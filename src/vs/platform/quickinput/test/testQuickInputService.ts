/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import * as Types from 'vs/base/common/types';
import { IInputBox, IInputOptions, IPickOptions, IQuickInputButton, IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, Omit, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';

export class TestQuickInputService implements IQuickInputService {
	declare readonly _serviceBrand: undefined;

	readonly onShow = Event.None;
	readonly onHide = Event.None;

	readonly quickAccess = undefined!;

	public pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[]>;
	public pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T>;
	public pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined> {
		if (Types.isArray(picks)) {
			return Promise.resolve(<any>{ label: 'selectedPick', description: 'pick description', value: 'selectedPick' });
		} else {
			return Promise.resolve(undefined);
		}
	}

	public input(options?: IInputOptions, token?: CancellationToken): Promise<string> {
		return Promise.resolve(options ? 'resolved' + options.prompt : 'resolved');
	}

	backButton!: IQuickInputButton;

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		throw new Error('not implemented.');
	}

	createInputBox(): IInputBox {
		throw new Error('not implemented.');
	}

	focus(): void {
		throw new Error('not implemented.');
	}

	toggle(): void {
		throw new Error('not implemented.');
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		throw new Error('not implemented.');
	}

	accept(): Promise<void> {
		throw new Error('not implemented.');
	}

	back(): Promise<void> {
		throw new Error('not implemented.');
	}

	cancel(): Promise<void> {
		throw new Error('not implemented.');
	}
}
