/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentModelInfo } from '../../common/agent.js';
import { parseAgentHostModelSelection } from '../../common/agentHostModelSelection.js';
import { CopilotModelTeamConfigKey, CopilotModelTeamRememberedConfigKey, copilotModelTeamSchema, omitCopilotModelTeamConfig, parseCopilotModelTeam, validateCopilotModelTeam } from '../../common/copilotModelTeam.js';
import { PolicyState } from '../../common/state/sessionState.js';

suite('Copilot model teams', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const worker: IAgentModelInfo = { id: 'worker', name: 'Worker', provider: 'copilotcli', supportsVision: false };
	const scout: IAgentModelInfo = { id: 'scout', name: 'Scout', provider: 'copilotcli', supportsVision: false };

	test('Single has an explicit JSON-safe reset', () => {
		assert.deepStrictEqual([
			parseCopilotModelTeam(undefined),
			parseCopilotModelTeam(JSON.parse(JSON.stringify({}))),
			parseCopilotModelTeam({ worker: { id: 'worker' } }),
			parseCopilotModelTeam({ worker: { id: 'worker' }, scout: { id: 'scout' } }),
		], [
			undefined,
			undefined,
			{ worker: { id: 'worker' } },
			{ worker: { id: 'worker' }, scout: { id: 'scout' } },
		]);
	});

	test('malformed teams are not treated as Single', () => {
		for (const value of [null, false, [], '', new Date(), { scout: { id: 'scout' } }, { worker: undefined }, { worker: { id: '' } }, { worker: { id: 'worker' }, extra: true }]) {
			assert.throws(() => parseCopilotModelTeam(value));
		}
	});

	test('Auto and BYOK selections use the ordinary catalog and full model schema', () => {
		const byok: IAgentModelInfo = {
			...scout, id: 'test-vendor/custom-model',
			configSchema: { type: 'object', properties: { contextSize: { type: 'number', title: 'Context', enum: [1000] } } },
		};
		const selection = { worker: { id: 'auto' }, scout: { id: byok.id, config: { contextSize: 1000 } } };
		const parsed = parseCopilotModelTeam(selection)!;
		validateCopilotModelTeam(parsed, [{ ...worker, id: 'auto' }, byok]);
		assert.deepStrictEqual(parsed, selection);
	});

	test('model configuration preserves JSON primitives and rejects nested or unsafe values', () => {
		assert.deepStrictEqual(parseAgentHostModelSelection({ id: 'worker', config: { effort: 'high', context: 1000, enabled: true, optional: null } }), {
			id: 'worker', config: { effort: 'high', context: 1000, enabled: true, optional: null },
		});
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
			assert.throws(() => parseAgentHostModelSelection({ id: 'worker', config: { effort: value } }), /Invalid model configuration/);
		}
		assert.throws(() => parseAgentHostModelSelection({ id: 'worker', config: { constructor: 'invalid' } }), /Invalid model configuration/);
	});

	test('shared parser retains caller-specific validation messages', () => {
		const messages = { selection: 'Invalid selection.', configuration: 'Invalid configuration.' };
		assert.throws(() => parseAgentHostModelSelection({}, messages), /Invalid selection/);
		assert.throws(() => parseAgentHostModelSelection({ id: 'worker', config: [] }, messages), /Invalid configuration/);
	});

	test('unavailable or policy-disabled models fail without substitution', () => {
		assert.doesNotThrow(() => validateCopilotModelTeam({ worker: { id: 'worker' }, scout: { id: 'scout' } }, [worker, scout]));
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'missing' } }, [worker, scout]), /Worker model 'missing'.*replacement/);
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'worker' }, scout: { id: 'scout' } }, [worker, { ...scout, policyState: PolicyState.Disabled }]), /Scout model 'scout'.*replacement/);
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'worker' } }, [{ ...worker, provider: 'claude' }]), /unavailable/);
	});

	test('model-specific configuration must be supported and complete', () => {
		const configured: IAgentModelInfo = {
			...worker,
			configSchema: {
				type: 'object',
				properties: {
					thinkingLevel: { type: 'string', title: 'Effort', enum: ['low', 'high'] },
					contextSize: { type: 'number', title: 'Context', enum: [1000] },
				},
				required: ['thinkingLevel'],
			},
		};
		assert.doesNotThrow(() => validateCopilotModelTeam({ worker: { id: 'worker', config: { thinkingLevel: 'high' } } }, [configured]));
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'worker' } }, [configured]), /requires a value/);
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'worker', config: { thinkingLevel: 'invalid' } } }, [configured]), /does not support/);
		assert.doesNotThrow(() => validateCopilotModelTeam({ worker: { id: 'worker', config: { thinkingLevel: 'high', contextSize: 1000 } } }, [configured]));
		assert.throws(() => validateCopilotModelTeam({ worker: { id: 'worker', config: { missingOption: true } } }, [configured]), /does not support/);
	});

	test('selection and saved preferences are the only Team configuration properties', () => {
		assert.deepStrictEqual({
			selectionMutable: copilotModelTeamSchema.definition[CopilotModelTeamConfigKey].protocol.sessionMutable,
			rememberedMutable: copilotModelTeamSchema.definition[CopilotModelTeamRememberedConfigKey].protocol.sessionMutable,
			keys: Object.keys(copilotModelTeamSchema.definition),
		}, {
			selectionMutable: true,
			rememberedMutable: true,
			keys: [CopilotModelTeamConfigKey, CopilotModelTeamRememberedConfigKey],
		});
	});

	test('team preferences and runtime state do not leak into automation templates', () => {
		const config = {
			mode: 'interactive',
			[CopilotModelTeamConfigKey]: { worker: { id: 'worker' } },
			[CopilotModelTeamRememberedConfigKey]: { worker: { id: 'worker', config: { thinkingLevel: 'high' } } },
			copilotModelTeamApplied: {},
			copilotModelTeamSupport: 2,
		};
		assert.deepStrictEqual(omitCopilotModelTeamConfig(config), { mode: 'interactive' });
		assert.ok(Object.hasOwn(config, CopilotModelTeamConfigKey));
	});
});
