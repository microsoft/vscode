/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { fromMissionControlConfigValues, toMissionControlConfigValues, toMissionControlSessionConfig } from '../../node/missionControl/missionControlSessionConfig.js';

suite('Mission Control session config', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [autoApprove, approvalMode] of [['default', 'manual'], ['assisted', 'assisted'], ['autoApprove', 'allow-all']]) {
		for (const mode of ['interactive', 'plan', 'autopilot']) {
			test(`round trips ${approvalMode} independently of ${mode}`, () => {
				const native = { autoApprove, mode, permissions: { allow: ['read'], deny: [] } };
				const wire = { approvalMode, mode, permissions: native.permissions };
				assert.deepStrictEqual({
					published: toMissionControlConfigValues(native),
					received: fromMissionControlConfigValues(wire),
					legacy: fromMissionControlConfigValues(native),
				}, { published: wire, received: native, legacy: native });
			});
		}
	}

	test('advertises both complete mode axes without mutating the native schema or values', () => {
		const config = { schema: platformSessionSchema.toProtocol(), values: { autoApprove: 'assisted', mode: 'plan' } };
		const approval = config.schema.properties.autoApprove;
		const projected = toMissionControlSessionConfig(config);
		assert.deepStrictEqual({
			approvals: projected.schema.properties.approvalMode,
			mode: projected.schema.properties.mode,
			values: projected.values,
			nativeProperty: projected.schema.properties.autoApprove,
			unchanged: config,
		}, {
			approvals: { ...approval, enum: ['manual', 'assisted', 'allow-all'], default: 'manual' },
			mode: platformSessionSchema.definition.mode.protocol,
			values: { approvalMode: 'assisted', mode: 'plan' },
			nativeProperty: undefined,
			unchanged: { schema: platformSessionSchema.toProtocol(), values: { autoApprove: 'assisted', mode: 'plan' } },
		});
	});

	test('preserves narrowed enums, labels, descriptions and required keys', () => {
		const projected = toMissionControlSessionConfig({
			schema: {
				type: 'object',
				required: ['autoApprove', 'mode'],
				properties: {
					autoApprove: {
						type: 'string', title: 'Approvals', enum: ['autoApprove', 'default'], default: 'autoApprove',
						enumLabels: ['Allow all', 'Manual'], enumDescriptions: ['No prompts', 'Prompts'], sessionMutable: true,
					},
				},
			},
			values: { autoApprove: 'default' },
		});
		assert.deepStrictEqual(projected, {
			schema: {
				type: 'object', required: ['approvalMode', 'mode'],
				properties: {
					approvalMode: {
						type: 'string', title: 'Approvals', enum: ['allow-all', 'manual'], default: 'allow-all',
						enumLabels: ['Allow all', 'Manual'], enumDescriptions: ['No prompts', 'Prompts'], sessionMutable: true,
					},
				},
			},
			values: { approvalMode: 'manual' },
		});
	});

	test('does not rewrite another host schema or unrelated configuration', () => {
		const config = { schema: { type: 'object' as const, properties: { approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual'] } } }, values: { approvalMode: 'manual', mode: 'plan' } };
		assert.deepStrictEqual({
			sameConfig: toMissionControlSessionConfig(config) === config,
			noConfig: fromMissionControlConfigValues(undefined),
			patch: toMissionControlConfigValues({ mode: 'plan' }),
		}, { sameConfig: true, noConfig: undefined, patch: { mode: 'plan' } });
	});

	test('publishes the authoritative native preference rather than a stray alias', () => {
		assert.deepStrictEqual(toMissionControlConfigValues({ autoApprove: 'default', approvalMode: 'allow-all', mode: 'plan' }), { approvalMode: 'manual', mode: 'plan' });
	});

	for (const approvalMode of ['autoApprove', 'autopilot', 'invalid', null, true]) {
		test(`rejects invalid approvalMode ${approvalMode}`, () => {
			assert.throws(() => fromMissionControlConfigValues({ approvalMode }), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams);
		});
	}

	test('rejects conflicting native and wire approval preferences', () => {
		assert.throws(() => fromMissionControlConfigValues({ approvalMode: 'manual', autoApprove: 'autoApprove' }), /must select the same/);
		assert.deepStrictEqual(fromMissionControlConfigValues({ approvalMode: 'allow-all', autoApprove: 'autoApprove' }), { autoApprove: 'autoApprove' });
	});
});
