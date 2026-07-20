/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatMessageRole, getTextResponseFromStream, IChatMessage, ILanguageModelsService } from '../../common/languageModels.js';
import { buildRouterMessages, heuristicScore, ISessionRouteRequest, ISessionRouteResult, ISessionRouter, parseRouterResponse } from '../../common/sessionRouter.js';

/**
 * Default {@link ISessionRouter}. Scores candidate sessions with a renderer
 * language model (Copilot/CAPI under the hood) and degrades to a local
 * heuristic when no model is available or the response can't be parsed.
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
		const scored = await this.scoreWithModel(request, token);
		return scored ?? heuristicScore(request);
	}

	private async scoreWithModel(request: ISessionRouteRequest, token: CancellationToken): Promise<ISessionRouteResult[] | undefined> {
		let modelId: string | undefined;
		try {
			const models = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot' });
			modelId = models.at(0);
		} catch (err) {
			this.logService.trace('[SessionRouter] model selection failed, falling back to heuristic', err);
		}
		if (!modelId) {
			return undefined;
		}

		const messages: IChatMessage[] = buildRouterMessages(request).map(message => ({
			role: message.role === 'system' ? ChatMessageRole.System : ChatMessageRole.User,
			content: [{ type: 'text', value: message.content }]
		}));

		try {
			const response = await this.languageModelsService.sendChatRequest(modelId, undefined, messages, {}, token);
			const text = await getTextResponseFromStream(response);
			const validIds = new Set(request.sessions.map(session => session.sessionId));
			return parseRouterResponse(text, validIds);
		} catch (err) {
			this.logService.trace('[SessionRouter] scoring request failed, falling back to heuristic', err);
			return undefined;
		}
	}
}
