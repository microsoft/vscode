/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getCopilotCLIModelDetails, persistCopilotCLIResponseModelId } from '../copilotCLIModelDetails';
import { MockChatSessionMetadataStore } from '../../common/test/mockChatSessionMetadataStore';
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

const nullLog = { error() { }, trace() { } } as unknown as ILogService;

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

describe('persistCopilotCLIResponseModelId', () => {
	it('persists responseModelId and creditsUsed so they are readable immediately after', async () => {
		const store = new MockChatSessionMetadataStore();
		// Simulate copilotcliSession.ts writing copilotRequestId first (as happens in production)
		await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-1', copilotRequestId: 'sdk-1', toolIdEditMap: {} }]);

		// persistCopilotCLIResponseModelId must merge responseModelId and creditsUsed into the same entry
		await persistCopilotCLIResponseModelId('session-1', 'req-1', 'claude-sonnet-4.6', store, nullLog, 16.4);

		const details = await store.getRequestDetails('session-1');
		expect(details).toEqual([{
			vscodeRequestId: 'req-1',
			copilotRequestId: 'sdk-1',
			toolIdEditMap: {},
			responseModelId: 'claude-sonnet-4.6',
			creditsUsed: 16.4,
		}]);
	});

	it('skips write when both responseModelId and creditsUsed are undefined', async () => {
		const store = new MockChatSessionMetadataStore();

		await persistCopilotCLIResponseModelId('session-1', 'req-1', undefined, store, nullLog, undefined);

		const details = await store.getRequestDetails('session-1');
		expect(details).toEqual([]);
	});

	it('persists creditsUsed even when responseModelId is undefined', async () => {
		const store = new MockChatSessionMetadataStore();
		await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-1', copilotRequestId: 'sdk-1', toolIdEditMap: {} }]);

		await persistCopilotCLIResponseModelId('session-1', 'req-1', undefined, store, nullLog, 5);

		const details = await store.getRequestDetails('session-1');
		expect(details[0].creditsUsed).toBe(5);
	});

	it('returns a promise that resolves only after the write completes', async () => {
		// This test verifies the fix: persistCopilotCLIResponseModelId must return
		// a promise so callers can await it before the content provider reads history.
		const store = new MockChatSessionMetadataStore();
		await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-1', copilotRequestId: 'sdk-1', toolIdEditMap: {} }]);

		const promise = persistCopilotCLIResponseModelId('session-1', 'req-1', 'model-1', store, nullLog, 10);

		// The return value must be a Promise (not void/undefined)
		expect(promise).toBeInstanceOf(Promise);

		await promise;

		// After awaiting, the data must be readable
		const details = await store.getRequestDetails('session-1');
		expect(details[0].responseModelId).toBe('model-1');
		expect(details[0].creditsUsed).toBe(10);
	});
});
