/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getByokLmAgentModelId, getByokLmSelectionModelId, isByokLmAgentModelId, resolveByokLmReportedModelId, type IByokLmModelInfo } from '../../common/agentHostByokLm.js';

suite('agentHostByokLm model ids', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// The runtime-facing half of this contract (the SDK lists and selects BYOK
	// models as `provider/id`, and CAPI ids are bare) is pinned against the
	// bundled runtime by copilotByokSelectionIds.integrationTest.ts.
	test('recognizes every agent model id produced for a BYOK model, and no Copilot model id', () => {
		const byokModels: IByokLmModelInfo[] = [
			{ vendor: 'acme', id: 'test-model' },
			{ vendor: 'acme', id: 'test-model', modelIdentifier: 'acme/test-model' },
			{ vendor: 'azure', id: 'gpt-5', modelIdentifier: 'azure/work/gpt-5' },
			{ vendor: 'gemini', id: 'models/gemini-flash', modelIdentifier: 'gemini/Google/models/gemini-flash' },
			{ vendor: 'openrouter', id: 'anthropic/claude', modelIdentifier: 'openrouter/anthropic/claude' },
		];
		const copilotModelIds = ['auto', 'hydrafusion', 'claude-sonnet-4.5', 'gpt-4o-mini', 'gpt-5.6-luna', 'mai-code-1.1-flash'];

		assert.deepStrictEqual({
			byok: byokModels.map(model => {
				const id = getByokLmAgentModelId(model);
				return { id, isByok: isByokLmAgentModelId(id), sdkSelectionId: id === `${model.vendor}/${getByokLmSelectionModelId(model)}` };
			}),
			copilot: copilotModelIds.filter(isByokLmAgentModelId),
		}, {
			byok: [
				{ id: 'acme/test-model', isByok: true, sdkSelectionId: true },
				{ id: 'acme/test-model', isByok: true, sdkSelectionId: true },
				{ id: 'azure/work/gpt-5', isByok: true, sdkSelectionId: true },
				{ id: 'gemini/Google/models/gemini-flash', isByok: true, sdkSelectionId: true },
				{ id: 'openrouter/anthropic/claude', isByok: true, sdkSelectionId: true },
			],
			copilot: [],
		});
	});

	test('reads a reported model id as the selected BYOK model only when it is that model without its provider', () => {
		const cases: [reported: string | undefined, selected: string | undefined][] = [
			['gpt-5', 'acme/gpt-5'],
			['gpt-5', 'azure/work/gpt-5'],
			['work/gpt-5', 'azure/work/gpt-5'],
			['models/gemini-flash', 'gemini/Google/models/gemini-flash'],
			['acme/gpt-5', 'acme/gpt-5'],
			['gpt-5', 'gpt-5'],
			['gpt-5', 'acme/mini-gpt-5'],
			['gpt-4o', 'acme/gpt-5'],
			['gpt-5', undefined],
			[undefined, 'acme/gpt-5'],
		];

		assert.deepStrictEqual(cases.map(([reported, selected]) => resolveByokLmReportedModelId(reported, selected)), [
			'acme/gpt-5',
			'azure/work/gpt-5',
			'azure/work/gpt-5',
			'gemini/Google/models/gemini-flash',
			'acme/gpt-5',
			'gpt-5',
			'gpt-5',
			'gpt-4o',
			'gpt-5',
			undefined,
		]);
	});
});
