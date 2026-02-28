/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { LanguageModelToolsConfirmationService } from '../../../browser/tools/languageModelToolsConfirmationService.js';
import { ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ILanguageModelToolConfirmationActions, ILanguageModelToolConfirmationContribution, ILanguageModelToolConfirmationRef } from '../../../common/tools/languageModelToolsConfirmationService.js';
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
});
