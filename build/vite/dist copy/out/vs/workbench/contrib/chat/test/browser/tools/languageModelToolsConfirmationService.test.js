/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { LanguageModelToolsConfirmationService } from '../../../browser/tools/languageModelToolsConfirmationService.js';
import { computeCombinationKey } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
suite('LanguageModelToolsConfirmationService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let service;
    let instantiationService;
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
        service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    });
    function createToolRef(toolId, source = ToolDataSource.Internal, parameters = {}) {
        return { toolId, source, parameters };
    }
    function createMcpToolRef(toolId, definitionId, serverLabel, parameters = {}) {
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
    async function createCombinationRef(toolId, parameters, combinationLabel) {
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
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
    });
    test('pre-execution workspace confirmation works', async () => {
        const ref = createToolRef('testTool');
        const actions = service.getPreConfirmActions(ref);
        const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
        assert.ok(workspaceAction);
        await workspaceAction.select();
        const result = service.getPreConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
    });
    test('pre-execution profile confirmation works', async () => {
        const ref = createToolRef('testTool');
        const actions = service.getPreConfirmActions(ref);
        const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));
        assert.ok(profileAction);
        await profileAction.select();
        const result = service.getPreConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'profile' });
    });
    test('post-execution session confirmation works', async () => {
        const ref = createToolRef('testTool');
        const actions = service.getPostConfirmActions(ref);
        const sessionAction = actions.find(a => a.label.includes('Session') && !a.label.includes('Server'));
        assert.ok(sessionAction);
        await sessionAction.select();
        const result = service.getPostConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
    });
    test('post-execution workspace confirmation works', async () => {
        const ref = createToolRef('testTool');
        const actions = service.getPostConfirmActions(ref);
        const workspaceAction = actions.find(a => a.label.includes('Workspace') && !a.label.includes('Server'));
        assert.ok(workspaceAction);
        await workspaceAction.select();
        const result = service.getPostConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
    });
    test('post-execution profile confirmation works', async () => {
        const ref = createToolRef('testTool');
        const actions = service.getPostConfirmActions(ref);
        const profileAction = actions.find(a => a.label.includes('Always Allow') && !a.label.includes('Server'));
        assert.ok(profileAction);
        await profileAction.select();
        const result = service.getPostConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'profile' });
    });
    test('MCP server-level pre-execution session confirmation works', async () => {
        const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
        const actions = service.getPreConfirmActions(ref);
        const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
        assert.ok(serverAction);
        await serverAction.select();
        const result = service.getPreConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
    });
    test('MCP server-level pre-execution workspace confirmation works', async () => {
        const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
        const actions = service.getPreConfirmActions(ref);
        const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Workspace'));
        assert.ok(serverAction);
        await serverAction.select();
        const result = service.getPreConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
    });
    test('MCP server-level pre-execution profile confirmation works', async () => {
        const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
        const actions = service.getPreConfirmActions(ref);
        const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Always Allow'));
        assert.ok(serverAction);
        await serverAction.select();
        const result = service.getPreConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'profile' });
    });
    test('MCP server-level post-execution session confirmation works', async () => {
        const ref = createMcpToolRef('mcpTool', 'serverId', 'Test Server');
        const actions = service.getPostConfirmActions(ref);
        const serverAction = actions.find(a => a.label.includes('Test Server') && a.label.includes('Session'));
        assert.ok(serverAction);
        await serverAction.select();
        const result = service.getPostConfirmAction(ref);
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
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
        assert.deepStrictEqual(result1, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
        assert.deepStrictEqual(result2, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
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
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
    });
    test('registerConfirmationContribution allows custom pre-confirm actions', () => {
        const contribution = {
            getPreConfirmAction: (ref) => {
                return { type: 4 /* ToolConfirmKind.UserAction */ };
            }
        };
        store.add(service.registerConfirmationContribution('customTool', contribution));
        const ref = createToolRef('customTool');
        const result = service.getPreConfirmAction(ref);
        assert.ok(result);
        assert.strictEqual(result.type, 4 /* ToolConfirmKind.UserAction */);
    });
    test('registerConfirmationContribution allows custom post-confirm actions', () => {
        const contribution = {
            getPostConfirmAction: (ref) => {
                return { type: 4 /* ToolConfirmKind.UserAction */ };
            }
        };
        store.add(service.registerConfirmationContribution('customTool', contribution));
        const ref = createToolRef('customTool');
        const result = service.getPostConfirmAction(ref);
        assert.ok(result);
        assert.strictEqual(result.type, 4 /* ToolConfirmKind.UserAction */);
    });
    test('registerConfirmationContribution allows custom pre-confirm action list', () => {
        const customActions = [
            {
                label: 'Custom Action 1',
                select: async () => true
            },
            {
                label: 'Custom Action 2',
                select: async () => true
            }
        ];
        const contribution = {
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
        const customActions = [
            {
                label: 'Custom Action Only',
                select: async () => true
            }
        ];
        const contribution = {
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
        const contribution = {
            getPreConfirmAction: (ref) => {
                return { type: 4 /* ToolConfirmKind.UserAction */ };
            }
        };
        store.add(service.registerConfirmationContribution('customTool', contribution));
        // Contribution should take precedence even without setting default
        const ref = createToolRef('customTool');
        const result = service.getPreConfirmAction(ref);
        assert.ok(result);
        assert.strictEqual(result.type, 4 /* ToolConfirmKind.UserAction */);
    });
    test('contribution with canUseDefaultApprovals=false prevents default store checks', () => {
        const contribution = {
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
        const contribution = {
            reset: () => {
                resetCalled = true;
            }
        };
        store.add(service.registerConfirmationContribution('customTool', contribution));
        service.resetToolAutoConfirmation();
        assert.strictEqual(resetCalled, true);
    });
    test('disposing contribution registration removes it', () => {
        const contribution = {
            getPreConfirmAction: (ref) => {
                return { type: 4 /* ToolConfirmKind.UserAction */ };
            }
        };
        const disposable = service.registerConfirmationContribution('customTool', contribution);
        const ref = createToolRef('customTool');
        let result = service.getPreConfirmAction(ref);
        assert.ok(result);
        assert.strictEqual(result.type, 4 /* ToolConfirmKind.UserAction */);
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
        assert.deepStrictEqual(result1, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
        assert.deepStrictEqual(result2, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
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
        assert.deepStrictEqual(preResult, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
        assert.deepStrictEqual(postResult, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
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
        assert.deepStrictEqual(result1, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
        assert.deepStrictEqual(result2, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
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
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
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
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
    });
    test('selecting a combination workspace action stores at workspace scope', async () => {
        const ref = await createCombinationRef('testTool', { file: 'foo.txt' }, 'Allow reading "foo.txt"');
        const actions = service.getPreConfirmActions(ref);
        const combinationAction = actions.find(a => a.label.includes('Allow reading "foo.txt"') && a.scope === 'workspace');
        assert.ok(combinationAction);
        await combinationAction.select();
        assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
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
        assert.deepStrictEqual(result, { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'session' });
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
        storageService.store('chat/autoconfirm', JSON.stringify(['tool1', 'tool2']), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        // Create a new service instance that reads the legacy data
        const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
        const ref1 = createToolRef('tool1');
        const ref2 = createToolRef('tool2');
        const ref3 = createToolRef('tool3');
        assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
        assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
        assert.strictEqual(newService.getPreConfirmAction(ref3), undefined);
    });
    test('new Record storage format preserves labels', () => {
        // Pre-seed storage with the new Record<string, string | boolean> format
        const storageService = instantiationService.get(IStorageService);
        const data = {
            'tool1:combination:12345': 'Allow reading foo.txt',
            'tool2': true,
        };
        storageService.store('chat/autoconfirm', JSON.stringify(data), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
        // tool2 should be auto-confirmed (boolean true, no label)
        const ref2 = createToolRef('tool2');
        assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: 3 /* ToolConfirmKind.LmServicePerTool */, scope: 'workspace' });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQStCLE1BQU0sc0RBQXNELENBQUM7QUFDNUksT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFeEgsT0FBTyxFQUFFLHFCQUFxQixFQUF3SCxNQUFNLGdFQUFnRSxDQUFDO0FBQzdOLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVwRixLQUFLLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO0lBQ25ELE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxPQUE4QyxDQUFDO0lBQ25ELElBQUksb0JBQThDLENBQUM7SUFFbkQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFDakUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFcEYsT0FBTyxHQUFHLEtB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