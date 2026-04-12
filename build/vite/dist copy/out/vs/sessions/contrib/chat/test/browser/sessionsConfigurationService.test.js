/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IJSONEditingService } from '../../../../../workbench/services/configuration/common/jsonEditing.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { SessionsConfigurationService } from '../../browser/sessionsConfigurationService.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ITaskService } from '../../../../../workbench/contrib/tasks/common/taskService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
function makeSession(opts = {}) {
    const workspace = opts.repository ? {
        label: 'test',
        icon: Codicon.folder,
        repositories: [{
                uri: opts.repository,
                workingDirectory: opts.worktree,
                detail: undefined,
                baseBranchName: undefined,
                baseBranchProtected: undefined,
            }],
        requiresWorkspaceTrust: false,
    } : undefined;
    const chat = {
        resource: URI.parse('file:///session'),
        createdAt: new Date(),
        title: observableValue('title', 'session'),
        updatedAt: observableValue('updatedAt', new Date()),
        status: observableValue('status', 0 /* SessionStatus.Untitled */),
        changes: observableValue('changes', []),
        modelId: observableValue('modelId', undefined),
        mode: observableValue('mode', undefined),
        isArchived: observableValue('isArchived', false),
        isRead: observableValue('isRead', true),
        lastTurnEnd: observableValue('lastTurnEnd', undefined),
        description: observableValue('description', undefined),
    };
    const session = {
        sessionId: 'test:session',
        resource: chat.resource,
        providerId: 'test',
        sessionType: 'background',
        icon: Codicon.copilot,
        createdAt: chat.createdAt,
        workspace: observableValue('workspace', workspace),
        title: chat.title,
        updatedAt: chat.updatedAt,
        status: chat.status,
        changes: chat.changes,
        modelId: chat.modelId,
        mode: chat.mode,
        loading: observableValue('loading', false),
        isArchived: chat.isArchived,
        isRead: chat.isRead,
        lastTurnEnd: chat.lastTurnEnd,
        description: chat.description,
        gitHubInfo: observableValue('gitHubInfo', undefined),
        chats: observableValue('chats', [chat]),
        mainChat: chat,
    };
    return session;
}
function makeTask(label, command, inSessions) {
    return { label, type: 'shell', command: command ?? label, inSessions };
}
function makeNpmTask(label, script, inSessions) {
    return { label, type: 'npm', script, inSessions };
}
function makeUnsupportedTask(label, inSessions) {
    return { label, type: 'gulp', command: label, inSessions };
}
function tasksJsonContent(tasks) {
    return JSON.stringify({ version: '2.0.0', tasks });
}
suite('SessionsConfigurationService', () => {
    const store = new DisposableStore();
    let service;
    let fileContents;
    let jsonEdits;
    let ranTasks;
    let storageService;
    let readFileCalls;
    let activeSessionObs;
    let tasksByLabel;
    let workspaceFoldersByUri;
    const userSettingsUri = URI.parse('file:///user/settings.json');
    const repoUri = URI.parse('file:///repo');
    const worktreeUri = URI.parse('file:///worktree');
    setup(() => {
        fileContents = new Map();
        jsonEdits = [];
        ranTasks = [];
        readFileCalls = [];
        tasksByLabel = new Map();
        workspaceFoldersByUri = new Map();
        const instantiationService = store.add(new TestInstantiationService());
        activeSessionObs = observableValue('activeSession', undefined);
        instantiationService.stub(IFileService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidFilesChange = () => ({ dispose() { } });
            }
            async readFile(resource) {
                readFileCalls.push(resource);
                const content = fileContents.get(resource.toString());
                if (content === undefined) {
                    throw new Error('file not found');
                }
                return { value: VSBuffer.fromString(content) };
            }
            watch() { return { dispose() { } }; }
        });
        instantiationService.stub(IJSONEditingService, new class extends mock() {
            async write(resource, values, _save) {
                jsonEdits.push({ uri: resource, values });
            }
        });
        instantiationService.stub(IPreferencesService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.userSettingsResource = userSettingsUri;
            }
        });
        instantiationService.stub(ITaskService, new class extends mock() {
            async getTask(_workspaceFolder, alias) {
                const label = typeof alias === 'string' ? alias : '';
                return tasksByLabel.get(label);
            }
            async run(task) {
                if (task) {
                    ranTasks.push({ label: task._label });
                }
                return undefined;
            }
        });
        instantiationService.stub(IWorkspaceContextService, new class extends mock() {
            getWorkspaceFolder(resource) {
                return workspaceFoldersByUri.get(resource.toString()) ?? null;
            }
        });
        instantiationService.stub(ISessionsManagementService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.activeSession = activeSessionObs;
            }
        });
        storageService = store.add(new InMemoryStorageService());
        instantiationService.stub(IStorageService, storageService);
        service = store.add(instantiationService.createInstance(SessionsConfigurationService));
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // --- getSessionTasks ---
    test('getSessionTasks returns tasks with inSessions: true from worktree', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
            makeTask('lint', 'npm run lint', false),
            makeTask('test', 'npm test', true),
            makeNpmTask('watch', 'watch', true),
            makeUnsupportedTask('gulp-task', true),
        ]));
        // user tasks.json — empty
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        const obs = service.getSessionTasks(session);
        // Let async refresh settle
        await new Promise(r => setTimeout(r, 10));
        const tasks = obs.get();
        assert.deepStrictEqual(tasks.map(t => t.task.label), ['build', 'test', 'watch', 'gulp-task']);
    });
    test('getSessionTasks returns empty array when no worktree', async () => {
        const session = makeSession({ repository: repoUri });
        const obs = service.getSessionTasks(session);
        await new Promise(r => setTimeout(r, 10));
        assert.deepStrictEqual(obs.get(), []);
    });
    test('getSessionTasks reads from repository when no worktree', async () => {
        const repoTasksUri = URI.parse('file:///repo/.vscode/tasks.json');
        fileContents.set(repoTasksUri.toString(), tasksJsonContent([
            makeTask('serve', 'npm run serve', true),
            makeTask('lint', 'npm run lint', false),
        ]));
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ repository: repoUri });
        const obs = service.getSessionTasks(session);
        await new Promise(r => setTimeout(r, 10));
        assert.deepStrictEqual(obs.get().map(t => t.task.label), ['serve']);
    });
    test('getSessionTasks does not re-read files on repeated calls for the same folder', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
        ]));
        fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        // Call getSessionTasks multiple times for the same session/folder
        service.getSessionTasks(session);
        service.getSessionTasks(session);
        service.getSessionTasks(session);
        await new Promise(r => setTimeout(r, 10));
        // _refreshSessionTasks reads two files (workspace + user tasks.json).
        // If refresh triggered more than once, we'd see > 2 reads.
        assert.strictEqual(readFileCalls.length, 2, 'should read files only once (no duplicate refresh)');
    });
    // --- getNonSessionTasks ---
    test('getNonSessionTasks returns only tasks without inSessions', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
            makeTask('lint', 'npm run lint', false),
            makeTask('test', 'npm test'),
            makeNpmTask('watch', 'watch', false),
            makeUnsupportedTask('gulp-task', false),
        ]));
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        const nonSessionTasks = await service.getNonSessionTasks(session);
        assert.deepStrictEqual(nonSessionTasks.map(t => t.task.label), ['lint', 'test', 'watch', 'gulp-task']);
    });
    test('getNonSessionTasks reads from repository when no worktree', async () => {
        const repoTasksUri = URI.parse('file:///repo/.vscode/tasks.json');
        fileContents.set(repoTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
            makeTask('lint', 'npm run lint', false),
        ]));
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ repository: repoUri });
        const nonSessionTasks = await service.getNonSessionTasks(session);
        assert.deepStrictEqual(nonSessionTasks.map(t => t.task.label), ['lint']);
    });
    test('getNonSessionTasks preserves the source target for workspace and user tasks', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('workspaceTask', 'npm run workspace'),
        ]));
        fileContents.set(userTasksUri.toString(), tasksJsonContent([
            makeTask('userTask', 'npm run user'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        const nonSessionTasks = await service.getNonSessionTasks(session);
        assert.deepStrictEqual(nonSessionTasks, [
            { task: { label: 'workspaceTask', type: 'shell', command: 'npm run workspace' }, target: 'workspace' },
            { task: { label: 'userTask', type: 'shell', command: 'npm run user' }, target: 'user' },
        ]);
    });
    // --- addTaskToSessions ---
    test('addTaskToSessions writes inSessions: true to the matching task index', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build'),
            makeTask('test', 'npm test'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        const task = makeTask('test', 'npm test');
        await service.addTaskToSessions(task, session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        assert.deepStrictEqual(jsonEdits[0].values, [{ path: ['tasks', 1, 'inSessions'], value: true }]);
    });
    test('addTaskToSessions does nothing when task label not found', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.addTaskToSessions(makeTask('nonexistent'), session, 'workspace');
        assert.strictEqual(jsonEdits.length, 0);
    });
    test('addTaskToSessions writes to repository and does not commit when no worktree', async () => {
        const repoTasksUri = URI.parse('file:///repo/.vscode/tasks.json');
        fileContents.set(repoTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build'),
            makeTask('test', 'npm test'),
        ]));
        const session = makeSession({ repository: repoUri });
        await service.addTaskToSessions(makeTask('test', 'npm test'), session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        assert.strictEqual(jsonEdits[0].uri.toString(), repoTasksUri.toString());
        assert.deepStrictEqual(jsonEdits[0].values, [{ path: ['tasks', 1, 'inSessions'], value: true }]);
    });
    test('addTaskToSessions updates runOptions when provided', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.addTaskToSessions(makeTask('build', 'npm run build'), session, 'workspace', { runOn: 'worktreeCreated' });
        assert.deepStrictEqual(jsonEdits[0].values, [
            { path: ['tasks', 0, 'inSessions'], value: true },
            { path: ['tasks', 0, 'runOptions'], value: { runOn: 'worktreeCreated' } },
        ]);
    });
    test('addTaskToSessions clears runOptions when default is requested', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            { ...makeTask('build', 'npm run build'), runOptions: { runOn: 'worktreeCreated' } },
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.addTaskToSessions(makeTask('build', 'npm run build'), session, 'workspace', { runOn: 'default' });
        assert.deepStrictEqual(jsonEdits[0].values, [
            { path: ['tasks', 0, 'inSessions'], value: true },
            { path: ['tasks', 0, 'runOptions'], value: undefined },
        ]);
    });
    // --- createAndAddTask ---
    test('createAndAddTask writes new task with inSessions: true', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('existing', 'echo hi'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.createAndAddTask(undefined, 'npm run dev', session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        const edit = jsonEdits[0];
        assert.strictEqual(edit.uri.toString(), worktreeTasksUri.toString());
        const tasksValue = edit.values.find(v => v.path[0] === 'tasks');
        assert.ok(tasksValue);
        const tasks = tasksValue.value;
        assert.strictEqual(tasks.length, 2);
        assert.strictEqual(tasks[1].label, 'npm run dev');
        assert.strictEqual(tasks[1].inSessions, true);
    });
    test('createAndAddTask writes to repository and does not commit when no worktree', async () => {
        const repoTasksUri = URI.parse('file:///repo/.vscode/tasks.json');
        fileContents.set(repoTasksUri.toString(), tasksJsonContent([
            makeTask('existing', 'echo hi'),
        ]));
        const session = makeSession({ repository: repoUri });
        await service.createAndAddTask(undefined, 'npm run dev', session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        assert.strictEqual(jsonEdits[0].uri.toString(), repoTasksUri.toString());
        const tasksValue = jsonEdits[0].values.find(v => v.path[0] === 'tasks');
        assert.ok(tasksValue);
        const tasks = tasksValue.value;
        assert.strictEqual(tasks.length, 2);
        assert.strictEqual(tasks[1].label, 'npm run dev');
        assert.strictEqual(tasks[1].inSessions, true);
    });
    test('createAndAddTask writes worktreeCreated run option when requested', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.createAndAddTask(undefined, 'npm run dev', session, 'workspace', { runOn: 'worktreeCreated' });
        assert.strictEqual(jsonEdits.length, 1);
        const tasksValue = jsonEdits[0].values.find(v => v.path[0] === 'tasks');
        assert.ok(tasksValue);
        const tasks = tasksValue.value;
        assert.deepStrictEqual(tasks[0].runOptions, { runOn: 'worktreeCreated' });
    });
    test('createAndAddTask writes a custom label when provided', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.createAndAddTask('Start Dev Server', 'npm run dev', session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        const tasksValue = jsonEdits[0].values.find(v => v.path[0] === 'tasks');
        assert.ok(tasksValue);
        const tasks = tasksValue.value;
        assert.strictEqual(tasks[0].label, 'Start Dev Server');
        assert.strictEqual(tasks[0].command, 'npm run dev');
    });
    // --- removeTask ---
    test('removeTask deletes the matching task entry', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
            makeTask('test', 'npm test', true),
            makeTask('lint', 'npm run lint'),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.removeTask('test', session, 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        assert.deepStrictEqual(jsonEdits[0].values, [{
                path: ['tasks'],
                value: [
                    makeTask('build', 'npm run build', true),
                    { label: 'lint', type: 'shell', command: 'npm run lint' },
                ],
            }]);
    });
    // --- updateTask ---
    test('updateTask replaces an existing task in place', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
            makeTask('test', 'npm test', true),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.updateTask('test', {
            label: 'Test Changed',
            type: 'shell',
            command: 'pnpm test',
            inSessions: true,
            runOptions: { runOn: 'worktreeCreated' }
        }, session, 'workspace', 'workspace');
        assert.strictEqual(jsonEdits.length, 1);
        assert.deepStrictEqual(jsonEdits[0].values, [{
                path: ['tasks', 1],
                value: {
                    label: 'Test Changed',
                    type: 'shell',
                    command: 'pnpm test',
                    inSessions: true,
                    runOptions: { runOn: 'worktreeCreated' }
                }
            }]);
    });
    test('updateTask moves a task between workspace and user storage', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: '/user/tasks.json' });
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
        ]));
        fileContents.set(userTasksUri.toString(), tasksJsonContent([
            makeTask('userExisting', 'npm run user', true),
        ]));
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.updateTask('build', {
            label: 'Build Changed',
            type: 'shell',
            command: 'pnpm build',
            inSessions: true,
        }, session, 'workspace', 'user');
        assert.strictEqual(jsonEdits.length, 2);
        assert.deepStrictEqual(jsonEdits[0], {
            uri: worktreeTasksUri,
            values: [{
                    path: ['tasks'],
                    value: []
                }]
        });
        assert.deepStrictEqual(jsonEdits[1], {
            uri: userTasksUri,
            values: [
                { path: ['version'], value: '2.0.0' },
                {
                    path: ['tasks'],
                    value: [
                        makeTask('userExisting', 'npm run user', true),
                        {
                            label: 'Build Changed',
                            type: 'shell',
                            command: 'pnpm build',
                            inSessions: true,
                        }
                    ]
                }
            ]
        });
    });
    // --- pinned task ---
    test('getPinnedTaskLabel returns undefined when no task is pinned', () => {
        const obs = service.getPinnedTaskLabel(repoUri);
        assert.strictEqual(obs.get(), undefined);
    });
    test('setPinnedTaskLabel stores and clears the pinned task label', () => {
        const obs = service.getPinnedTaskLabel(repoUri);
        service.setPinnedTaskLabel(repoUri, 'build');
        assert.strictEqual(obs.get(), 'build');
        service.setPinnedTaskLabel(repoUri, undefined);
        assert.strictEqual(obs.get(), undefined);
    });
    test('updateTask keeps the pinned task in sync when the label changes', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
        ]));
        service.setPinnedTaskLabel(repoUri, 'build');
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.updateTask('build', {
            label: 'build:watch',
            type: 'shell',
            command: 'npm run watch',
            inSessions: true,
        }, session, 'workspace', 'workspace');
        assert.strictEqual(service.getPinnedTaskLabel(repoUri).get(), 'build:watch');
    });
    test('removeTask clears the pinned task when deleting the pinned entry', async () => {
        const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
        fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
            makeTask('build', 'npm run build', true),
        ]));
        service.setPinnedTaskLabel(repoUri, 'build');
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.removeTask('build', session, 'workspace');
        assert.strictEqual(service.getPinnedTaskLabel(repoUri).get(), undefined);
    });
    // --- runTask ---
    function registerMockTask(label, folder) {
        tasksByLabel.set(label, { _label: label });
        workspaceFoldersByUri.set(folder.toString(), { uri: folder, name: 'folder', index: 0, toResource: () => folder });
    }
    test('runTask looks up task by label and runs it via the task service', async () => {
        registerMockTask('build', worktreeUri);
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.runTask(makeTask('build', 'npm run build'), session);
        assert.strictEqual(ranTasks.length, 1);
        assert.strictEqual(ranTasks[0].label, 'build');
    });
    test('runTask does nothing when no cwd available', async () => {
        const session = makeSession({ repository: undefined, worktree: undefined });
        await service.runTask(makeTask('build', 'npm run build'), session);
        assert.strictEqual(ranTasks.length, 0);
    });
    test('runTask does nothing when workspace folder not found', async () => {
        // No workspace folder registered for worktreeUri
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.runTask(makeTask('build', 'npm run build'), session);
        assert.strictEqual(ranTasks.length, 0);
    });
    test('runTask does nothing when task not found by label', async () => {
        workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri });
        // No task registered for 'nonexistent'
        const session = makeSession({ worktree: worktreeUri, repository: repoUri });
        await service.runTask(makeTask('nonexistent', 'echo hi'), session);
        assert.strictEqual(ranTasks.length, 0);
    });
    test('runTask uses repository as cwd when worktree is not available', async () => {
        registerMockTask('build', repoUri);
        const session = makeSession({ repository: repoUri });
        await service.runTask(makeTask('build', 'npm run build'), session);
        assert.strictEqual(ranTasks.length, 1);
        assert.strictEqual(ranTasks[0].label, 'build');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNDb25maWd1cmF0aW9uU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9zZXNzaW9uc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBZ0IsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0YsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxtQkFBbUIsRUFBYyxNQUFNLHVFQUF1RSxDQUFDO0FBQ3hILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSx3QkFBd0IsRUFBb0IsTUFBTSx1REFBdUQsQ0FBQztBQUNuSCxPQUFPLEVBQWtCLDBCQUEwQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDcEgsT0FBTyxFQUF1RCw0QkFBNEIsRUFBYyxNQUFNLCtDQUErQyxDQUFDO0FBQzlKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENB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