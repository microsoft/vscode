/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IRestoredChat } from '../../../common/agentHostChatContributionsService.js';
import { normalizeAgentModelMessage } from '../../../common/agentModelSelection.js';
import type { Turn } from '../../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';

/** Canonicalizes provider-owned legacy selections after persisted drafts and turns have been restored. */
export class ModelSelectionMigrationContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'modelSelectionMigration';
	readonly order = 675;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
	) {
		super();
	}

	onHydrateChat(context: IHydrationContext, restored: IRestoredChat): IRestoredChat {
		const draft = restored.draft && normalizeAgentModelMessage(this._providers.getProviderForSession(context.session), restored.draft);
		return draft !== restored.draft ? { ...restored, draft } : restored;
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		const provider = this._providers.getProviderForSession(context.session);
		return turns.map(turn => {
			const message = normalizeAgentModelMessage(provider, turn.message);
			return message !== turn.message ? { ...turn, message } : turn;
		});
	}
}
