/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { InteractionOutcomeComputer, ISessionTurnStorage, OutcomeAnnotation } from '../../inlineChat/node/promptCraftingTypes';
import { Turn } from '../common/conversation';
import { IResponseProcessorContext } from './intents';

export class ResponseProcessorContext implements IResponseProcessorContext {

	constructor(
		public readonly chatSessionId: string,
		public readonly turn: Turn,
		public readonly messages: readonly Raw.ChatMessage[],
		private readonly _interactionOutcomeComputer: InteractionOutcomeComputer
	) { }

	addAnnotations(annotations: OutcomeAnnotation[]): void {
		this._interactionOutcomeComputer.addAnnotations(annotations);
	}

	storeInInlineSession(store: ISessionTurnStorage): void {
		this._interactionOutcomeComputer.storeInInlineSession(store);
	}
}
