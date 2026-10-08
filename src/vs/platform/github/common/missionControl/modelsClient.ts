/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../schema.js';
import { MissionControlClient } from './missionControlClient.js';
import { IModelsClient, ListModelsResponse } from './models.js';

export class ModelsClient implements IModelsClient {
	constructor(private readonly _client: MissionControlClient) { }

	list(signal: AbortSignal): Promise<ListModelsResponse> {
		return this._client.request({
			method: 'GET',
			api: 'copilot',
			path: '/agents/swe/models',
			expectedStatus: [200],
		}, signal, response => parseListModelsResponse(response.data));
	}
}

const parseListModelsResponse = parse.object<ListModelsResponse>({
	data: parse.arrayOf(parse.object({
		id: parse.nonEmptyString,
		name: parse.string,
		model_picker_enabled: parse.optional(parse.boolean),
		policy: parse.optional(parse.object({ state: parse.optional(parse.string) })),
		billing: parse.optional(parse.jsonValue),
		model_picker_category: parse.optional(parse.string),
		model_picker_price_category: parse.optional(parse.string),
		capabilities: parse.optional(parse.object({
			limits: parse.optional(parse.object({
				max_context_window_tokens: parse.optional(parse.nonNegativeInteger),
				max_prompt_tokens: parse.optional(parse.nonNegativeInteger),
				max_output_tokens: parse.optional(parse.nonNegativeInteger),
			})),
			supports: parse.optional(parse.object({
				vision: parse.optional(parse.boolean),
				reasoning_effort: parse.optional(parse.strings),
			})),
		})),
	})),
	default_model: parse.optional(parse.string),
});
