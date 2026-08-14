/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatMessageRole, getTextResponseFromStream, IChatMessage, ILanguageModelsService } from '../../common/languageModels.js';
import { buildRouterMessages, ISessionRouteRequest, ISessionRouteResult, ISessionRouter, parseRouterResponse } from '../../common/sessionRouter.js';

/**
 * Default {@link ISessionRouter}. Scores candidate sessions with a renderer
 * language model (Copilot/CAPI under the hood).
 *
 * The prompt/parse logic lives in `../../common/sessionRouter.ts` so the scoring
 * backend can later be swapped for the agent-host CAPI utility completion or a
 * local model without changing this service's contract.
 */
export class SessionRouterService implements ISessionRouter {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
	) { }

	async route(request: ISessionRouteRequest, token: CancellationToken): Promise<ISessionRouteResult[]> {
		if (!request.sessions.length) {
			return [];
		}
		const scored = await this.requestModel(
			buildRouterMessages(request),
			token,
			text => parseRouterResponse(text, new Set(request.sessions.map(session => session.sessionId))),
		);
		return scored ?? [];
	}

	private async requestModel<T>(
		routerMessages: readonly { role: 'system' | 'user'; content: string }[],
		token: CancellationToken,
		parse: (text: string) => T | undefined,
	): Promise<T | undefined> {
		let modelId: string | undefined;
		try {
			// Use the small utility model for this background scoring task, matching
			// other internal utility features (e.g. chatGoalSummaryService,
			// chatToolRiskAssessmentService) rather than consuming a premium model.
			const models = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility-small' });
			modelId = models.at(0);
		} catch (err) {
			this.logService.trace('[SessionRouter] model selection failed, falling back from model routing', err);
		}
		if (!modelId) {
			return undefined;
		}

		const messages: IChatMessage[] = routerMessages.map(message => ({
			role: message.role === 'system' ? ChatMessageRole.System : ChatMessageRole.User,
			content: [{ type: 'text', value: message.content }]
		}));

		try {
			const response = await this.languageModelsService.sendChatRequest(modelId, undefined, messages, {}, token);
			const text = await getTextResponseFromStream(response);
			return parse(text);
		} catch (err) {
			// Preserve cancellation semantics: a canceled token must reject so the
			// caller can abort routing, rather than silently degrading to the heuristic.
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.logService.trace('[SessionRouter] scoring request failed, falling back from model routing', err);
			return undefined;
		}
	}
}
