/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, readSessionApprovalLevel } from '../../common/sessionConfigProperties.js';
import type { SessionConfigState } from '../../common/state/sessionState.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { fromMissionControlConfigProperty, fromMissionControlConfigValues, missionControlSessionConfigAdapter, toMissionControlConfigValues, toMissionControlSessionConfig } from '../../node/missionControl/missionControlSessionConfig.js';

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

	for (const [effectiveApprovalMode, availableApprovalModes] of [
		['default', ['default', 'assisted', 'autoApprove']],
		['autoApprove', ['default', 'autoApprove']],
		['default', ['default']],
		['assisted', []],
	] as const) {
		test(`projects approval reports for ${effectiveApprovalMode} with choices ${availableApprovalModes.join(',')}`, () => {
			const reports = { effectiveApprovalMode, availableApprovalModes: [...availableApprovalModes] };
			const config: SessionConfigState = {
				schema: {
					type: 'object',
					properties: {
						autoApprove: platformSessionSchema.definition.autoApprove.protocol,
						effectiveApprovalMode: { type: 'string', title: 'Effective approvals', readOnly: true },
						availableApprovalModes: { type: 'array', title: 'Available approvals', readOnly: true },
					},
				},
				values: { autoApprove: 'assisted', ...reports },
			};
			const projected = toMissionControlSessionConfig(config);
			const approval = getSessionApprovalProperty(projected.schema)!;
			const wireReports = {
				effectiveApprovalMode: effectiveApprovalMode === 'default' ? 'manual' : effectiveApprovalMode === 'autoApprove' ? 'allow-all' : effectiveApprovalMode,
				availableApprovalModes: availableApprovalModes.map(value => value === 'default' ? 'manual' : value === 'autoApprove' ? 'allow-all' : value),
			};
			const action = { type: ActionType.SessionConfigChanged as const, config: reports };
			assert.deepStrictEqual({
				values: projected.values,
				effectiveSchema: projected.schema.properties.effectiveApprovalMode,
				availableSchema: projected.schema.properties.availableApprovalModes,
				effectiveLevel: readSessionApprovalLevel(approval, getEffectiveSessionApprovalValue(approval, projected.schema, projected.values)),
				availableLevels: getAvailableSessionApprovalValues(approval, projected.schema, projected.values).map(value => readSessionApprovalLevel(approval, value)),
				reportOnlyAction: missionControlSessionConfigAdapter.toClientAction(action, false),
				nativeValues: config.values,
				reportOnlyValues: toMissionControlConfigValues(reports),
			}, {
				values: { approvalMode: 'assisted', ...wireReports },
				effectiveSchema: config.schema.properties.effectiveApprovalMode,
				availableSchema: config.schema.properties.availableApprovalModes,
				effectiveLevel: effectiveApprovalMode,
				availableLevels: [...availableApprovalModes],
				reportOnlyAction: { ...action, config: wireReports },
				nativeValues: { autoApprove: 'assisted', ...reports },
				reportOnlyValues: wireReports,
			});
		});
	}

	test('projects approval report schema defaults and enums', () => {
		const effective = { type: 'string' as const, title: 'Effective approvals', readOnly: true, enum: ['default', 'assisted', 'autoApprove'], default: 'autoApprove' };
		const available = {
			type: 'array' as const, title: 'Available approvals', readOnly: true, default: ['default', 'assisted'],
			items: { type: 'string' as const, title: 'Approval mode', enum: ['default', 'assisted', 'autoApprove'] },
		};
		const projected = toMissionControlSessionConfig({
			schema: { type: 'object', properties: { autoApprove: platformSessionSchema.definition.autoApprove.protocol, effectiveApprovalMode: effective, availableApprovalModes: available } },
			values: {},
		});
		assert.deepStrictEqual({
			effective: projected.schema.properties.effectiveApprovalMode,
			available: projected.schema.properties.availableApprovalModes,
		}, {
			effective: { ...effective, enum: ['manual', 'assisted', 'allow-all'], default: 'allow-all' },
			available: { ...available, default: ['manual', 'assisted'], items: { ...available.items, enum: ['manual', 'assisted', 'allow-all'] } },
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
		const config = {
			schema: {
				type: 'object' as const,
				properties: {
					approvalMode: { type: 'string' as const, title: 'Approvals', enum: ['manual'] },
					isolation: { type: 'string' as const, title: 'Isolation', enum: ['folder', 'worktree'] },
				},
			},
			values: { approvalMode: 'manual', mode: 'plan', isolation: 'folder', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual'] },
		};
		assert.deepStrictEqual({
			values: toMissionControlSessionConfig(config).values,
			noConfig: fromMissionControlConfigValues(undefined),
			patch: toMissionControlConfigValues({ mode: 'plan' }),
		}, {
			values: { approvalMode: 'manual', mode: 'plan', target: 'workspace', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual'] },
			noConfig: undefined, patch: { mode: 'plan' },
		});
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

	for (const [isolation, target] of [['folder', 'workspace'], ['worktree', 'worktree']]) {
		test(`round trips ${target} and its base branch with approval and mode preferences`, () => {
			const native = { isolation, branch: 'release/mobile', autoApprove: 'assisted', mode: 'plan' };
			const wire = { target, baseBranch: 'release/mobile', approvalMode: 'assisted', mode: 'plan' };
			assert.deepStrictEqual({
				published: toMissionControlConfigValues(native),
				received: fromMissionControlConfigValues(wire),
				legacy: fromMissionControlConfigValues(native),
				matchingAliases: fromMissionControlConfigValues({ ...native, ...wire }),
				unchanged: { native, wire },
			}, { published: wire, received: native, legacy: native, matchingAliases: native, unchanged: { native, wire } });
		});
	}

	test('projects workspace schema metadata independently of approval configuration', () => {
		const isolation = {
			type: 'string' as const, title: 'Isolation', enum: ['worktree', 'folder'], default: 'worktree',
			enumLabels: ['Worktree', 'Folder'], enumDescriptions: ['Isolated', 'In place'], sessionMutable: false,
		};
		const branch = { type: 'string' as const, title: 'Branch', enum: ['main'], enumLabels: ['main'], default: 'main', enumDynamic: true, sessionMutable: false };
		const config = {
			schema: { type: 'object' as const, required: ['isolation', 'branch', 'mode'], properties: { isolation, branch } },
			values: { isolation: 'worktree', branch: 'release/mobile', mode: 'plan' },
		};
		assert.deepStrictEqual({
			projected: toMissionControlSessionConfig(config),
			unchanged: config,
		}, {
			projected: {
				schema: { type: 'object', required: ['target', 'baseBranch', 'mode'], properties: { target: { ...isolation, enum: ['worktree', 'workspace'] }, baseBranch: branch } },
				values: { target: 'worktree', baseBranch: 'release/mobile', mode: 'plan' },
			},
			unchanged: {
				schema: { type: 'object', required: ['isolation', 'branch', 'mode'], properties: { isolation, branch } },
				values: { isolation: 'worktree', branch: 'release/mobile', mode: 'plan' },
			},
		});
	});

	test('preserves folder-only non-repository schemas', () => {
		const isolation = { type: 'string' as const, title: 'Isolation', enum: ['folder'], default: 'folder', enumLabels: ['Folder'], readOnly: true, sessionMutable: false };
		assert.deepStrictEqual(toMissionControlSessionConfig({
			schema: { type: 'object', properties: { isolation } },
			values: { isolation: 'folder' },
		}), {
			schema: { type: 'object', properties: { target: { ...isolation, enum: ['workspace'], default: 'workspace' } } },
			values: { target: 'workspace' },
		});
	});

	test('leaves Copilot Host workspace configuration and its new-branch field unchanged', () => {
		const config = {
			schema: {
				type: 'object' as const,
				properties: {
					target: { type: 'string' as const, title: 'Target', enum: ['workspace', 'worktree'] },
					baseBranch: { type: 'string' as const, title: 'Base Branch', enumDynamic: true },
					branch: { type: 'string' as const, title: 'New Branch' },
				},
			},
			values: { target: 'worktree', baseBranch: 'main', branch: 'new-feature' },
		};
		assert.strictEqual(toMissionControlSessionConfig(config), config);
	});

	test('translates values only for the schema axes that were renamed', () => {
		const genericIsolation = { type: 'string' as const, title: 'Isolation' };
		const branch = { type: 'string' as const, title: 'Branch', enumDynamic: true };
		const approval = platformSessionSchema.definition.autoApprove.protocol;
		const configs: SessionConfigState[] = [
			{
				schema: { type: 'object', properties: { isolation: genericIsolation, branch } },
				values: { isolation: 'folder', branch: 'main' },
			},
			{
				schema: {
					type: 'object',
					properties: {
						autoApprove: approval,
						target: { type: 'string', title: 'Target', enum: ['workspace', 'worktree'] },
						baseBranch: branch,
						branch: { type: 'string', title: 'New Branch' },
					},
				},
				values: { autoApprove: 'default', target: 'worktree', baseBranch: 'main', branch: 'new-feature' },
			},
			{
				schema: { type: 'object', properties: { isolation: { ...genericIsolation, enum: ['folder', 'worktree'] }, branch: { type: 'string', title: 'Branch' } } },
				values: { isolation: 'folder', branch: 'feature' },
			},
		];
		assert.deepStrictEqual(configs.map(toMissionControlSessionConfig), [
			{
				schema: { type: 'object', properties: { isolation: genericIsolation, baseBranch: branch } },
				values: { isolation: 'folder', baseBranch: 'main' },
			},
			{
				schema: {
					type: 'object',
					properties: {
						approvalMode: { ...approval, enum: ['manual', 'assisted', 'allow-all'], default: 'manual' },
						target: configs[1].schema.properties.target,
						baseBranch: branch,
						branch: { type: 'string', title: 'New Branch' },
					},
				},
				values: { approvalMode: 'manual', target: 'worktree', baseBranch: 'main', branch: 'new-feature' },
			},
			{
				schema: { type: 'object', properties: { target: { ...genericIsolation, enum: ['workspace', 'worktree'] }, branch: { type: 'string', title: 'Branch' } } },
				values: { target: 'workspace', branch: 'feature' },
			},
		]);
	});

	test('translates partial updates and completion properties without adding missing preferences', () => {
		assert.deepStrictEqual({
			publishTarget: toMissionControlConfigValues({ isolation: 'folder' }),
			receiveTarget: fromMissionControlConfigValues({ target: 'workspace' }),
			publishBranch: toMissionControlConfigValues({ branch: 'release' }),
			receiveBranch: fromMissionControlConfigValues({ baseBranch: 'release' }),
			properties: ['target', 'baseBranch', 'approvalMode', 'mode', 'branch'].map(fromMissionControlConfigProperty),
			authoritative: toMissionControlConfigValues({ isolation: 'folder', target: 'worktree', branch: 'main', baseBranch: 'other' }),
		}, {
			publishTarget: { target: 'workspace' }, receiveTarget: { isolation: 'folder' },
			publishBranch: { baseBranch: 'release' }, receiveBranch: { branch: 'release' },
			properties: ['isolation', 'branch', 'autoApprove', 'mode', 'branch'],
			authoritative: { target: 'workspace', baseBranch: 'main' },
		});
	});

	for (const target of ['folder', 'invalid', null, true, undefined]) {
		test(`rejects invalid target ${target}`, () => {
			assert.throws(() => fromMissionControlConfigValues({ target }), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams);
		});
	}

	for (const baseBranch of [null, true, 42, undefined]) {
		test(`rejects invalid baseBranch ${baseBranch}`, () => {
			assert.throws(() => fromMissionControlConfigValues({ baseBranch }), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams);
		});
	}

	test('rejects conflicting native and wire workspace preferences', () => {
		assert.throws(() => fromMissionControlConfigValues({ target: 'workspace', isolation: 'worktree' }), /must select the same/);
		assert.throws(() => fromMissionControlConfigValues({ baseBranch: 'main', branch: 'release' }), /must select the same/);
	});

	test('the adapter preserves rejected wire actions and projects authoritative actions', () => {
		const native = { type: ActionType.SessionConfigChanged as const, config: { isolation: 'folder', branch: 'main' }, replace: true };
		const wire = { ...native, config: { target: 'workspace', baseBranch: 'main' } };
		const conflict = { ...native, config: { target: 'workspace', isolation: 'worktree' } };
		assert.deepStrictEqual({
			accepted: missionControlSessionConfigAdapter.toClientAction(native, false),
			rejectedNative: missionControlSessionConfigAdapter.toClientAction(native, true),
			rejectedWire: missionControlSessionConfigAdapter.toClientAction(wire, true),
			rejectedConflict: missionControlSessionConfigAdapter.toClientAction(conflict, true),
		}, { accepted: wire, rejectedNative: wire, rejectedWire: wire, rejectedConflict: conflict });
	});
});
