/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isObject } from '../../../../base/common/types.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IChatWidget } from './chat.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { compare } from '../../../../base/common/strings.js';


export interface IChatContextPickerPickItem {
	label: string;
	iconClass?: string;
	description?: string;
	detail?: string;
	disabled?: boolean;
	asAttachment(): IChatRequestVariableEntry;
}

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

export interface IChatContextPickerItem extends IChatContextItem {
	readonly type: 'pickerPick';

	asPicker(widget: IChatWidget): {
		readonly placeholder: string;
		readonly picks: Promise<(IChatContextPickerPickItem | IQuickPickSeparator)[]> | ((query: string, token: CancellationToken) => Promise<(IChatContextPickerPickItem | IQuickPickSeparator)[]>);
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
