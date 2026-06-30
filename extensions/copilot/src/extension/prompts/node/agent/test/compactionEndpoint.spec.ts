/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { ConfigKey } from '../../../../../platform/configuration/common/configurationService';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { DEFAULT_COMPACTION_MODEL, resolveCompactionEndpoint } from '../compactionEndpoint';

type ConfigValues = {
	[ConfigKey.ConversationCompactionModel.id]?: string;
	[ConfigKey.ConversationUsePrismCompaction.id]?: boolean;
};

function setup(configValues: ConfigValues = {}) {
	const configurationService = {
		getExperimentBasedConfig(key: { id: string }) {
			return (configValues as Record<string, unknown>)[key.id];
		},
	};
	const experimentationService = {};
	const logService = { warn: () => { } };

	return { configurationService, experimentationService, logService };
}

function makeMainEndpoint(model = 'main-agent-model'): IChatEndpoint {
	// We never call methods on the main endpoint in these tests — identity check
	// is all that matters for the "passthrough" cases.
	return { model } as unknown as IChatEndpoint;
}

suite('resolveCompactionEndpoint', () => {
	test('returns main endpoint when neither flag is set', async () => {
		const { configurationService, experimentationService, logService } = setup();
		const main = makeMainEndpoint();
		const endpointProvider = { getChatEndpoint: async () => { throw new Error('should not be called'); } };

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(result).toBe(main);
	});

	test('routes through endpointProvider (CAPI) with the default model when usePrismCompaction is set', async () => {
		const { configurationService, experimentationService, logService } = setup({
			[ConfigKey.ConversationUsePrismCompaction.id]: true,
		});
		const main = makeMainEndpoint();
		const capiEndpoint = makeMainEndpoint('trajectory-compaction');
		const calls: string[] = [];
		const endpointProvider = {
			async getChatEndpoint(family: string) {
				calls.push(family);
				return capiEndpoint;
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(calls).toEqual([DEFAULT_COMPACTION_MODEL]);
		expect(result).toBe(capiEndpoint);
	});

	test('falls back to main endpoint when endpointProvider.getChatEndpoint rejects', async () => {
		const warnings: string[] = [];
		const { configurationService, experimentationService } = setup({
			[ConfigKey.ConversationUsePrismCompaction.id]: true,
		});
		const main = makeMainEndpoint();
		const endpointProvider = {
			async getChatEndpoint() {
				throw new Error('model not found');
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			{ warn: (msg: string) => warnings.push(msg) } as never,
		);

		expect(result).toBe(main);
		expect(warnings.length).toBe(1);
	});
});
