/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { LanguageModelToolsConfirmationService } from '../../../browser/tools/languageModelToolsConfirmationService.js';
import { ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { computeCombinationKey, ILanguageModelToolConfirmationActions, ILanguageModelToolConfirmationContribution, ILanguageModelToolConfirmationRef } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('LanguageModelToolsConfirmationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: LanguageModelToolsConfirmationService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
	});

	function createToolRef(toolId: string, source: ToolDataSource = ToolDataSource.Internal, parameters: unknown = {}): ILanguageModelToolConfirmationRef {
		return { toolId, source, parameters };
	}

	function createMcpToolRef(toolId: string, definitionId: string, serverLabel: string, parameters: unknown = {}): ILanguageModelToolConfirmationRef {
		return {
			toolId,
			source: {
				type: 'mcp',
				label: serverLabel,
				serverLabel,
				instructions: undefined,
				collectionId: 'testCollection',
				definitionId
			},
			parameters
		};
	}

	async function createCombinationRef(toolId: string, parameters: unknown, combinationLabel: string): Promise<ILanguageModelToolConfirmationRef> {
		return {
			...createToolRef(toolId, ToolDataSource.Internal, parameters),
			combination: {
				label: combinationLabel,
				key: await computeCombinationKey(toolId, parameters),
			},
		};
	}

	test('getPreConfirmAction returns undefined by default', () => {
		const ref = createToolRef('testTool');
		const result = service.getPreConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('getPostConfirmAction returns undefined by default', () => {
		const ref = createToolRef('testTool');
		const result = service.getPostConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('getPreConfirmActions returns default tool-level actions', () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);

		assert.ok(actions.length >= 3);
		assert.ok(actions.some(a => a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Always Allow')));
	});

	test('getPostConfirmActions returns default tool-level actions', () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);

		assert.ok(actions.length >= 3);
		assert.ok(actions.some(a => a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Always Allow')));
	});

	test('getPreConfirmActions includes server-level actions for MCP tools', () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);

		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Always Allow')));
	});

	test('getPostConfirmActions includes server-level actions for MCP tools', () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPostConfirmActions(ref);

		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Session')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Workspace')));
		assert.ok(actions.some(a => a.label.includes('Test Server') && a.label.includes('Always Allow')));
	});

	test('pre-execution session confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('pre-execution workspace confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));

		assert.ok(workspaceAction);
		await workspaceAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('pre-execution profile confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));

		assert.ok(profileAction);
		await profileAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('post-execution session confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('post-execution workspace confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));

		assert.ok(workspaceAction);
		await workspaceAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('post-execution profile confirmation works', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPostConfirmActions(ref);
		const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));

		assert.ok(profileAction);
		await profileAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('MCP server-level pre-execution session confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('MCP server-level pre-execution workspace confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Workspace'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('MCP server-level pre-execution profile confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPreConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Always Allow'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'profile' });
	});

	test('MCP server-level post-execution session confirmation works', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
		const actions = service.getPostConfirmActions(ref);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result = service.getPostConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('MCP server-level confirmation applies to all tools from that server', async () => {
		const ref1 = createMcpToolRef('mcpTool1', 'serverId', 'Test Server');
		const ref2 = createMcpToolRef('mcpTool2', 'serverId', 'Test Server');

		const actions = service.getPreConfirmActions(ref1);
		const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));

		assert.ok(serverAction);
		await serverAction.select();

		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('tool-level confirmation takes precedence over server-level confirmation', async () => {
		const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');

		// Set server-level confirmation
		const serverActions = service.getPreConfirmActions(ref);
		const serverAction = serverActions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
		assert.ok(serverAction);
		await serverAction.select();

		// Set tool-level confirmation to a different scope
		const toolActions = service.getPreConfirmActions(ref);
		const toolAction = toolActions.find(a => !a.label.includes('Test Server') && a.label.includes('Workspace'));
		assert.ok(toolAction);
		await toolAction.select();

		// Tool-level should take precedence
		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('registerConfirmationContribution allows custom pre-confirm actions', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const result = service.getPreConfirmAction(ref);

		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('registerConfirmationContribution allows custom post-confirm actions', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPostConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const result = service.getPostConfirmAction(ref);

		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('registerConfirmationContribution allows custom pre-confirm action list', () => {
		const customActions: ILanguageModelToolConfirmationActions[] = [
			{
				label: 'Custom Action 1',
				select: async () => true
			},
			{
				label: 'Custom Action 2',
				select: async () => true
			}
		];

		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmActions: (ref) => customActions
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		// Should include both custom actions and default actions
		assert.ok(actions.some(a => a.label === 'Custom Action 1'));
		assert.ok(actions.some(a => a.label === 'Custom Action 2'));
		assert.ok(actions.some(a => a.label.includes('Session')));
	});

	test('registerConfirmationContribution with canUseDefaultApprovals=false only shows custom actions', () => {
		const customActions: ILanguageModelToolConfirmationActions[] = [
			{
				label: 'Custom Action Only',
				select: async () => true
			}
		];

		const contribution: ILanguageModelToolConfirmationContribution = {
			canUseDefaultApprovals: false,
			getPreConfirmActions: (ref) => customActions
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].label, 'Custom Action Only');
	});

	test('contribution getPreConfirmAction takes precedence over default stores', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		// Contribution should take precedence even without setting default
		const ref = createToolRef('customTool');
		const result = service.getPreConfirmAction(ref);
		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);
	});

	test('contribution with canUseDefaultApprovals=false prevents default store checks', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			canUseDefaultApprovals: false,
			getPreConfirmAction: () => undefined
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		const ref = createToolRef('customTool');
		const actions = service.getPreConfirmActions(ref);

		// Should have no actions since canUseDefaultApprovals is false
		assert.strictEqual(actions.length, 0);
	});

	test('resetToolAutoConfirmation clears all confirmations', async () => {
		const ref1 = createToolRef('tool1');
		const ref2 = createMcpToolRef('mcpTool', 'serverId', 'Test Server');

		// Set some confirmations
		const actions1 = service.getPreConfirmActions(ref1);
		const sessionAction1 = actions1.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(sessionAction1);
		await sessionAction1.select();

		const actions2 = service.getPreConfirmActions(ref2);
		const serverAction = actions2.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
		assert.ok(serverAction);
		await serverAction.select();

		// Verify they're set
		assert.ok(service.getPreConfirmAction(ref1));
		assert.ok(service.getPreConfirmAction(ref2));

		// Reset
		service.resetToolAutoConfirmation();

		// Verify they're cleared
		assert.strictEqual(service.getPreConfirmAction(ref1), undefined);
		assert.strictEqual(service.getPreConfirmAction(ref2), undefined);
	});

	test('resetToolAutoConfirmation calls contribution reset', () => {
		let resetCalled = false;
		const contribution: ILanguageModelToolConfirmationContribution = {
			reset: () => {
				resetCalled = true;
			}
		};

		store.add(service.registerConfirmationContribution('customTool', contribution));

		service.resetToolAutoConfirmation();

		assert.strictEqual(resetCalled, true);
	});

	test('disposing contribution registration removes it', () => {
		const contribution: ILanguageModelToolConfirmationContribution = {
			getPreConfirmAction: (ref) => {
				return { type: ToolConfirmKind.UserAction };
			}
		};

		const disposable = service.registerConfirmationContribution('customTool', contribution);

		const ref = createToolRef('customTool');
		let result = service.getPreConfirmAction(ref);
		assert.ok(result);
		assert.strictEqual(result.type, ToolConfirmKind.UserAction);

		disposable.dispose();

		result = service.getPreConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('different tools have independent confirmations', async () => {
		const ref1 = createToolRef('tool1');
		const ref2 = createToolRef('tool2');

		// Set session for tool1
		const actions1 = service.getPreConfirmActions(ref1);
		const sessionAction = actions1.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(sessionAction);
		await sessionAction.select();

		// Set workspace for tool2
		const actions2 = service.getPreConfirmActions(ref2);
		const workspaceAction = actions2.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
		assert.ok(workspaceAction);
		await workspaceAction.select();

		// Verify they're independent
		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('pre and post execution confirmations are independent', async () => {
		const ref = createToolRef('testTool');

		// Set pre-execution to session
		const preActions = service.getPreConfirmActions(ref);
		const preSessionAction = preActions.find(a => a.label.includes('Session') && !a.label.includes('Server'));
		assert.ok(preSessionAction);
		await preSessionAction.select();

		// Set post-execution to workspace
		const postActions = service.getPostConfirmActions(ref);
		const postWorkspaceAction = postActions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
		assert.ok(postWorkspaceAction);
		await postWorkspaceAction.select();

		// Verify they're independent
		const preResult = service.getPreConfirmAction(ref);
		const postResult = service.getPostConfirmAction(ref);

		assert.deepStrictEqual(preResult, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(postResult, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('different MCP servers have independent confirmations', async () => {
		const ref1 = createMcpToolRef('tool1', 'server1', 'Server 1');
		const ref2 = createMcpToolRef('tool2', 'server2', 'Server 2');

		// Set server1 to session
		const actions1 = service.getPreConfirmActions(ref1);
		const serverAction1 = actions1.find(a => a.label.includes('Server 1') && a.label.includes('Session'));
		assert.ok(serverAction1);
		await serverAction1.select();

		// Set server2 to workspace
		const actions2 = service.getPreConfirmActions(ref2);
		const serverAction2 = actions2.find(a => a.label.includes('Server 2') && a.label.includes('Workspace'));
		assert.ok(serverAction2);
		await serverAction2.select();

		// Verify they're independent
		const result1 = service.getPreConfirmAction(ref1);
		const result2 = service.getPreConfirmAction(ref2);

		assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
		assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('actions return true when select is called', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);

		for (const action of actions) {
			const result = await action.select();
			assert.strictEqual(result, true);
		}
	});

	test('session confirmations are stored in memory only', async () => {
		const ref = createToolRef('testTool');
		const actions = service.getPreConfirmActions(ref);
		const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));

		assert.ok(sessionAction);
		await sessionAction.select();

		// Verify it's set
		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });

		// Create new service instance (simulating restart)
		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		// Session confirmation should not persist
		const newResult = newService.getPreConfirmAction(ref);
		assert.strictEqual(newResult, undefined);
	});

	test('combination actions are only offered when combinationLabel is set', async () => {
		const refWithout = createToolRef('testTool', ToolDataSource.Internal, { file: 'foo.txt' });
		const actionsWithout = service.getPreConfirmActions(refWithout);
		assert.ok(!actionsWithout.some(a => a.label.includes('foo.txt')));

		const refWith = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const actionsWith = service.getPreConfirmActions(refWith);
		assert.ok(actionsWith.some(a => a.label.includes('Allow reading "foo.txt"')));
	});

	test('combination actions include session, workspace, and profile scopes', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const actions = service.getPreConfirmActions(ref);
		const combinationActions = actions.filter(a => a.label.includes('Allow reading "foo.txt"'));
		assert.strictEqual(combinationActions.length, 3);
		assert.ok(combinationActions.some(a => a.scope === 'session'));
		assert.ok(combinationActions.some(a => a.scope === 'workspace'));
		assert.ok(combinationActions.some(a => a.scope === 'profile'));
	});

	test('selecting a combination session action auto-confirms the same parameters', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		assert.strictEqual(service.getPreConfirmAction(ref), undefined);

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('selecting a combination workspace action stores at workspace scope', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'workspace');
		assert.ok(combinationAction);
		await combinationAction.select();

		assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});

	test('combination approval does not apply to different parameters', async () => {
		const refFoo = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
		const refBar = await createCombinationRef('testTool', { file: 'bar.txt' }, 'Allow reading "bar.txt"');

		const actions = service.getPreConfirmActions(refFoo);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();

		assert.ok(service.getPreConfirmAction(refFoo));
		assert.strictEqual(service.getPreConfirmAction(refBar), undefined);
	});

	test('tool-level approval takes precedence over combination approval', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const toolSessionAction = actions.find(a => a.label.includes('Session')
			&& !a.label.includes('foo.txt') && !a.label.includes('Server'));
		assert.ok(toolSessionAction);
		await toolSessionAction.select();

		const result = service.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: 'session' });
	});

	test('combination approvals are cleared on reset', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();
		assert.ok(service.getPreConfirmAction(ref));

		service.resetToolAutoConfirmation();
		assert.strictEqual(service.getPreConfirmAction(ref), undefined);
	});

	test('combination session approvals do not persist across service instances', async () => {
		const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');

		const actions = service.getPreConfirmActions(ref);
		const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'session');
		assert.ok(combinationAction);
		await combinationAction.select();
		assert.ok(service.getPreConfirmAction(ref));

		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
		assert.strictEqual(newService.getPreConfirmAction(ref), undefined);
	});

	test('legacy string[] storage format is read correctly', () => {
		// Pre-seed storage with the legacy string[] format
		const storageService = instantiationService.get(IStorageService);
		storageService.store('chat/autoconfirm', JSON.stringify(['tool1', 'tool2']), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Create a new service instance that reads the legacy data
		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		const ref1 = createToolRef('tool1');
		const ref2 = createToolRef('tool2');
		const ref3 = createToolRef('tool3');

		assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
		assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
		assert.strictEqual(newService.getPreConfirmAction(ref3), undefined);
	});

	test('new Record storage format preserves labels', () => {
		// Pre-seed storage with the new Record<string, string | boolean> format
		const storageService = instantiationService.get(IStorageService);
		const data: Record<string, string | boolean> = {
			'tool1:combination:12345': 'Allow reading foo.txt',
			'tool2': true,
		};
		storageService.store('chat/autoconfirm', JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));

		// tool2 should be auto-confirmed (boolean true, no label)
		const ref2 = createToolRef('tool2');
		assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: 'workspace' });
	});
});
