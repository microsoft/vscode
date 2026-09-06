/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { constObservable, IObservable } from '../../../util/vs/base/common/observableInternal';
import { InteractionOutcome, PromptQuery } from '../../inlineChat/node/promptCraftingTypes';
import { SearchFeedbackKind } from '../../workspaceSemanticSearch/node/semanticSearchTextSearchProvider';
import { Conversation, Turn } from '../common/conversation';

export const IFeedbackReporter = createServiceIdentifier<IFeedbackReporter>('IFeedbackReporter');

export interface IFeedbackReporter {
	readonly _serviceBrand: undefined;

	readonly canReport: IObservable<boolean>;

	reportInline(conversation: Conversation, promptQuery: PromptQuery, interactionOutcome: InteractionOutcome): Promise<void>;
	reportChat(turn: Turn): Promise<void>;
	reportSearch(kind: SearchFeedbackKind): Promise<void>;
}


export class NullFeedbackReporterImpl implements IFeedbackReporter {
	_serviceBrand: undefined;

	readonly canReport = constObservable(false);

	async reportInline(conversation: Conversation, promptQuery: PromptQuery, interactionOutcome: InteractionOutcome): Promise<void> {
		// nothing
	}

	async reportChat(turn: Turn): Promise<void> {
		// nothing
	}

	async reportSearch(): Promise<void> {
		// nothing
	}
}

export const NullFeedbackReporter = new NullFeedbackReporterImpl();
