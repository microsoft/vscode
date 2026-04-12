/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { SessionsTerminalContribution } from '../../browser/sessionsTerminalContribution.js';
import { TestPathService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
const HOME_DIR = URI.file('/home/user');
class TestLogService extends NullLogService {
    constructor() {
        super(...arguments);
        this.traces = [];
    }
    trace(message, ...args) {
        this.traces.push([message, ...args].join(' '));
    }
}
function makeAgentSession(opts) {
    const repo = opts.repository || opts.worktree ? {
        uri: opts.repository ?? opts.worktree,
        workingDirectory: opts.worktree,
        detail: undefined,
        baseBranchName: undefined,
        baseBranchProtected: undefined,
    } : undefined;
    const chat = {
        resource: URI.parse('file:///session'),
        createdAt: new Date(),
        title: observableValue('test.title', 'Test Session'),
        updatedAt: observableValue('test.updatedAt', new Date()),
        status: observableValue('test.status', 0),
        changes: observableValue('test.changes', []),
        modelId: observableValue('test.modelId', undefined),
        mode: observableValue('test.mode', undefined),
        isArchived: observableValue('test.isArchived', opts.isArchived ?? false),
        isRead: observableValue('test.isRead', true),
        lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
        description: observableValue('test.description', undefined),
    };
    const session = {
        sessionId: 'test:session',
        resource: chat.resource,
        providerId: 'test',
        sessionType: opts.providerType ?? AgentSessionProviders.Local,
        icon: Codicon.copilot,
        createdAt: chat.createdAt,
        workspace: observableValue('test.workspace', repo ? { label: 'test', icon: Codicon.repo, repositories: [repo], requiresWorkspaceTrust: false, } : undefined),
        title: chat.title,
        updatedAt: chat.updatedAt,
        status: chat.status,
        changes: chat.changes,
        modelId: chat.modelId,
        mode: chat.mode,
        loading: observableValue('test.loading', false),
        isArchived: chat.isArchived,
        isRead: chat.isRead,
        lastTurnEnd: chat.lastTurnEnd,
        description: chat.description,
        gitHubInfo: observableValue('test.gitHubInfo', undefined),
        chats: observableValue('test.chats', [chat]),
        activeChat: observableValue('test.activeChat', chat),
        mainChat: chat,
    };
    return session;
}
function makeNonAgentSession(opts) {
    const repo = opts.repository || opts.worktree ? {
        uri: opts.repository ?? opts.worktree,
        workingDirectory: opts.worktree,
        detail: undefined,
        baseBranchName: undefined,
        baseBranchProtected: undefined,
    } : undefined;
    const chat = {
        resource: URI.parse('file:///session'),
        createdAt: new Date(),
        title: observableValue('test.title', 'Test Session'),
        updatedAt: observableValue('test.updatedAt', new Date()),
        status: observableValue('test.status', 0),
        changes: observableValue('test.changes', []),
        modelId: observableValue('test.modelId', undefined),
        mode: observableValue('test.mode', undefined),
        isArchived: observableValue('test.isArchived', false),
        isRead: observableValue('test.isRead', true),
        lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
        description: observableValue('test.description', undefined),
    };
    const session = {
        sessionId: 'test:non-agent',
        resource: chat.resource,
        providerId: 'test',
        sessionType: opts.providerType ?? AgentSessionProviders.Local,
        icon: Codicon.copilot,
        createdAt: chat.createdAt,
        workspace: observableValue('test.workspace', repo ? { label: 'test', icon: Codicon.repo, repositories: [repo], requiresWorkspaceTrust: false, } : undefined),
        title: chat.title,
        updatedAt: chat.updatedAt,
        status: chat.status,
        changes: chat.changes,
        modelId: chat.modelId,
        mode: chat.mode,
        loading: observableValue('test.loading', false),
        isArchived: chat.isArchived,
        isRead: chat.isRead,
        lastTurnEnd: chat.lastTurnEnd,
        description: chat.description,
        gitHubInfo: observableValue('test.gitHubInfo', undefined),
        chats: observableValue('test.chats', [chat]),
        mainChat: chat,
    };
    return session;
}
function makeTerminalInstance(id, cwd) {
    const commandHistory = [];
    let isDisposed = false;
    let shellLaunchConfig = {};
    const capabilities = {
        get(cap) {
            if (cap === 2 /* TerminalCapability.CommandDetection */ && commandHistory.length > 0) {
                return { commands: commandHistory };
            }
            return undefined;
        }
    };
    return {
        instanceId: id,
        get isDisposed() { return isDisposed; },
        get shellLaunchConfig() { return shellLaunchConfig; },
        getInitialCwd: () => Promise.resolve(cwd),
        capabilities,
        _testCommandHistory: commandHistory,
        _testSetDisposed(disposed) {
            isDisposed = disposed;
        },
        _testSetShellLaunchConfig(value) {
            shellLaunchConfig = value;
        },
    };
}
function addCommandToInstance(instance, timestamp) {
    instance._testCommandHistory.push({ timestamp });
}
suite('SessionsTerminalContribution', () => {
    const store = new DisposableStore();
    let contribution;
    let activeSessionObs;
    let onDidChangeSessions;
    let onDidCreateInstance;
    let createdTerminals;
    let activeInstanceSet;
    let focusCalls;
    let disposedInstances;
    let nextInstanceId;
    let terminalInstances;
    let backgroundedInstances;
    let moveToBackgroundCalls;
    let showBackgroundCalls;
    let disposeOnCreatePaths;
    let logService;
    setup(() => {
        createdTerminals = [];
        activeInstanceSet = [];
        focusCalls = 0;
        disposedInstances = [];
        nextInstanceId = 1;
        terminalInstances = new Map();
        backgroundedInstances = new Set();
        moveToBackgroundCalls = [];
        showBackgroundCalls = [];
        disposeOnCreatePaths = new Set();
        logService = new TestLogService();
        const instantiationService = store.add(new TestInstantiationService());
        activeSessionObs = observableValue('activeSession', undefined);
        onDidChangeSessions = store.add(new Emitter());
        onDidCreateInstance = store.add(new Emitter());
        instantiationService.stub(ILogService, logService);
        instantiationService.stub(ISessionsManagementService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.activeSession = activeSessionObs;
                this.onDidChangeSessions = onDidChangeSessions.event;
            }
        });
        instantiationService.stub(ITerminalService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidCreateInstance = onDidCreateInstance.event;
            }
            get instances() {
                return [...terminalInstances.values()];
            }
            get foregroundInstances() {
                return [...terminalInstances.values()].filter(i => !backgroundedInstances.has(i.instanceId));
            }
            async createTerminal(opts) {
                const id = nextInstanceId++;
                const cwdUri = opts?.config?.cwd;
                const cwdStr = cwdUri?.fsPath ?? '';
                const instance = makeTerminalInstance(id, cwdStr);
                createdTerminals.push({ cwd: opts?.config?.cwd });
                terminalInstances.set(id, instance);
                if (disposeOnCreatePaths.has(cwdStr)) {
                    instance._testSetDisposed(true);
                    terminalInstances.delete(id);
                }
                return instance;
            }
            getInstanceFromId(id) {
                return terminalInstances.get(id);
            }
            setActiveInstance(instance) {
                activeInstanceSet.push(instance.instanceId);
            }
            async focusActiveInstance() {
                focusCalls++;
            }
            async safeDisposeTerminal(instance) {
                disposedInstances.push(instance);
                instance._testSetDisposed(true);
                terminalInstances.delete(instance.instanceId);
                backgroundedInstances.delete(instance.instanceId);
            }
            moveToBackground(instance) {
                backgroundedInstances.add(instance.instanceId);
                moveToBackgroundCalls.push(instance.instanceId);
            }
            async showBackgroundTerminal(instance) {
                backgroundedInstances.delete(instance.instanceId);
                showBackgroundCalls.push(instance.instanceId);
            }
        });
        instantiationService.stub(IPathService, new TestPathService(HOME_DIR));
        instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
        instantiationService.stub(IViewsService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeViewVisibility = store.add(new Emitter()).event;
            }
            isViewVisible() { return false; }
        });
        contribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // --- Background provider: uses worktree/repository path ---
    test('creates a terminal at the worktree for a background session', async () => {
        const worktreeUri = URI.file('/worktree');
        const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file('/repo'), providerType: AgentSessionProviders.Background });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
    });
    test('falls back to repository when worktree is undefined for a background session', async () => {
        const repoUri = URI.file('/repo');
        const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Background });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
    });
    // --- Non-background providers: use home directory ---
    test('uses home directory for a cloud agent session', async () => {
        const session = makeAgentSession({ worktree: URI.file('/worktree'), repository: URI.file('/repo'), providerType: AgentSessionProviders.Cloud });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
    });
    test('uses home directory for a local agent session', async () => {
        const session = makeAgentSession({ worktree: URI.file('/worktree'), providerType: AgentSessionProviders.Local });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
    });
    test('uses home directory for a non-agent session', async () => {
        const session = makeNonAgentSession({ repository: URI.file('/repo') });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
    });
    test('does not recreate terminal when multiple non-background sessions share the home directory', async () => {
        const session1 = makeAgentSession({ providerType: AgentSessionProviders.Cloud });
        activeSessionObs.set(session1, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        // Different non-background session — same home dir, no new terminal
        const session2 = makeAgentSession({ providerType: AgentSessionProviders.Local });
        activeSessionObs.set(session2, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
    });
    test('does not create a terminal when there is no active session', async () => {
        activeSessionObs.set(undefined, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 0);
    });
    test('does not recreate terminal for the same path', async () => {
        const worktreeUri = URI.file('/worktree');
        const session1 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background });
        activeSessionObs.set(session1, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        // Setting a different session with the same worktree should not create a new terminal
        const session2 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background });
        activeSessionObs.set(session2, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
    });
    test('creates new terminal when switching to a different background path', async () => {
        const worktree1 = URI.file('/worktree1');
        const worktree2 = URI.file('/worktree2');
        activeSessionObs.set(makeAgentSession({ worktree: worktree1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        activeSessionObs.set(makeAgentSession({ worktree: worktree2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 2);
        assert.strictEqual(createdTerminals[1].cwd.fsPath, worktree2.fsPath);
    });
    // --- ensureTerminal ---
    test('ensureTerminal creates terminal and sets it active', async () => {
        const cwd = URI.file('/test-cwd');
        await contribution.ensureTerminal(cwd, false);
        assert.strictEqual(createdTerminals.length, 1);
        assert.strictEqual(createdTerminals[0].cwd.fsPath, cwd.fsPath);
        assert.strictEqual(activeInstanceSet.length, 1);
        assert.strictEqual(focusCalls, 0);
    });
    test('ensureTerminal focuses when requested', async () => {
        const cwd = URI.file('/test-cwd');
        await contribution.ensureTerminal(cwd, true);
        assert.strictEqual(focusCalls, 1);
    });
    test('ensureTerminal reuses existing terminal for same path', async () => {
        const cwd = URI.file('/test-cwd');
        await contribution.ensureTerminal(cwd, false);
        await contribution.ensureTerminal(cwd, false);
        assert.strictEqual(createdTerminals.length, 1, 'should reuse the existing terminal');
        assert.strictEqual(activeInstanceSet.length, 1, 'should only set active instance on creation');
    });
    test('ensureTerminal creates new terminal for different path', async () => {
        await contribution.ensureTerminal(URI.file('/cwd1'), false);
        await contribution.ensureTerminal(URI.file('/cwd2'), false);
        assert.strictEqual(createdTerminals.length, 2);
    });
    test('ensureTerminal path comparison is case-insensitive', async () => {
        await contribution.ensureTerminal(URI.file('/Test/CWD'), false);
        await contribution.ensureTerminal(URI.file('/test/cwd'), false);
        assert.strictEqual(createdTerminals.length, 1, 'should match case-insensitively');
    });
    test('ensureTerminal does not activate a terminal disposed during creation', async () => {
        const cwd = URI.file('/test-cwd');
        disposeOnCreatePaths.add(cwd.fsPath);
        const instances = await contribution.ensureTerminal(cwd, false);
        assert.strictEqual(instances.length, 0);
        assert.strictEqual(activeInstanceSet.length, 0);
        assert.ok(logService.traces.some(message => message.includes(`Cannot activate created terminal for ${cwd.fsPath}; terminal 1 is no longer available`)));
    });
    // --- onDidChangeSessions (archived) ---
    test('closes terminals when session is archived', async () => {
        const worktreeUri = URI.file('/worktree');
        await contribution.ensureTerminal(worktreeUri, false);
        assert.strictEqual(createdTerminals.length, 1);
        const session = makeAgentSession({
            isArchived: true,
            worktree: worktreeUri,
        });
        onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
        await tick();
        assert.strictEqual(disposedInstances.length, 1);
    });
    test('does not close terminals when session is not archived', async () => {
        const worktreeUri = URI.file('/worktree');
        await contribution.ensureTerminal(worktreeUri, false);
        const session = makeAgentSession({
            isArchived: false,
            worktree: worktreeUri,
        });
        onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
        await tick();
        assert.strictEqual(disposedInstances.length, 0);
    });
    test('does not close terminals when archived session has no worktree', async () => {
        const worktreeUri = URI.file('/worktree');
        await contribution.ensureTerminal(worktreeUri, false);
        const session = makeAgentSession({ isArchived: true });
        onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
        await tick();
        assert.strictEqual(disposedInstances.length, 0);
    });
    test('closes terminals when session is removed', async () => {
        const worktreeUri = URI.file('/worktree');
        await contribution.ensureTerminal(worktreeUri, false);
        assert.strictEqual(createdTerminals.length, 1);
        const session = makeAgentSession({ worktree: worktreeUri });
        onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
        await tick();
        assert.strictEqual(disposedInstances.length, 1);
    });
    // --- switching back to previously used path reuses terminal ---
    test('switching back to a previously used background path reuses the existing terminal', async () => {
        const cwd1 = URI.file('/cwd1');
        const cwd2 = URI.file('/cwd2');
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 2);
        // Switch back to cwd1 - should reuse terminal, not create a new one
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 2, 'should reuse the terminal for cwd1');
    });
    // --- Terminal visibility management (cwd-based) ---
    test('hides terminals from previous session when switching to a new session', async () => {
        const cwd1 = URI.file('/cwd1');
        const cwd2 = URI.file('/cwd2');
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1);
        activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // The first terminal (id=1) should have been moved to background
        assert.ok(moveToBackgroundCalls.includes(1), 'terminal for cwd1 should be backgrounded');
        assert.ok(backgroundedInstances.has(1), 'terminal for cwd1 should remain backgrounded');
    });
    test('shows previously hidden terminals when switching back to their session', async () => {
        const cwd1 = URI.file('/cwd1');
        const cwd2 = URI.file('/cwd2');
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // Switch back to cwd1
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // Terminal for cwd1 (id=1) should be shown again
        assert.ok(showBackgroundCalls.includes(1), 'terminal for cwd1 should be shown');
        assert.ok(!backgroundedInstances.has(1), 'terminal for cwd1 should be foreground');
        // Terminal for cwd2 (id=2) should now be backgrounded
        assert.ok(backgroundedInstances.has(2), 'terminal for cwd2 should be backgrounded');
    });
    test('only terminals of the active session are visible after multiple switches', async () => {
        const cwd1 = URI.file('/cwd1');
        const cwd2 = URI.file('/cwd2');
        const cwd3 = URI.file('/cwd3');
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        activeSessionObs.set(makeAgentSession({ worktree: cwd3, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // Only terminal for cwd3 (id=3) should be foreground
        assert.ok(backgroundedInstances.has(1), 'terminal for cwd1 should be backgrounded');
        assert.ok(backgroundedInstances.has(2), 'terminal for cwd2 should be backgrounded');
        assert.ok(!backgroundedInstances.has(3), 'terminal for cwd3 should be foreground');
    });
    test('shows pre-existing terminal with matching cwd instead of creating a new one', async () => {
        // Manually add a terminal that already exists with a matching cwd
        const cwd = URI.file('/worktree');
        const existingInstance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        terminalInstances.set(existingInstance.instanceId, existingInstance);
        backgroundedInstances.add(existingInstance.instanceId);
        activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 0, 'should reuse existing terminal, not create a new one');
        assert.ok(showBackgroundCalls.includes(existingInstance.instanceId), 'should show the existing terminal');
    });
    test('does not background a restored terminal that is disposed before cwd resolves', async () => {
        let resolveInitialCwd;
        const restoredInstance = makeTerminalInstance(nextInstanceId++, '/restored');
        restoredInstance._testSetShellLaunchConfig({ attachPersistentProcess: {} });
        restoredInstance.getInitialCwd = () => new Promise(resolve => {
            resolveInitialCwd = resolve;
        });
        terminalInstances.set(restoredInstance.instanceId, restoredInstance);
        activeSessionObs.set(makeAgentSession({ worktree: URI.file('/active'), providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        onDidCreateInstance.fire(restoredInstance);
        restoredInstance._testSetDisposed(true);
        terminalInstances.delete(restoredInstance.instanceId);
        resolveInitialCwd?.('/other');
        await tick();
        assert.ok(!moveToBackgroundCalls.includes(restoredInstance.instanceId), 'disposed restored terminal should not be backgrounded');
        assert.ok(logService.traces.some(message => message.includes('Cannot hide restored terminal for /other; terminal') && message.includes('is no longer available')));
    });
    test('hides pre-existing terminal with non-matching cwd when session changes', async () => {
        // Manually add a terminal that already exists with a different cwd
        const otherInstance = makeTerminalInstance(nextInstanceId++, '/other/path');
        terminalInstances.set(otherInstance.instanceId, otherInstance);
        const cwd = URI.file('/worktree');
        activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.ok(moveToBackgroundCalls.includes(otherInstance.instanceId), 'non-matching terminal should be backgrounded');
    });
    test('ensureTerminal finds a backgrounded terminal instead of creating a new one', async () => {
        const cwd = URI.file('/test-cwd');
        await contribution.ensureTerminal(cwd, false);
        const instanceId = activeInstanceSet[0];
        // Manually background it
        backgroundedInstances.add(instanceId);
        // ensureTerminal should find it by cwd, not create a new one
        const result = await contribution.ensureTerminal(cwd, false);
        assert.strictEqual(createdTerminals.length, 1, 'should not create a new terminal');
        assert.strictEqual(result[0].instanceId, instanceId, 'should return the existing backgrounded terminal');
    });
    test('visibility is determined by initial cwd, not by stored IDs', async () => {
        // Create a terminal externally (not via ensureTerminal) with a known cwd
        const cwd1 = URI.file('/cwd1');
        const cwd2 = URI.file('/cwd2');
        const ext1 = makeTerminalInstance(nextInstanceId++, cwd1.fsPath);
        const ext2 = makeTerminalInstance(nextInstanceId++, cwd2.fsPath);
        terminalInstances.set(ext1.instanceId, ext1);
        terminalInstances.set(ext2.instanceId, ext2);
        // Switch to cwd1 — ext1 should stay visible, ext2 should be hidden
        activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.ok(!backgroundedInstances.has(ext1.instanceId), 'ext1 should be foreground (matching cwd)');
        assert.ok(backgroundedInstances.has(ext2.instanceId), 'ext2 should be backgrounded (non-matching cwd)');
        // Switch to cwd2 — ext2 should be shown, ext1 should be hidden
        activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        assert.ok(backgroundedInstances.has(ext1.instanceId), 'ext1 should now be backgrounded');
        assert.ok(!backgroundedInstances.has(ext2.instanceId), 'ext2 should now be foreground');
    });
    // --- Most-recent-command active terminal selection ---
    test('sets the terminal with the most recent command as active after visibility update', async () => {
        const cwd = URI.file('/worktree');
        const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        terminalInstances.set(t1.instanceId, t1);
        terminalInstances.set(t2.instanceId, t2);
        // t1 ran a command at timestamp 100, t2 at timestamp 200 (more recent)
        addCommandToInstance(t1, 100);
        addCommandToInstance(t2, 200);
        activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // The most recent setActiveInstance call should be for t2
        assert.strictEqual(activeInstanceSet.at(-1), t2.instanceId, 'should set the terminal with the most recent command as active');
    });
    test('does not change active instance when no terminals have command history', async () => {
        const cwd = URI.file('/worktree');
        const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        terminalInstances.set(t1.instanceId, t1);
        terminalInstances.set(t2.instanceId, t2);
        const activeCountBefore = activeInstanceSet.length;
        activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
        await tick();
        // No setActiveInstance calls from visibility update since no commands were run
        assert.strictEqual(activeInstanceSet.length, activeCountBefore, 'should not call setActiveInstance when no command history exists');
    });
    // --- Remote agent host sessions ---
    test('falls back to home directory for a background session with a remote agent host repository', async () => {
        const remoteRepoUri = toAgentHostUri(URI.file('/Users/user/repo'), 'my-server');
        const session = makeAgentSession({ repository: remoteRepoUri, providerType: AgentSessionProviders.Background });
        activeSessionObs.set(session, undefined);
        await tick();
        assert.strictEqual(createdTerminals.length, 1, 'should create a terminal at the home directory');
        assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
    });
});
function tick() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIvc2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEYsT0FBTyxFQUFxQixnQkFBZ0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXBILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUNySCxPQUFPLEVBQXdDLDBCQUEwQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFMUksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLCtDQUErQyxDQUFD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