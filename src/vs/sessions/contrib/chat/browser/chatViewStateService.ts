/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT, IChatWidgetViewState } from '../../../../workbench/contrib/chat/browser/chat.js';
import type { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';

export const ISessionsChatViewStateService = createDecorator<ISessionsChatViewStateService>('sessionsChatViewStateService');

export interface ISessionsChatViewStateService {
	readonly _serviceBrand: undefined;
	get(resource: URI): IChatWidgetViewState | undefined;
	set(resource: URI, state: IChatWidgetViewState): void;
	setPendingInput(resource: URI, state: Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'>): void;
	takePendingInput(resource: URI): Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'> | undefined;
}

export class SessionsChatViewStateService implements ISessionsChatViewStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _states = new LRUCache<string, IChatWidgetViewState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	private readonly _pendingInputs = new LRUCache<string, Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'>>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);

	get(resource: URI): IChatWidgetViewState | undefined {
		return this._states.get(getComparisonKey(resource));
	}

	set(resource: URI, state: IChatWidgetViewState): void {
		this._states.set(getComparisonKey(resource), state);
	}

	setPendingInput(resource: URI, state: Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'>): void {
		this._pendingInputs.set(getComparisonKey(resource), state);
	}

	takePendingInput(resource: URI): Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'> | undefined {
		const key = getComparisonKey(resource);
		const state = this._pendingInputs.get(key);
		this._pendingInputs.delete(key);
		return state;
	}
}
