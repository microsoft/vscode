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
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IJSONEditingService, IJSONValue } from '../../../../../workbench/services/configuration/common/jsonEditing.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { INonSessionTaskEntry, ISessionsConfigurationService, SessionsConfigurationService, ITaskEntry } from '../../browser/sessionsConfigurationService.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Task } from '../../../../../workbench/contrib/tasks/common/tasks.js';
import { ITaskService } from '../../../../../workbench/contrib/tasks/common/taskService.js';
import { ISessionData, SessionStatus } from '../../../sessions/common/sessionData.js';
import { Codicon } from '../../../../../base/common/codicons.js';

function makeSession(opts: { repository?: URI; worktree?: URI } = {}): ISessionData {
	const workspace = opts.repository ? {
		label: 'test',
		icon: Codicon.folder,
		repositories: [{
			uri: opts.repository,
			workingDirectory: opts.worktree,
			detail: undefined,
			baseBranchProtected: undefined,
		}],
		requiresWorkspaceTrust: false,
	} : undefined;
	return {
		sessionId: 'test:session',
		resource: URI.parse('file:///session'),
		providerId: 'test',
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('workspace', workspace),
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', SessionStatus.Untitled),
		changes: observableValue('changes', []),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		loading: observableValue('loading', false),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		pullRequest: observableValue('pullRequest', undefined),
	};
}

function makeTask(label: string, command?: string, inSessions?: boolean): ITaskEntry {
	return { label, type: 'shell', command: command ?? label, inSessions };
}

function makeNpmTask(label: string, script: string, inSessions?: boolean): ITaskEntry {
	return { label, type: 'npm', script, inSessions };
}

function makeUnsupportedTask(label: string, inSessions?: boolean): ITaskEntry {
	return { label, type: 'gulp', command: label, inSessions };
}

function tasksJsonContent(tasks: ITaskEntry[]): string {
	return JSON.stringify({ version: '2.0.0', tasks });
}

suite('SessionsConfigurationService', () => {

	const store = new DisposableStore();
	let service: ISessionsConfigurationService;
	let fileContents: Map<string, string>;
	let jsonEdits: { uri: URI; values: IJSONValue[] }[];
	let ranTasks: { label: string }[];
	let committedFiles: { session: ISessionData; fileUris: URI[] }[];
	let storageService: InMemoryStorageService;
	let readFileCalls: URI[];
	let activeSessionObs: ReturnType<typeof observableValue<ISessionData | undefined>>;
	let tasksByLabel: Map<string, Task>;
	let workspaceFoldersByUri: Map<string, IWorkspaceFolder>;

	const userSettingsUri = URI.parse('file:///user/settings.json');
	const repoUri = URI.parse('file:///repo');
	const worktreeUri = URI.parse('file:///worktree');

	setup(() => {
		fileContents = new Map();
		jsonEdits = [];
		ranTasks = [];
		committedFiles = [];
		readFileCalls = [];
		tasksByLabel = new Map();
		workspaceFoldersByUri = new Map();

		const instantiationService = store.add(new TestInstantiationService());
		activeSessionObs = observableValue('activeSession', undefined);

		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async readFile(resource: URI) {
				readFileCalls.push(resource);
				const content = fileContents.get(resource.toString());
				if (content === undefined) {
					throw new Error('file not found');
				}
				return { value: VSBuffer.fromString(content) } as IFileContent;
			}
			override watch() { return { dispose() { } }; }
			override onDidFilesChange: any = () => ({ dispose() { } });
		});

		instantiationService.stub(IJSONEditingService, new class extends mock<IJSONEditingService>() {
			override async write(resource: URI, values: IJSONValue[], _save: boolean) {
				jsonEdits.push({ uri: resource, values });
			}
		});

		instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() {
			override userSettingsResource = userSettingsUri;
		});

		instantiationService.stub(ITaskService, new class extends mock<ITaskService>() {
			override async getTask(_workspaceFolder: any, alias: string | any) {
				const label = typeof alias === 'string' ? alias : '';
				return tasksByLabel.get(label);
			}
			override async run(task: Task | undefined) {
				if (task) {
					ranTasks.push({ label: task._label });
				}
				return undefined;
			}
		});

		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return workspaceFoldersByUri.get(resource.toString()) ?? null;
			}
		});

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = activeSessionObs;
			override async commitWorktreeFiles(session: ISessionData, fileUris: URI[]) { committedFiles.push({ session, fileUris }); }
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
		] satisfies INonSessionTaskEntry[]);
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
		assert.strictEqual(committedFiles.length, 1);
		assert.strictEqual(committedFiles[0].fileUris[0].path, '/worktree/.vscode/tasks.json');
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
		assert.strictEqual(committedFiles.length, 0, 'should not commit when there is no worktree');
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
		const tasks = tasksValue!.value as ITaskEntry[];
		assert.strictEqual(tasks.length, 2);
		assert.strictEqual(tasks[1].label, 'npm run dev');
		assert.strictEqual(tasks[1].inSessions, true);
		assert.strictEqual(committedFiles.length, 1);
		assert.strictEqual(committedFiles[0].fileUris[0].path, '/worktree/.vscode/tasks.json');
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
		const tasks = tasksValue!.value as ITaskEntry[];
		assert.strictEqual(tasks.length, 2);
		assert.strictEqual(tasks[1].label, 'npm run dev');
		assert.strictEqual(tasks[1].inSessions, true);
		assert.strictEqual(committedFiles.length, 0, 'should not commit when there is no worktree');
	});

	test('createAndAddTask writes worktreeCreated run option when requested', async () => {
		const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
		fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([]));

		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		await service.createAndAddTask(undefined, 'npm run dev', session, 'workspace', { runOn: 'worktreeCreated' });

		assert.strictEqual(jsonEdits.length, 1);
		const tasksValue = jsonEdits[0].values.find(v => v.path[0] === 'tasks');
		assert.ok(tasksValue);
		const tasks = tasksValue!.value as ITaskEntry[];
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
		const tasks = tasksValue!.value as ITaskEntry[];
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
		assert.strictEqual(committedFiles.length, 1);
		assert.strictEqual(committedFiles[0].fileUris[0].path, '/worktree/.vscode/tasks.json');
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
		assert.strictEqual(committedFiles.length, 1);
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
		assert.strictEqual(committedFiles.length, 1);
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

	function registerMockTask(label: string, folder: URI): void {
		tasksByLabel.set(label, { _label: label } as unknown as Task);
		workspaceFoldersByUri.set(folder.toString(), { uri: folder, name: 'folder', index: 0, toResource: () => folder } as IWorkspaceFolder);
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
		workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri } as IWorkspaceFolder);
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
