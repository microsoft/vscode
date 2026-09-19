/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT, IChatWidgetViewState } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export type ISessionPreparationInput = Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'>;

export const ISessionsChatViewStateService = createDecorator<ISessionsChatViewStateService>('sessionsChatViewStateService');

export interface ISessionsChatViewStateService {
	readonly _serviceBrand: undefined;
	get(resource: URI): IChatWidgetViewState | undefined;
	set(resource: URI, state: IChatWidgetViewState): void;
	getPreparationInput(resource: URI): ISessionPreparationInput | undefined;
	setPreparationInput(resource: URI, input: ISessionPreparationInput): void;
	clearPreparationInput(resource: URI): void;
}

export class SessionsChatViewStateService extends Disposable implements ISessionsChatViewStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _states = new LRUCache<string, IChatWidgetViewState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	private readonly _preparationInputs = new LRUCache<string, ISessionPreparationInput>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();
		const moveInput: Parameters<typeof sessionsManagementService.onDidReplaceSession>[0] = ({ from, to }) => {
			const fromKey = getComparisonKey(from.mainChat.get().resource);
			const toKey = getComparisonKey(to.mainChat.get().resource);
			const input = this._preparationInputs.get(fromKey);
			if (input && fromKey !== toKey) {
				this._preparationInputs.set(toKey, input);
				this._preparationInputs.delete(fromKey);
			}
		};
		this._register(sessionsManagementService.onDidReplaceSession(moveInput));
		this._register(sessionsManagementService.onDidReplaceNewDraftSession(moveInput));
	}

	get(resource: URI): IChatWidgetViewState | undefined {
		return this._states.get(getComparisonKey(resource));
	}

	set(resource: URI, state: IChatWidgetViewState): void {
		this._states.set(getComparisonKey(resource), state);
	}

	getPreparationInput(resource: URI): ISessionPreparationInput | undefined {
		return this._preparationInputs.get(getComparisonKey(resource));
	}

	setPreparationInput(resource: URI, input: ISessionPreparationInput): void {
		this._preparationInputs.set(getComparisonKey(resource), input);
	}

	clearPreparationInput(resource: URI): void {
		this._preparationInputs.delete(getComparisonKey(resource));
	}
}
