/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ObservablePromise } from '../../../../base/common/observable.js';
import { compare } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isObject } from '../../../../base/common/types.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IChatRequestVariableEntry } from '../common/chatVariableEntries.js';
import { IChatWidget } from './chat.js';


export interface IChatContextPickerPickItem extends Partial<IQuickItem> {
	label: string;
	iconClass?: string;
	iconClasses?: readonly string[];
	description?: string;
	detail?: string;
	disabled?: boolean;
	asAttachment(): ChatContextPickAttachment | Promise<ChatContextPickAttachment>;
}

export type ChatContextPickAttachment = IChatRequestVariableEntry | IChatRequestVariableEntry[] | 'noop';

export function isChatContextPickerPickItem(item: unknown): item is IChatContextPickerPickItem {
	return isObject(item) && typeof (item as IChatContextPickerPickItem).asAttachment === 'function';
}

interface IChatContextItem {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly commandId?: string;
	readonly ordinal?: number;
	isEnabled?(widget: IChatWidget): Promise<boolean> | boolean;
}

export interface IChatContextValueItem extends IChatContextItem {
	readonly type: 'valuePick';

	asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry | IChatRequestVariableEntry[] | undefined>;
}

export type ChatContextPick = IChatContextPickerPickItem | IQuickPickSeparator;

export interface IChatContextPicker {
	readonly placeholder: string;
	/**
	 * Picks that should either be:
	 * - A promise that resolves to the picked items
	 * - A function that maps input query into items to display.
	 */
	readonly picks: Promise<ChatContextPick[]> | ((query: IObservable<string>, token: CancellationToken) => IObservable<{ busy: boolean; picks: ChatContextPick[] }>);

	/** Return true to cancel the default behavior */
	readonly goBack?: () => boolean;

	readonly configure?: {
		label: string;
		commandId: string;
	};

	readonly dispose?: () => void;
}

export interface IChatContextPickerItem extends IChatContextItem {
	readonly type: 'pickerPick';

	asPicker(widget: IChatWidget): IChatContextPicker;
}

/**
 * Helper for use in {@IChatContextPickerItem} that wraps a simple query->promise
 * function into the requisite observable.
 */
export function picksWithPromiseFn(fn: (query: string, token: CancellationToken) => Promise<ChatContextPick[]>): (query: IObservable<string>, token: CancellationToken) => IObservable<{ busy: boolean; picks: ChatContextPick[] }> {
	return (query, token) => {
		const promise = derived(reader => {
			const queryValue = query.read(reader);
			const cts = new CancellationTokenSource(token);
			reader.store.add(toDisposable(() => cts.dispose(true)));
			return new ObservablePromise(fn(queryValue, cts.token));
		});

		return promise.map((value, reader) => {
			const result = value.promiseResult.read(reader);
			return { picks: result?.data || [], busy: result === undefined };
		});
	};
}

export interface IChatContextPickService {
	_serviceBrand: undefined;

	items: Iterable<IChatContextValueItem | IChatContextPickerItem>;

	/**
	 * Register a value or  picker to the "Add Context" flow. A value directly resolved to a
	 * chat attachment and a picker first shows a list of items to pick from and then
	 * resolves the selected item to a chat attachment.
	 */
	registerChatContextItem(item: IChatContextValueItem | IChatContextPickerItem): IDisposable;
}

export const IChatContextPickService = createDecorator<IChatContextPickService>('IContextPickService');

export class ChatContextPickService implements IChatContextPickService {

	declare _serviceBrand: undefined;

	private readonly _picks: IChatContextValueItem[] = [];

	readonly items: Iterable<IChatContextValueItem> = this._picks;

	registerChatContextItem(pick: IChatContextValueItem): IDisposable {
		this._picks.push(pick);

		this._picks.sort((a, b) => {
			const valueA = a.ordinal ?? 0;
			const valueB = b.ordinal ?? 0;
			if (valueA === valueB) {
				return compare(a.label, b.label);
			} else if (valueA < valueB) {
				return 1;
			} else {
				return -1;
			}
		});

		return toDisposable(() => {
			const index = this._picks.indexOf(pick);
			if (index >= 0) {
				this._picks.splice(index, 1);
			}
		});
	}
}
