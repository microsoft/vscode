/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { win32 } from '../../../../../base/common/path.js';
import { isWindows, Platform } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { AbstractVariableResolverService } from '../../../../services/configurationResolver/common/variableResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../terminal/common/terminal.js';
import { TaskProblemMonitor } from '../../browser/taskProblemMonitor.js';
import { TaskTerminalStatus } from '../../browser/taskTerminalStatus.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';
import { ApplyToKind, FileLocationKind, ProblemMatcher } from '../../common/problemMatcher.js';
import { ITaskSystemInfo, VerifiedTask } from '../../common/taskSystem.js';
import { CustomTask, IConfigurationProperties, PresentationOptions, RunOptions, RuntimeType, TaskEventKind } from '../../common/tasks.js';

suite('TerminalTaskSystem process executable', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise the real resolution and launch-config pipeline without exposing test-only APIs. */
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceFolder = toWorkspaceFolder(URI.file('C:\\work'));

	function createSystem(values: Map<string, string>, options: { withSystemInfo?: boolean; foundExecutable?: string; configurationProperties?: IConfigurationProperties } = {}) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { }, addTerminal() { } });
		instantiationService.stubInstance(TaskTerminalStatus, { dispose() { }, addTerminal() { } });
		let modelListeners = 0;
		const listenerOptions = {
			onDidAddListener: () => modelListeners++,
			onWillRemoveListener: () => modelListeners--
		};
		const modelAdded = store.add(new Emitter<ITextModel>(listenerOptions));
		const modelRemoved = store.add(new Emitter<ITextModel>(listenerOptions));
		instantiationService.stub(IModelService, new class extends mock<IModelService>() {
			override onModelAdded = modelAdded.event;
			override onModelRemoved = modelRemoved.event;
			override getModels() { return []; }
		});
		let resolutionCalls = 0;
		const lookupCalls: { command: string; cwd?: string; paths?: string[] }[] = [];
		const systemInfo: ITaskSystemInfo = {
			platform: Platform.Windows,
			context: undefined,
			uriProvider: path => URI.file(path),
			resolveVariables: async () => {
				resolutionCalls++;
				return { variables: new Map(values), process: 'ignored.exe' };
			},
			findExecutable: async (command, cwd, paths) => {
				lookupCalls.push({ command, cwd, paths });
				return options.foundExecutable;
			}
		};
		const configurationResolver = new class extends AbstractVariableResolverService {
			override async resolveWithInteraction() {
				resolutionCalls++;
				return new Map(values);
			}
		}(new class extends mock<ConstructorParameters<typeof AbstractVariableResolverService>[0]>() {
			override getConfigurationValue(_folder: URI | undefined, section: string) { return values.get(`config:${section}`); }
		});
		const pathService = new class extends mock<IPathService>() {
			override path = Promise.resolve(win32);
			override defaultUriScheme = Schemas.file;
		};
		const system = store.add(instantiationService.invokeFunction(accessor => new TerminalTaskSystem(
			new class extends mock<ITerminalService>() {
				override onDidChangeActiveInstance = Event.None;
				override setActiveInstance() { }
				override async revealTerminal() { }
			},
			new class extends mock<ITerminalGroupService>() { },
			new class extends mock<IOutputService>() { },
			accessor.get(IPaneCompositePartService), accessor.get(IViewsService), accessor.get(IMarkerService),
			accessor.get(IModelService), configurationResolver, accessor.get(IWorkspaceContextService),
			accessor.get(IWorkbenchEnvironmentService), 'tasks', accessor.get(IFileService),
			accessor.get(ITerminalProfileResolverService), pathService, accessor.get(IViewDescriptorService),
			accessor.get(ILogService), accessor.get(INotificationService), accessor.get(IContextKeyService),
			instantiationService, () => options.withSystemInfo !== false ? systemInfo : undefined, async () => undefined,
		)));
		let taskEnded = false;
		const events: TaskEventKind[] = [];
		store.add(system.onDidStateChange(event => {
			events.push(event.kind);
			if (event.kind === TaskEventKind.End) {
				taskEnded = true;
			}
		}));
		let launchConfig: IShellLaunchConfig | undefined;
		system['_doCreateTerminal'] = async (_task, _group, config) => {
			launchConfig = config;
			const onExit = store.add(new Emitter<number>());
			setTimeout(() => onExit.fire(0), 0);
			return new class extends mock<ITerminalInstance>() {
				override instanceId = 1;
				override shellLaunchConfig = config;
				override onDisposed = Event.None;
				override onLineData = Event.None;
				override onExit = onExit.event;
				override processReady = Promise.resolve();
			};
		};
		return {
			lookupCalls,
			get resolutionCalls() { return resolutionCalls; },
			get state() { return { taskEnded, terminalCreated: launchConfig !== undefined }; },
			get lifecycle() {
				return {
					activeTasks: system.getActiveTasks().length, busyTasks: system.getBusyTasks().length,
					modelListeners, events: [...events]
				};
			},
			execute(command: string, cwd = 'C:\\work', env?: { [key: string]: string }, alreadyResolved = new Map<string, string>()) {
				return runWithFakedTimers({ useFakeTimers: true }, async () => {
					const task = new CustomTask('test', {
						kind: 'workspace', label: 'workspace',
						config: { workspaceFolder, file: '.vscode/tasks.json', index: 0, element: {} }
					}, 'test', 'process', {
						runtime: RuntimeType.Process, name: command, args: ['argument'],
						options: { cwd, env }, presentation: PresentationOptions.defaults
					}, false, RunOptions.defaults, options.configurationProperties ?? {});
					const resolver = { resolve: async () => undefined };
					system['_currentTask'] = new VerifiedTask(task, resolver, 'test');
					await system['_executeTask'](task, resolver, 'test', new Set(), new Map(), alreadyResolved);
					await timeout(100);
					return launchConfig;
				});
			}
		};
	}

	for (const variable of ['command:tool', 'input:tool']) {
		test(`${variable} resolves an absolute executable without prefixing cwd`, async () => {
			const { execute, lookupCalls } = createSystem(new Map([[variable, 'C:\\Python\\python.exe']]));
			const config = await execute('${' + variable + '}');
			assert.deepStrictEqual({ executable: config?.executable, args: config?.args, lookupCalls }, {
				executable: 'C:\\Python\\python.exe', args: ['argument'],
				lookupCalls: [{ command: 'C:\\Python\\python.exe', cwd: 'C:\\work', paths: undefined }]
			});
		});

		test(`${variable} resolves a relative executable against the filesystem cwd`, async () => {
			const { execute } = createSystem(new Map([[variable, 'tools\\run.exe']]));
			const config = await execute('${' + variable + '}');
			assert.strictEqual(config?.executable, 'C:\\work\\tools\\run.exe');
		});

		test(`${variable} rejects an empty executable before creating a terminal`, async () => {
			const system = createSystem(new Map([[variable, '']]));
			await assert.rejects(system.execute('${' + variable + '}'), /process task command resolved to an empty string/i);
			assert.deepStrictEqual(system.state, { taskEnded: true, terminalCreated: false });
		});
	}

	test('resolves command, cwd and mixed-case PATH before executable lookup', async () => {
		const { execute, lookupCalls } = createSystem(new Map([
			['input:tool', 'run'], ['input:cwd', 'C:\\work'], ['input:path', 'C:\\tools;C:\\other']
		]), { foundExecutable: 'C:\\tools\\run.EXE' });
		const config = await execute('${input:tool}', '${input:cwd}', { Path: '${input:path}' });
		assert.deepStrictEqual({ executable: config?.executable, lookupCalls }, {
			executable: 'C:\\tools\\run.EXE',
			lookupCalls: [{ command: 'run', cwd: 'C:\\work', paths: ['C:\\tools', 'C:\\other'] }]
		});
	});

	test('fully resolved commands still use executable lookup', async () => {
		const { execute, lookupCalls } = createSystem(new Map(), { foundExecutable: 'C:\\tools\\run.exe' });
		const config = await execute('run', 'C:\\work', { PATH: 'C:\\tools' });
		assert.deepStrictEqual({ executable: config?.executable, lookupCalls }, {
			executable: 'C:\\tools\\run.exe',
			lookupCalls: [{ command: 'run', cwd: 'C:\\work', paths: ['C:\\tools'] }]
		});
	});

	test('uses previously acquired values when resolving the executable', async () => {
		const { execute } = createSystem(new Map());
		const config = await execute('${input:tool}', 'C:\\work', undefined, new Map([['input:tool', 'tools\\run.exe']]));
		assert.strictEqual(config?.executable, 'C:\\work\\tools\\run.exe');
	});

	test('resolves nested acquired variables in command, cwd and PATH without acquiring them again', async () => {
		const system = createSystem(new Map([
			['input:tool', '${config:tool}'], ['config:tool', 'run'],
			['input:cwd', '${config:cwd}'], ['config:cwd', 'C:\\work'],
			['input:path', '${config:paths}'], ['config:paths', '${config:tools};C:\\other'],
			['config:tools', 'C:\\tools']
		]), { foundExecutable: 'C:\\tools\\run.exe' });
		const config = await system.execute('${input:tool}', '${input:cwd}', { Path: '${input:path}' });
		assert.deepStrictEqual({
			executable: config?.executable,
			cwd: config?.cwd?.toString(),
			path: config?.env?.Path,
			lookupCalls: system.lookupCalls,
			resolutionCalls: system.resolutionCalls
		}, {
			executable: 'C:\\tools\\run.exe', cwd: URI.from({ scheme: Schemas.file, path: 'C:\\work' }).toString(), path: 'C:\\tools;C:\\other',
			lookupCalls: [{ command: 'run', cwd: 'C:\\work', paths: ['C:\\tools', 'C:\\other'] }],
			resolutionCalls: 1
		});
	});

	test('leaves cyclic acquired variables unresolved without looping', async () => {
		const { execute } = createSystem(new Map([
			['config:self', '${config:self}'],
			['config:first', '${config:second}'], ['config:second', '${config:first}']
		]));
		const config = await execute('C:\\tools\\run.exe', 'C:\\work', { SELF: '${config:self}', CYCLE: '${config:first}' });
		assert.deepStrictEqual({ self: config?.env?.SELF, cycle: config?.env?.CYCLE }, {
			self: '${config:self}', cycle: '${config:second}'
		});
	});

	if (isWindows) {
		test('resolves process variables without task system info', async () => {
			const { execute } = createSystem(new Map([['input:tool', 'tools\\run.exe']]), { withSystemInfo: false });
			const config = await execute('${input:tool}');
			assert.strictEqual(config?.executable, 'C:\\work\\tools\\run.exe');
		});

		test('resolves nested configuration before executable lookup without task system info', async () => {
			const system = createSystem(new Map([
				['config:tool', '${config:toolPath}\\run.exe'], ['config:toolPath', 'C:\\tools']
			]), { withSystemInfo: false });
			const config = await system.execute('${config:tool}');
			assert.deepStrictEqual({ executable: config?.executable, resolutionCalls: system.resolutionCalls }, {
				executable: 'C:\\tools\\run.exe', resolutionCalls: 1
			});
		});

		test('propagates nested configuration errors without task system info', async () => {
			const system = createSystem(new Map([['config:tool', '${config:missing}']]), { withSystemInfo: false });
			await assert.rejects(system.execute('${config:tool}'), /setting 'missing' not found/);
		});

		for (const command of ['tools\\run.exe', 'run.exe']) {
			test(`resolves ${command} against a workspace-relative cwd before lookup`, async () => {
				const system = createSystem(new Map([['input:tool', command]]));
				const config = await system.execute('${input:tool}', 'build');
				const cwd = win32.join(workspaceFolder.uri.fsPath, 'build');
				assert.deepStrictEqual({
					executable: config?.executable,
					cwd: URI.isUri(config?.cwd) ? config.cwd.fsPath : config?.cwd,
					lookupCalls: system.lookupCalls
				}, {
					executable: win32.join(cwd, command), cwd,
					lookupCalls: [{ command, cwd, paths: undefined }]
				});
			});
		}
	}

	const backgroundMatcher: ProblemMatcher = {
		owner: 'test', applyTo: ApplyToKind.allDocuments, fileLocation: FileLocationKind.Absolute,
		pattern: { regexp: /^never$/ },
		watching: {
			activeOnStart: true,
			beginsPattern: { regexp: /^begin$/ },
			endsPattern: { regexp: /^end$/ }
		}
	};

	test('balances background task events and disposes model listeners on successful execution', async () => {
		const system = createSystem(new Map(), {
			configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
		});
		await system.execute('C:\\tools\\run.exe');
		const { events, ...lifecycle } = system.lifecycle;
		assert.deepStrictEqual({
			...lifecycle,
			events: events.filter(event => [TaskEventKind.Active, TaskEventKind.Inactive, TaskEventKind.End].includes(event))
		}, {
			activeTasks: 0, busyTasks: 0, modelListeners: 0,
			events: [TaskEventKind.Active, TaskEventKind.Inactive, TaskEventKind.End]
		});
	});

	test('rejects repeated empty background commands without activating or leaking a problem collector', async () => {
		const system = createSystem(new Map([['input:tool', '']]), {
			configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
		});
		const attempts = [];
		for (let i = 0; i < 2; i++) {
			await assert.rejects(system.execute('${input:tool}'), /process task command resolved to an empty string/i);
			attempts.push({ ...system.state, ...system.lifecycle });
		}
		assert.deepStrictEqual(attempts, [{
			taskEnded: true, terminalCreated: false, activeTasks: 0, busyTasks: 0, modelListeners: 0,
			events: [TaskEventKind.AcquiredInput, TaskEventKind.End]
		}, {
			taskEnded: true, terminalCreated: false, activeTasks: 0, busyTasks: 0, modelListeners: 0,
			events: [TaskEventKind.AcquiredInput, TaskEventKind.End, TaskEventKind.AcquiredInput, TaskEventKind.End]
		}]);
	});
});
