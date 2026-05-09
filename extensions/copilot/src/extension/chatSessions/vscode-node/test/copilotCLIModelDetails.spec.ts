/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getCopilotCLIModelDetails } from '../copilotCLIModelDetails';
import type { ICopilotCLISession } from '../../copilotcli/node/copilotcliSession';
import type { ICopilotCLIModels, CopilotCLIModelInfo } from '../../copilotcli/node/copilotCli';
import type { ILogService } from '../../../../platform/log/common/logService';

const testModel: CopilotCLIModelInfo = {
	id: 'claude-sonnet-4',
	name: 'Claude Sonnet 4',
	multiplier: 2,
	maxContextWindowTokens: 200000,
	supportsVision: true,
};

function createMockSession(responseModelId?: string, selectedModelId?: string): ICopilotCLISession {
	return {
		getLastResponseModelId: () => responseModelId,
		getSelectedModelId: async () => selectedModelId,
	} as unknown as ICopilotCLISession;
}

function createMockModels(models: CopilotCLIModelInfo[]): ICopilotCLIModels {
	return {
		_serviceBrand: undefined,
		getModels: async () => models,
	} as unknown as ICopilotCLIModels;
}

const nullLog = { error() { } } as unknown as ILogService;

describe('getCopilotCLIModelDetails', () => {
	it('returns credits display for integer credits', async () => {
		const session = createMockSession('claude-sonnet-4');
		const models = createMockModels([testModel]);

		const { result } = await getCopilotCLIModelDetails(session, undefined, models, nullLog, true, 5);

		expect(result.details).toBe('Claude Sonnet 4 \u2022 5 credits');
	});

	it('returns singular credit label for exactly 1 credit', async () => {
		const session = createMockSession('claude-sonnet-4');
		const models = createMockModels([testModel]);

		const { result } = await getCopilotCLIModelDetails(session, undefined, models, nullLog, true, 1);

		expect(result.details).toBe('Claude Sonnet 4 \u2022 1 credit');
	});

	it('returns formatted decimal for fractional credits', async () => {
		const session = createMockSession('claude-sonnet-4');
		const models = createMockModels([testModel]);

		const { result } = await getCopilotCLIModelDetails(session, undefined, models, nullLog, true, 1.5);

		expect(result.details).toBe('Claude Sonnet 4 \u2022 1.5 credits');
	});

	it('falls back to multiplier format when credits are undefined', async () => {
		const session = createMockSession('claude-sonnet-4');
		const models = createMockModels([testModel]);

		const { result } = await getCopilotCLIModelDetails(session, undefined, models, nullLog, true);

		expect(result.details).toBe('Claude Sonnet 4 \u2022 2x');
	});

	it('returns empty result when disabled', async () => {
		const session = createMockSession('claude-sonnet-4');
		const models = createMockModels([testModel]);

		const { result } = await getCopilotCLIModelDetails(session, undefined, models, nullLog, false, 5);

		expect(result).toEqual({});
	});
});
