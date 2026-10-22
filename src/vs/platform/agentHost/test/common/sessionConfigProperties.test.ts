/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyChatConfigLayers, filterChatConfigValues, filterSessionConfigValues, getChatConfigChain, getChatConfigWriteTarget, getEffectiveChatConfig, getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getWithheldSessionApprovalValues, getSessionApprovalProperty, getSessionBaseBranchProperty, getSessionConfigPresentationKey, getSessionIsolationProperty, getSessionModeProperty, getSessionWorkspaceProperties, isChatConfigProperty, isSessionConfigWritable, readSessionApprovalLevel, readSessionIsolation, mergeChatConfigChain, splitChatConfigPatch, validateChatConfigWrite, validateChatPickerConfigWrite, validateSessionConfigWrite, writeSessionApprovalLevel, writeSessionIsolation } from '../../common/sessionConfigProperties.js';
import type { SessionConfigSchema } from '../../common/state/protocol/commands.js';
import { ChatOriginKind, type ChatSummary } from '../../common/state/protocol/state.js';

suite('Session config properties', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const copilot: SessionConfigSchema = {
		type: 'object',
		properties: {
			approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'], default: 'assisted', sessionMutable: true },
			effectiveApprovalMode: { type: 'string', title: 'Effective approvals', readOnly: true },
			availableApprovalModes: { type: 'array', title: 'Available approvals', readOnly: true },
			target: { type: 'string', title: 'Target', enum: ['workspace', 'worktree'], default: 'workspace', sessionMutable: false },
			baseBranch: { type: 'string', title: 'Base branch', enum: [], enumDynamic: true, sessionMutable: false },
			branch: { type: 'string', title: 'New branch', sessionMutable: false },
			mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], sessionMutable: true },
		},
	};

	const vscode: SessionConfigSchema = {
		type: 'object',
		properties: {
			autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'], default: 'default', sessionMutable: true },
			isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder', sessionMutable: false },
			branch: { type: 'string', title: 'Base branch', enum: ['main', 'release'], default: 'main', sessionMutable: false },
			mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], default: 'interactive', sessionMutable: true },
		},
	};

	test('VS Code properties preserve existing choices, defaults, and the meaning of branch', () => {
		const approval = getSessionApprovalProperty(vscode);
		const workspace = getSessionWorkspaceProperties(vscode);
		assert.deepStrictEqual({
			approval: { key: approval?.key, choices: approval?.schema.enum, default: readSessionApprovalLevel(approval, approval?.schema.default) },
			workspace: { isolation: workspace.isolation?.key, folder: writeSessionIsolation(workspace.isolation, 'folder'), branch: workspace.baseBranch?.key },
			effective: getEffectiveSessionApprovalValue(approval!, vscode, { autoApprove: 'assisted' }),
			presentation: getSessionConfigPresentationKey('branch', vscode),
		}, {
			approval: { key: 'autoApprove', choices: ['default', 'assisted', 'autoApprove'], default: 'default' },
			workspace: { isolation: 'isolation', folder: 'folder', branch: 'branch' },
			effective: 'assisted', presentation: 'branch',
		});
	});

	for (const [name, schema, values, runtime] of [
		['VS Code', vscode, { autoApprove: 'assisted', isolation: 'worktree', branch: 'release', mode: 'plan' }, { autoApprove: 'assisted', mode: 'plan' }],
		['Copilot D', copilot, { approvalMode: 'assisted', target: 'worktree', baseBranch: 'release', mode: 'plan' }, { approvalMode: 'assisted', mode: 'plan' }],
	] as const) {
		test(`${name} schema filters stale aliases without renaming advertised keys`, () => {
			const remembered = { autoApprove: 'autoApprove', isolation: 'folder', branch: 'release', approvalMode: 'allow-all', target: 'workspace', baseBranch: 'main', mode: 'interactive' };
			assert.deepStrictEqual({
				creation: filterSessionConfigValues(schema, values),
				runtime: filterSessionConfigValues(schema, values, false),
				empty: filterSessionConfigValues(schema, {}),
				keys: Object.keys(filterSessionConfigValues(schema, remembered)).sort(),
			}, {
				creation: values, runtime, empty: {},
				keys: name === 'VS Code' ? ['autoApprove', 'branch', 'isolation', 'mode'] : ['approvalMode', 'baseBranch', 'branch', 'mode', 'target'],
			});
		});
	}

	test('maps approval choices without changing host keys or values', () => {
		const approvalProperty = getSessionApprovalProperty(copilot)!;
		assert.deepStrictEqual({
			key: approvalProperty.key,
			defaultLevel: readSessionApprovalLevel(approvalProperty, approvalProperty.schema.default),
			read: approvalProperty.schema.enum?.map(value => readSessionApprovalLevel(approvalProperty, value)),
			write: ['default', 'assisted', 'autoApprove', 'autopilot'].map(value => writeSessionApprovalLevel(approvalProperty, value)),
		}, {
			key: 'approvalMode', defaultLevel: 'assisted',
			read: ['default', 'assisted', 'autoApprove'],
			write: ['manual', 'assisted', 'allow-all', undefined],
		});
	});

	test('prefers the whole VS convention independent of property order', () => {
		const schemas = [false, true].map(reverse => ({
			type: 'object' as const,
			properties: Object.fromEntries((reverse ? Object.entries(copilot.properties).reverse() : Object.entries(copilot.properties)).concat([
				['autoApprove', { type: 'string', title: 'VS approvals', enum: ['default', 'autoApprove'] }],
				['isolation', { type: 'string', title: 'VS isolation', enum: ['folder', 'worktree'] }],
			])),
		}));
		assert.deepStrictEqual(schemas.map(schema => ({
			approval: getSessionApprovalProperty(schema)?.key,
			isolation: getSessionWorkspaceProperties(schema).isolation?.key,
			branch: getSessionWorkspaceProperties(schema).baseBranch?.key,
		})), [
			{ approval: 'autoApprove', isolation: 'isolation', branch: undefined },
			{ approval: 'autoApprove', isolation: 'isolation', branch: undefined },
		]);
	});

	test('malformed VS keys never fall through to a Copilot property or mix workspace axes', () => {
		const schema: SessionConfigSchema = {
			...copilot,
			properties: {
				...copilot.properties,
				autoApprove: { type: 'string', title: 'Custom approvals', enum: ['custom'] },
				isolation: { type: 'string', title: 'Custom isolation', enum: ['sandbox'] },
			},
		};
		assert.deepStrictEqual({
			approval: getSessionApprovalProperty(schema),
			isolation: getSessionWorkspaceProperties(schema).isolation,
			branch: getSessionWorkspaceProperties(schema).baseBranch,
			filtered: filterSessionConfigValues(schema, { autoApprove: 'custom', approvalMode: 'allow-all', isolation: 'sandbox', target: 'worktree', baseBranch: 'main' }),
		}, {
			approval: undefined, isolation: undefined, branch: undefined,
			filtered: { autoApprove: 'custom', isolation: 'sandbox' },
		});
	});

	test('distinguishes Copilot base branch from the new branch name', () => {
		const workspace = getSessionWorkspaceProperties(copilot);
		assert.deepStrictEqual({
			isolationKey: workspace.isolation?.key,
			workspaceValue: writeSessionIsolation(workspace.isolation, 'folder'),
			readWorkspaceValue: readSessionIsolation(workspace.isolation, 'workspace'),
			baseBranch: workspace.baseBranch?.key,
			presentation: ['target', 'baseBranch', 'branch'].map(key => getSessionConfigPresentationKey(key, copilot)),
		}, {
			isolationKey: 'target', workspaceValue: 'workspace', readWorkspaceValue: 'folder', baseBranch: 'baseBranch',
			presentation: ['isolation', 'branch', 'newBranch'],
		});
	});

	test('native mode remains on the advertised mode axis', () => {
		const modeProperty = getSessionModeProperty(copilot);
		assert.deepStrictEqual({
			key: modeProperty?.key,
			choices: modeProperty?.schema.enum,
			accepted: filterSessionConfigValues(copilot, { mode: 'autopilot' }),
			unadvertised: filterSessionConfigValues(copilot, { mode: 'shell' }),
		}, {
			key: 'mode',
			choices: ['interactive', 'plan', 'autopilot'],
			accepted: { mode: 'autopilot' }, unadvertised: {},
		});
	});

	test('keeps requested approvals distinct from effective and available modes', () => {
		const approvalProperty = getSessionApprovalProperty(copilot)!;
		const values = { approvalMode: 'allow-all', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual', 'assisted'] };
		assert.deepStrictEqual({
			effective: getEffectiveSessionApprovalValue(approvalProperty, copilot, values),
			requested: values.approvalMode,
			choices: getAvailableSessionApprovalValues(approvalProperty, copilot, values),
			absent: getEffectiveSessionApprovalValue(approvalProperty, copilot, { approvalMode: 'assisted' }),
			unknown: readSessionApprovalLevel(approvalProperty, getEffectiveSessionApprovalValue(approvalProperty, copilot, { effectiveApprovalMode: 'unknown' })),
			emptyChoices: getAvailableSessionApprovalValues(approvalProperty, copilot, { availableApprovalModes: [] }),
			withheld: getWithheldSessionApprovalValues(approvalProperty, copilot, values),
			noReport: getWithheldSessionApprovalValues(approvalProperty, copilot, { approvalMode: 'manual' }),
		}, {
			effective: 'manual', requested: 'allow-all', choices: ['manual', 'assisted'],
			absent: 'assisted', unknown: undefined, emptyChoices: [],
			withheld: ['allow-all'], noReport: [],
		});
	});

	test('filters unsupported VS seeds and immutable runtime writes without checking readOnly', () => {
		const values = { autoApprove: 'autoApprove', isolation: 'worktree', worktreeBranchPrefix: 'user/', approvalMode: 'assisted', effectiveApprovalMode: 'manual', availableApprovalModes: ['manual', 'assisted'], target: 'worktree', baseBranch: 'main', branch: 'new-session', mode: 'plan' };
		assert.deepStrictEqual({
			creation: filterSessionConfigValues(copilot, values),
			runtime: filterSessionConfigValues(copilot, values, false),
			noDefaultInvented: filterSessionConfigValues(copilot, {}),
		}, {
			creation: { approvalMode: 'assisted', target: 'worktree', baseBranch: 'main', branch: 'new-session', mode: 'plan' },
			runtime: { approvalMode: 'assisted', mode: 'plan' },
			noDefaultInvented: {},
		});
	});

	for (const key of ['autoApprove', 'approvalMode']) {
		test(`filters host-owned approval reports for ${key} without dropping other readOnly values`, () => {
			const schema: SessionConfigSchema = {
				type: 'object', properties: {
					[key]: key === 'autoApprove' ? vscode.properties.autoApprove : copilot.properties.approvalMode,
					effectiveApprovalMode: { type: 'string', title: 'Effective', readOnly: true, sessionMutable: true },
					availableApprovalModes: { type: 'array', title: 'Available', readOnly: true, sessionMutable: true },
					worktreeBranchPrefix: { type: 'string', title: 'Prefix', readOnly: true, sessionMutable: true },
				},
			};
			const manual = key === 'autoApprove' ? 'default' : 'manual';
			const values = { [key]: manual, effectiveApprovalMode: manual, availableApprovalModes: [manual], worktreeBranchPrefix: 'user/' };
			assert.deepStrictEqual([true, false].map(isNew => filterSessionConfigValues(schema, values, isNew)), [
				{ [key]: manual, worktreeBranchPrefix: 'user/' },
				{ [key]: manual, worktreeBranchPrefix: 'user/' },
			]);
		});
	}

	test('rejects unavailable, unadvertised and immutable writes before dispatch', () => {
		assert.throws(() => validateSessionConfigWrite(copilot, { availableApprovalModes: ['manual'] }, 'approvalMode', 'allow-all', false), /does not offer/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'effectiveApprovalMode', 'allow-all', false), /not writable/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'autoApprove', 'autoApprove', true), /not writable/);
		assert.throws(() => validateSessionConfigWrite(copilot, {}, 'target', 'workspace', false), /not writable/);
	});

	test('readOnly values can be forwarded and validated without enabling picker edits', () => {
		const schema: SessionConfigSchema = {
			type: 'object',
			properties: {
				worktreeBranchPrefix: { type: 'string', title: 'Branch prefix', readOnly: true, sessionMutable: false },
				worktreeIncludeFiles: { type: 'array', title: 'Included files', readOnly: true, sessionMutable: false },
				worktreeSymlinkFolders: { type: 'array', title: 'Symlinked folders', readOnly: true, sessionMutable: false },
				pullRequestUrl: { type: 'string', title: 'Pull request', readOnly: true, sessionMutable: false },
				shellInitScripts: { type: 'array', title: 'Shell initialization', readOnly: true, sessionMutable: true },
				providerOption: { type: 'string', title: 'Provider option', enum: ['allowed'], readOnly: true, sessionMutable: true },
			},
		};
		const values = {
			worktreeBranchPrefix: 'user/',
			worktreeIncludeFiles: ['product.overrides.json'],
			worktreeSymlinkFolders: ['node_modules'],
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
			shellInitScripts: [{ shell: 'bash', script: 'source .venv/bin/activate' }],
			providerOption: 'allowed',
		};
		for (const [key, value] of Object.entries(values)) {
			assert.doesNotThrow(() => validateSessionConfigWrite(schema, values, key, value, true));
		}
		assert.doesNotThrow(() => validateSessionConfigWrite(schema, values, 'shellInitScripts', values.shellInitScripts, false));
		assert.doesNotThrow(() => validateSessionConfigWrite(schema, values, 'providerOption', 'allowed', false));
		assert.throws(() => validateSessionConfigWrite(schema, values, 'providerOption', 'unsupported', true), /does not offer/);
		assert.deepStrictEqual({
			creation: filterSessionConfigValues(schema, values),
			runtime: filterSessionConfigValues(schema, values, false),
			pickerEditable: Object.values(schema.properties).map(property => isSessionConfigWritable(property, true)),
		}, {
			creation: values,
			runtime: { shellInitScripts: values.shellInitScripts, providerOption: 'allowed' },
			pickerEditable: [false, false, false, false, false, false],
		});
	});

	test('concrete selectors expose the original host property without constructing converted choices', () => {
		assert.deepStrictEqual([
			getSessionApprovalProperty(copilot),
			getSessionIsolationProperty(copilot),
			getSessionBaseBranchProperty(copilot),
		], [
			{ key: 'approvalMode', schema: copilot.properties.approvalMode },
			{ key: 'target', schema: copilot.properties.target },
			{ key: 'baseBranch', schema: copilot.properties.baseBranch },
		]);
	});

	test('creation filtering and explicit validation share the same schema restrictions', () => {
		const values = { availableApprovalModes: ['manual', 'assisted'] };
		const candidates = { approvalMode: 'allow-all', effectiveApprovalMode: 'manual', target: 'worktree', baseBranch: 'main', mode: 'plan', unknown: true };
		for (const [key, value] of Object.entries(candidates)) {
			if (key === 'mode') {
				assert.doesNotThrow(() => validateSessionConfigWrite(copilot, values, key, value, false));
			} else {
				assert.throws(() => validateSessionConfigWrite(copilot, values, key, value, false), /not writable|does not offer/);
			}
		}
		assert.deepStrictEqual(filterSessionConfigValues(copilot, { ...values, ...candidates }, false), { mode: 'plan' });
	});
});

suite('Chat config properties', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const schema: SessionConfigSchema = {
		type: 'object',
		properties: {
			autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'assisted', 'autoApprove'], default: 'default', sessionMutable: true, chatMutable: true },
			mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], default: 'interactive', sessionMutable: true, chatMutable: true },
			effectiveApprovalMode: { type: 'string', title: 'Effective approvals', readOnly: true, chatMutable: true },
			chatOnly: { type: 'string', title: 'Chat only', enum: ['a', 'b'], chatMutable: true },
			isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder', sessionMutable: false },
			webSearch: { type: 'boolean', title: 'Web search', sessionMutable: true },
		},
	};

	test('only chatMutable properties are set per chat', () => {
		assert.deepStrictEqual({
			mutable: Object.keys(schema.properties).filter(key => isChatConfigProperty(schema, key)),
			noSchema: isChatConfigProperty(undefined, 'autoApprove'),
			filtered: filterChatConfigValues(schema, { autoApprove: 'autoApprove', isolation: 'worktree', webSearch: true, mode: undefined, unknown: 1 }),
			split: splitChatConfigPatch(schema, { autoApprove: 'assisted', webSearch: false, isolation: 'worktree' }),
		}, {
			mutable: ['autoApprove', 'mode', 'effectiveApprovalMode', 'chatOnly'],
			noSchema: false,
			filtered: { autoApprove: 'autoApprove' },
			split: { chat: { autoApprove: 'assisted' }, session: { webSearch: false, isolation: 'worktree' } },
		});
	});

	test('the effective config applies the chat\'s own settable values over the session\'s', () => {
		const session = { schema, values: { autoApprove: 'default', mode: 'plan', webSearch: true } };
		assert.deepStrictEqual({
			absent: getEffectiveChatConfig(session, undefined) === session,
			empty: getEffectiveChatConfig(session, { values: {} }) === session,
			overlay: getEffectiveChatConfig(session, { values: { autoApprove: 'autoApprove', webSearch: false } }).values,
		}, {
			absent: true,
			empty: true,
			overlay: { autoApprove: 'autoApprove', mode: 'plan', webSearch: true },
		});
	});

	test('a chat that chose its own approvals is shown them until a mode is reported for the chat', () => {
		const session = { schema, values: { autoApprove: 'default', mode: 'interactive', effectiveApprovalMode: 'autoApprove' } };
		const approval = (own: Record<string, unknown> | undefined) => {
			const config = getEffectiveChatConfig(session, own && { values: own });
			return getEffectiveSessionApprovalValue(getSessionApprovalProperty(schema)!, schema, config.values);
		};
		assert.deepStrictEqual({
			inherited: approval(undefined),
			otherProperty: approval({ mode: 'plan' }),
			chosen: approval({ autoApprove: 'assisted' }),
			reported: approval({ autoApprove: 'assisted', effectiveApprovalMode: 'default' }),
		}, {
			// A chat taking the session's approvals is shown the mode reported for them.
			inherited: 'autoApprove',
			otherProperty: 'autoApprove',
			chosen: 'assisted',
			reported: 'default',
		});
	});

	test('a reported approval mode applies only to the approvals of its own layer and those outside it', () => {
		assert.deepStrictEqual({
			inheritsSession: applyChatConfigLayers({ autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' }, [{ mode: 'plan' }]),
			ownApprovals: applyChatConfigLayers({ autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' }, [{ autoApprove: 'default' }]),
			ownReport: applyChatConfigLayers({ effectiveApprovalMode: 'autoApprove' }, [{ autoApprove: 'autoApprove', effectiveApprovalMode: 'default' }]),
			// A subagent: its spawning chat chose approvals, the session's report does not apply.
			spawnerApprovals: applyChatConfigLayers({ autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' }, [{}, { autoApprove: 'default' }]),
			chain: mergeChatConfigChain([{ values: { autoApprove: 'default' } }, { values: { autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' } }]),
		}, {
			inheritsSession: { mode: 'plan', autoApprove: 'autoApprove', effectiveApprovalMode: 'autoApprove' },
			ownApprovals: { autoApprove: 'default' },
			ownReport: { autoApprove: 'autoApprove', effectiveApprovalMode: 'default' },
			spawnerApprovals: { autoApprove: 'default' },
			chain: { values: { autoApprove: 'default' } },
		});
	});

	test('a subagent\'s config chain follows the recorded spawning chats', () => {
		const chats: Pick<ChatSummary, 'resource' | 'origin'>[] = [
			{ resource: 'chat:/main' },
			{ resource: 'chat:/fork', origin: { kind: ChatOriginKind.Fork, chat: 'chat:/main', turnId: 't' } },
			{ resource: 'chat:/sub', origin: { kind: ChatOriginKind.Tool, chat: 'chat:/fork', toolCallId: 'a' } },
			{ resource: 'chat:/nested', origin: { kind: ChatOriginKind.Tool, chat: 'chat:/sub', toolCallId: 'b' } },
			{ resource: 'chat:/orphan', origin: { kind: ChatOriginKind.Tool, chat: 'chat:/gone', toolCallId: 'c' } },
			{ resource: 'chat:/loop', origin: { kind: ChatOriginKind.Tool, chat: 'chat:/loop', toolCallId: 'd' } },
		];
		assert.deepStrictEqual({
			nested: getChatConfigChain(chats, 'chat:/nested'),
			fork: getChatConfigChain(chats, 'chat:/fork'),
			orphan: getChatConfigChain(chats, 'chat:/orphan'),
			loop: getChatConfigChain(chats, 'chat:/loop'),
			writeTarget: [getChatConfigWriteTarget(chats, 'chat:/nested'), getChatConfigWriteTarget(chats, 'chat:/main')],
			merged: mergeChatConfigChain([undefined, { values: { mode: 'plan' } }, { values: { mode: 'interactive', autoApprove: 'autoApprove' } }]),
			none: mergeChatConfigChain([undefined, undefined]),
		}, {
			nested: ['chat:/nested', 'chat:/sub', 'chat:/fork'],
			// A fork copied its source's values when it was created; it does not inherit them.
			fork: ['chat:/fork'],
			orphan: ['chat:/orphan', 'chat:/gone'],
			loop: ['chat:/loop'],
			writeTarget: ['chat:/fork', 'chat:/main'],
			merged: { values: { mode: 'plan', autoApprove: 'autoApprove' } },
			none: undefined,
		});
	});

	test('chat writes require chatMutable and then follow the session write rules', () => {
		const values = { autoApprove: 'default' };
		assert.doesNotThrow(() => validateChatConfigWrite(schema, values, 'autoApprove', 'autoApprove'));
		assert.throws(() => validateChatConfigWrite(schema, values, 'webSearch', false), /cannot be set for a chat/);
		assert.throws(() => validateChatConfigWrite(schema, values, 'isolation', 'worktree'), /cannot be set for a chat/);
		assert.throws(() => validateChatConfigWrite(schema, values, 'mode', 'unknown'), /does not offer/);
		assert.throws(() => validateChatConfigWrite(schema, values, 'effectiveApprovalMode', 'default'), /not writable/);
	});

	test('a property a chat may set is writable for the chat even when the session\'s value is fixed', () => {
		const values = { chatOnly: 'a' };
		assert.deepStrictEqual({
			chatWrite: tryWrite(() => validateChatConfigWrite(schema, values, 'chatOnly', 'b')),
			chatWriteInvalid: tryWrite(() => validateChatConfigWrite(schema, values, 'chatOnly', 'c')),
			sessionWrite: tryWrite(() => validateSessionConfigWrite(schema, values, 'chatOnly', 'b', false)),
			pickerRunning: tryWrite(() => validateChatPickerConfigWrite(schema, values, 'chatOnly', 'b', false)),
			pickerNewSession: tryWrite(() => validateChatPickerConfigWrite(schema, values, 'chatOnly', 'b', true)),
			pickerGate: [isSessionConfigWritable(schema.properties.chatOnly, false), isSessionConfigWritable(schema.properties.effectiveApprovalMode, false), isSessionConfigWritable(schema.properties.isolation, false)],
		}, {
			chatWrite: 'ok',
			chatWriteInvalid: 'Session configuration \'chatOnly\' does not offer \'c\'.',
			sessionWrite: 'Session configuration \'chatOnly\' is not writable.',
			pickerRunning: 'ok',
			pickerNewSession: 'ok',
			pickerGate: [true, false, false],
		});
	});

	function tryWrite(write: () => void): string {
		try {
			write();
			return 'ok';
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
});
