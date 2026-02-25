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
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ISessionsConfigurationService, SessionsConfigurationService, ITaskEntry } from '../../browser/sessionsConfigurationService.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { observableValue } from '../../../../../base/common/observable.js';

function makeSession(opts: { repository?: URI; worktree?: URI } = {}): IActiveSessionItem {
	return {
		repository: opts.repository,
		worktree: opts.worktree,
	} as IActiveSessionItem;
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
	let createdTerminals: { name: string | undefined; cwd: URI | string | undefined }[];
	let sentCommands: { command: string }[];
	let committedFiles: { session: IActiveSessionItem; fileUris: URI[] }[];
	let storageService: InMemoryStorageService;
	let readFileCalls: URI[];

	const userSettingsUri = URI.parse('file:///user/settings.json');
	const repoUri = URI.parse('file:///repo');
	const worktreeUri = URI.parse('file:///worktree');

	setup(() => {
		fileContents = new Map();
		jsonEdits = [];
		createdTerminals = [];
		sentCommands = [];
		committedFiles = [];
		readFileCalls = [];

		const instantiationService = store.add(new TestInstantiationService());

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

		let nextInstanceId = 1;
		const terminalInstances: (Partial<ITerminalInstance> & { instanceId: number })[] = [];

		const terminalServiceMock = new class extends mock<ITerminalService>() {
			override get instances(): readonly ITerminalInstance[] { return terminalInstances as ITerminalInstance[]; }
			override async createTerminal(opts?: { config?: { name?: string }; cwd?: URI }) {
				const instance: Partial<ITerminalInstance> & { instanceId: number } = {
					instanceId: nextInstanceId++,
					initialCwd: opts?.cwd?.fsPath,
					cwd: opts?.cwd?.fsPath,
					hasChildProcesses: false,
					sendText: async (text: string) => { sentCommands.push({ command: text }); },
				};
				createdTerminals.push({ name: opts?.config?.name, cwd: opts?.cwd });
				terminalInstances.push(instance);
				return instance as ITerminalInstance;
			}
			override setActiveInstance() { }
			override async revealActiveTerminal() { }
		};

		instantiationService.stub(ITerminalService, terminalServiceMock);

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = observableValue('activeSession', undefined);
			override async commitWorktreeFiles(session: IActiveSessionItem, fileUris: URI[]) { committedFiles.push({ session, fileUris }); }
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

		assert.deepStrictEqual(tasks.map(t => t.label), ['build', 'test', 'watch']);
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
		assert.deepStrictEqual(obs.get().map(t => t.label), ['serve']);
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

	test('getNonSessionTasks returns only tasks without inSessions and with supported types', async () => {
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

		assert.deepStrictEqual(nonSessionTasks.map(t => t.label), ['lint', 'test', 'watch']);
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

		assert.deepStrictEqual(nonSessionTasks.map(t => t.label), ['lint']);
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

	// --- createAndAddTask ---

	test('createAndAddTask writes new task with inSessions: true', async () => {
		const worktreeTasksUri = URI.parse('file:///worktree/.vscode/tasks.json');
		fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
			makeTask('existing', 'echo hi'),
		]));

		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		await service.createAndAddTask('npm run dev', session, 'workspace');

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
		await service.createAndAddTask('npm run dev', session, 'workspace');

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

	// --- runTask ---

	test('runTask creates terminal and sends command', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const task = makeTask('build', 'npm run build');

		await service.runTask(task, session);

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].name, 'build');
		assert.strictEqual(sentCommands.length, 1);
		assert.strictEqual(sentCommands[0].command, 'npm run build');
	});

	test('runTask resolves npm task to npm run <script>', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const task = makeNpmTask('watch', 'watch');

		await service.runTask(task, session);

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].name, 'watch');
		assert.strictEqual(sentCommands.length, 1);
		assert.strictEqual(sentCommands[0].command, 'npm run watch');
	});

	test('runTask does nothing for npm task without script', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const task: ITaskEntry = { label: 'broken', type: 'npm', inSessions: true };

		await service.runTask(task, session);

		assert.strictEqual(createdTerminals.length, 0);
		assert.strictEqual(sentCommands.length, 0);
	});

	test('runTask does nothing when no cwd available', async () => {
		const session = makeSession({ repository: undefined, worktree: undefined });
		await service.runTask(makeTask('build', 'npm run build'), session);

		assert.strictEqual(createdTerminals.length, 0);
		assert.strictEqual(sentCommands.length, 0);
	});

	test('runTask reuses the same terminal for the same command and worktree', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const task = makeTask('build', 'npm run build');

		await service.runTask(task, session);
		await service.runTask(task, session);

		assert.strictEqual(createdTerminals.length, 1, 'should create only one terminal');
		assert.strictEqual(sentCommands.length, 2, 'should send command twice');
		assert.strictEqual(sentCommands[0].command, 'npm run build');
		assert.strictEqual(sentCommands[1].command, 'npm run build');
	});

	test('runTask creates different terminals for different commands', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		await service.runTask(makeTask('build', 'npm run build'), session);
		await service.runTask(makeTask('test', 'npm test'), session);

		assert.strictEqual(createdTerminals.length, 2, 'should create two terminals');
		assert.strictEqual(createdTerminals[0].name, 'build');
		assert.strictEqual(createdTerminals[1].name, 'test');
	});

	test('runTask creates different terminals for same command in different worktrees', async () => {
		const wt1 = URI.parse('file:///worktree1');
		const wt2 = URI.parse('file:///worktree2');
		const session1 = makeSession({ worktree: wt1, repository: repoUri });
		const session2 = makeSession({ worktree: wt2, repository: repoUri });

		await service.runTask(makeTask('build', 'npm run build'), session1);
		await service.runTask(makeTask('build', 'npm run build'), session2);

		assert.strictEqual(createdTerminals.length, 2, 'should create two terminals for different worktrees');
	});

	// --- getLastRunTaskLabel (MRU) ---

	test('getLastRunTaskLabel returns undefined when no task has been run', () => {
		const obs = service.getLastRunTaskLabel(repoUri);
		assert.strictEqual(obs.get(), undefined);
	});

	test('getLastRunTaskLabel returns label after runTask', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const obs = service.getLastRunTaskLabel(repoUri);

		await service.runTask(makeTask('build', 'npm run build'), session);
		assert.strictEqual(obs.get(), 'build');

		await service.runTask(makeTask('test', 'npm test'), session);
		assert.strictEqual(obs.get(), 'test');
	});

	test('getLastRunTaskLabel returns undefined for undefined repository', () => {
		const obs = service.getLastRunTaskLabel(undefined);
		assert.strictEqual(obs.get(), undefined);
	});

	test('getLastRunTaskLabel tracks separate repositories independently', async () => {
		const repo1 = URI.parse('file:///repo1');
		const repo2 = URI.parse('file:///repo2');
		const wt1 = URI.parse('file:///wt1');
		const wt2 = URI.parse('file:///wt2');

		const session1 = makeSession({ worktree: wt1, repository: repo1 });
		const session2 = makeSession({ worktree: wt2, repository: repo2 });

		const obs1 = service.getLastRunTaskLabel(repo1);
		const obs2 = service.getLastRunTaskLabel(repo2);

		await service.runTask(makeTask('build', 'npm run build'), session1);
		await service.runTask(makeTask('test', 'npm test'), session2);

		assert.strictEqual(obs1.get(), 'build');
		assert.strictEqual(obs2.get(), 'test');
	});

	test('getLastRunTaskLabel returns same observable for same repository', () => {
		const obs1 = service.getLastRunTaskLabel(repoUri);
		const obs2 = service.getLastRunTaskLabel(repoUri);
		assert.strictEqual(obs1, obs2);
	});

	test('getLastRunTaskLabel persists across service instances', async () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		await service.runTask(makeTask('build', 'npm run build'), session);

		// Create a second service instance using the same storage
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async readFile(): Promise<IFileContent> { throw new Error('not found'); }
			override watch() { return { dispose() { } }; }
			override onDidFilesChange: any = () => ({ dispose() { } });
		});
		instantiationService.stub(IJSONEditingService, new class extends mock<IJSONEditingService>() {
			override async write() { }
		});
		instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() {
			override userSettingsResource = userSettingsUri;
		});
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override instances: readonly ITerminalInstance[] = [];
			override async createTerminal() { return {} as ITerminalInstance; }
			override setActiveInstance() { }
			override async revealActiveTerminal() { }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = observableValue('activeSession', undefined);
			override async commitWorktreeFiles() { }
		});
		instantiationService.stub(IStorageService, storageService);

		const service2 = store.add(instantiationService.createInstance(SessionsConfigurationService));
		const obs = service2.getLastRunTaskLabel(repoUri);
		assert.strictEqual(obs.get(), 'build');
	});
});
