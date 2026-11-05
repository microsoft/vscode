/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { normalizeDriveLetter } from '../../../../../base/common/labels.js';
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
import { ITaskSummary, ITaskSystemInfo, TaskExecuteKind, VerifiedTask } from '../../common/taskSystem.js';
import { CustomTask, IConfigurationProperties, InMemoryTask, PresentationOptions, RunOptions, RuntimeType, TaskEvent, TaskEventKind } from '../../common/tasks.js';

suite('TerminalTaskSystem process executable', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise the real resolution and launch-config pipeline without exposing test-only APIs. */
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceFolder = toWorkspaceFolder(URI.file('C:\\work'));

	function createSystem(values: Map<string, string>, options: { withSystemInfo?: boolean; platform?: Platform; foundExecutable?: string; configurationProperties?: IConfigurationProperties; args?: string[]; runtime?: RuntimeType; asDependency?: boolean } = {}) {
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
		const acquiredVariables: string[] = [];
		const lookupCalls: { command: string; cwd?: string; paths?: string[] }[] = [];
		const systemInfo: ITaskSystemInfo = {
			platform: options.platform ?? Platform.Windows,
			context: undefined,
			uriProvider: path => URI.file(path),
			resolveVariables: async (_folder, resolveSet) => {
				resolutionCalls++;
				acquiredVariables.push(...resolveSet.variables);
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
			override async fileURI(path: string) { return URI.file(path); }
			override userHome(options?: { preferLocal: boolean }): Promise<URI>;
			override userHome(options: { preferLocal: true }): URI;
			override userHome(options?: { preferLocal: boolean }): Promise<URI> | URI {
				const home = URI.file('/home');
				return options?.preferLocal ? home : Promise.resolve(home);
			}
		};
		instantiationService.stub(ITerminalProfileResolverService, new class extends mock<ITerminalProfileResolverService>() {
			override async getDefaultProfile() { return { profileName: 'test', path: '/bin/bash.exe', args: [], isDefault: true }; }
		});
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
		const endedTasks: string[] = [];
		store.add(system.onDidStateChange(event => {
			events.push(event.kind);
			if (event.kind === TaskEventKind.End) {
				taskEnded = true;
				endedTasks.push(event.__task._label);
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
				override scrollToBottom() { }
				override async reuseTerminal(config: IShellLaunchConfig) {
					this.shellLaunchConfig = launchConfig = config;
					setTimeout(() => onExit.fire(0), 0);
				}
			};
		};
		const createTask = (command: string, cwd = 'C:\\work', env?: { [key: string]: string }) => new CustomTask('test', {
			kind: 'workspace', label: 'workspace',
			config: { workspaceFolder, file: '.vscode/tasks.json', index: 0, element: {} }
		}, 'test', options.runtime === RuntimeType.Shell ? 'shell' : 'process', {
			runtime: options.runtime ?? RuntimeType.Process, name: command, args: options.args ?? ['argument'],
			options: { cwd, env }, presentation: PresentationOptions.defaults
		}, false, RunOptions.defaults, options.configurationProperties ?? {});
		return {
			system,
			createTask,
			lookupCalls,
			acquiredVariables,
			endedTasks,
			get resolutionCalls() { return resolutionCalls; },
			get taskListeners() { return system['_onDidStateChange']['_size']; },
			get state() { return { taskEnded, terminalCreated: launchConfig !== undefined }; },
			get lifecycle() {
				return {
					activeTasks: system.getActiveTasks().length, busyTasks: system.getBusyTasks().length,
					modelListeners, events: [...events]
				};
			},
			execute(command: string, cwd = 'C:\\work', env?: { [key: string]: string }, alreadyResolved = new Map<string, string>()) {
				return runWithFakedTimers({ useFakeTimers: true }, async () => {
					const task = createTask(command, cwd, env);
					const resolver = { resolve: async () => task };
					const root = options.asDependency ? new InMemoryTask('parent', { kind: 'inMemory', label: 'test' }, 'parent', 'composite', RunOptions.defaults, {
						dependsOn: [{ uri: workspaceFolder.uri, task: 'test' }]
					}) : task;
					system['_currentTask'] = new VerifiedTask(task, resolver, 'test');
					await system['_executeTask'](root, resolver, 'test', new Set(), new Map(), alreadyResolved);
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
		const cwd = '/work';
		const system = createSystem(new Map([
			['input:tool', '${config:tool}'], ['config:tool', 'run'],
			['input:cwd', '${config:cwd}'], ['config:cwd', cwd],
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
			executable: 'C:\\tools\\run.exe', cwd: URI.from({ scheme: Schemas.file, path: cwd }).toString(), path: 'C:\\tools;C:\\other',
			lookupCalls: [{ command: 'run', cwd, paths: ['C:\\tools', 'C:\\other'] }],
			resolutionCalls: 1
		});
	});

	test('preserves literal dollar sequences in acquired process values', async () => {
		const executable = 'C:\\tools$$\\run$&.exe';
		const literal = 'literal $$ $& $` $\'';
		const paths = ['C:\\path$$', 'C:\\path$&'];
		const system = createSystem(new Map([
			['input:tool', executable], ['input:argument', literal],
			['input:env', literal], ['input:path', paths.join(';')]
		]), { args: ['${input:argument}'] });
		const config = await system.execute('${input:tool}', 'C:\\work', { LITERAL: '${input:env}', Path: '${input:path}' });
		assert.deepStrictEqual({
			executable: config?.executable,
			args: config?.args,
			env: { ...config?.env },
			lookupCalls: system.lookupCalls
		}, {
			executable,
			args: [literal],
			env: { LITERAL: literal, Path: paths.join(';') },
			lookupCalls: [{ command: executable, cwd: 'C:\\work', paths }]
		});
	});

	test('resolves workspace variables inside unknown shell expansions', async () => {
		const system = createSystem(new Map(), { runtime: RuntimeType.Shell, args: [] });
		const config = await system.execute('cd ${ROOT:-${workspaceFolder}} && make');
		assert.deepStrictEqual(config?.args, ['-c', `cd \${ROOT:-${normalizeDriveLetter(workspaceFolder.uri.fsPath)}} && make`]);
	});

	for (const variable of ['input:root', 'command:root']) {
		test(`acquires and resolves ${variable} inside unknown shell expansions`, async () => {
			const system = createSystem(new Map([[variable, '/work']]), { runtime: RuntimeType.Shell, args: [] });
			const config = await system.execute('cd ${ROOT:-${' + variable + '}} && make');
			assert.deepStrictEqual({
				args: config?.args, acquired: system.acquiredVariables, resolutionCalls: system.resolutionCalls
			}, {
				args: ['-c', 'cd ${ROOT:-/work} && make'], acquired: ['${' + variable + '}', '${workspaceFolder}'], resolutionCalls: 1
			});
		});
	}

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

	test('resolves repeated acquired shell expansions without treating siblings as cycles', async () => {
		const system = createSystem(new Map([
			['input:wrapped', '${ROOT:-${config:directory}}'], ['config:directory', '/work']
		]), { args: ['${input:wrapped}', '${input:wrapped}'] });
		const config = await system.execute('C:\\tools\\run.exe');
		assert.deepStrictEqual(config?.args, ['${ROOT:-/work}', '${ROOT:-/work}']);
	});

	test('leaves cycles inside acquired shell expansions unresolved without repeating their prefix', async () => {
		const system = createSystem(new Map([
			['input:wrapped', '${ROOT:-${input:wrapped}}'], ['config:grow', 'prefix ${config:grow}']
		]), { args: ['${input:wrapped}', '${config:grow}'] });
		const config = await system.execute('C:\\tools\\run.exe');
		assert.deepStrictEqual(config?.args, ['${ROOT:-${input:wrapped}}', 'prefix ${config:grow}']);
	});

	if (isWindows) {
		for (const command of ['run.exe', '${input:tool}', '${command:tool}']) {
			test(`preserves PATH lookup for bare ${command} without task system info`, async () => {
				const system = createSystem(new Map([['input:tool', 'run.exe'], ['command:tool', 'run.exe']]), { withSystemInfo: false });
				const config = await system.execute(command, 'C:\\work', { PATH: 'C:\\tools' });
				assert.deepStrictEqual({
					executable: config?.executable, path: config?.env?.PATH, lookupCalls: system.lookupCalls
				}, {
					executable: 'run.exe', path: 'C:\\tools', lookupCalls: []
				});
			});
		}

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
			assert.deepStrictEqual({ ...system.state, endedTasks: system.endedTasks }, {
				taskEnded: true, terminalCreated: false, endedTasks: ['test']
			});
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

	for (const withSystemInfo of [false, true]) {
		for (const asDependency of [false, true]) {
			test(`ends a background ${asDependency ? 'dependency' : 'task'} after repeated configuration errors ${withSystemInfo ? 'with' : 'without'} task system info`, async () => {
				const system = createSystem(new Map([['config:tool', '${config:missing}']]), {
					withSystemInfo, asDependency,
					configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
				});
				const initialListeners = system.taskListeners;
				const attempts = [];
				for (let i = 0; i < 2; i++) {
					await assert.rejects(system.execute('${config:tool}'), /setting 'missing' not found/);
					const { events, ...lifecycle } = system.lifecycle;
					attempts.push({
						...system.state, ...lifecycle,
						extraListeners: system.taskListeners - initialListeners,
						endedTasks: [...system.endedTasks],
						activeEvents: events.filter(event => event === TaskEventKind.Active || event === TaskEventKind.Inactive).length
					});
				}
				const endedTasks = asDependency ? ['test', 'parent'] : ['test'];
				assert.deepStrictEqual(attempts, [1, 2].map(attempt => ({
					taskEnded: true, terminalCreated: false, activeTasks: 0, busyTasks: 0, modelListeners: 0,
					extraListeners: 0, endedTasks: Array.from({ length: attempt }, () => endedTasks).flat(), activeEvents: 0
				})));
			});
		}
	}

	test('ends a background task when process preflight resolution fails', async () => {
		const system = createSystem(new Map([['input:tool', '${config:missing}']]), {
			platform: Platform.Linux,
			configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
		});
		await assert.rejects(system.execute('${input:tool}'), /setting 'missing' not found/);
		assert.deepStrictEqual({ ...system.state, ...system.lifecycle, endedTasks: system.endedTasks }, {
			taskEnded: true, terminalCreated: false, activeTasks: 0, busyTasks: 0, modelListeners: 0,
			events: [TaskEventKind.AcquiredInput, TaskEventKind.End], endedTasks: ['test']
		});
	});

	for (const runtime of [RuntimeType.Process, RuntimeType.Shell]) {
		for (const isBackground of [false, true]) {
			for (const location of ['arguments', 'environment', 'problem matcher']) {
				test(`ends a ${isBackground ? 'background' : 'foreground'} ${runtime === RuntimeType.Process ? 'process' : 'shell'} task before launch when ${location} resolution fails`, async () => {
					const system = createSystem(new Map([['input:value', '${config:missing}']]), {
						runtime,
						args: location === 'arguments' ? ['${input:value}'] : [],
						configurationProperties: {
							isBackground,
							problemMatchers: [location === 'problem matcher' ? {
								...backgroundMatcher, fileLocation: FileLocationKind.Relative, filePrefix: '${input:value}'
							} : backgroundMatcher]
						}
					});
					const env = location === 'environment' ? { VALUE: '${input:value}' } : undefined;
					await assert.rejects(system.execute('C:\\tools\\run.exe', 'C:\\work', env), /setting 'missing' not found/);
					assert.deepStrictEqual({ ...system.state, ...system.lifecycle, endedTasks: system.endedTasks }, {
						taskEnded: true, terminalCreated: false, activeTasks: 0, busyTasks: 0, modelListeners: 0,
						events: [TaskEventKind.AcquiredInput, TaskEventKind.End], endedTasks: ['test']
					});
				});
			}
		}
	}

	for (const withSystemInfo of [false, true]) {
		for (const cached of [false, true]) {
			test(`ends a rerun when ${cached ? 'cached' : 'new'} configuration resolution fails ${withSystemInfo ? 'with' : 'without'} task system info`, async () => {
				const values = new Map<string, string>(cached ? [['config:tool', '${config:missing}']] : []);
				values.set('workspaceFolder', normalizeDriveLetter(workspaceFolder.uri.fsPath));
				const system = createSystem(values, { withSystemInfo });
				await system.execute('C:\\tools\\run.exe');
				system.system['_lastTask'] = system.system['_currentTask'];
				system.system['_isRerun'] = true;
				values.set('config:tool', '${config:missing}');
				const initialCalls = system.resolutionCalls;
				const initialEvents = system.lifecycle.events.length;
				await assert.rejects(system.execute('${config:tool}'), /setting 'missing' not found/);
				const { events, ...lifecycle } = system.lifecycle;
				assert.deepStrictEqual({
					...lifecycle, endedTasks: system.endedTasks, acquisitionCalls: system.resolutionCalls - initialCalls,
					executionEvents: events.slice(initialEvents).filter(event => event !== TaskEventKind.AcquiredInput)
				}, {
					activeTasks: 0, busyTasks: 0, modelListeners: 0, endedTasks: ['test', 'test'],
					acquisitionCalls: cached ? 0 : 1, executionEvents: [TaskEventKind.End]
				});
			});
		}
	}

	test('acquires only missing rerun inputs and preserves shared values', async () => {
		const values = new Map([
			['input:tool', 'C:\\cached\\run.exe'],
			['workspaceFolder', normalizeDriveLetter(workspaceFolder.uri.fsPath)]
		]);
		const args: string[] = [];
		const system = createSystem(values, { args });
		await system.execute('${input:tool}');
		system.system['_lastTask'] = system.system['_currentTask'];
		system.system['_isRerun'] = true;
		args.push('${input:argument}');
		values.delete('input:tool');
		values.set('input:argument', 'new argument');
		const alreadyResolved = new Map([['input:tool', 'C:\\shared\\run.exe']]);
		const initialAcquisitions = system.acquiredVariables.length;
		const config = await system.execute('${input:tool}', 'C:\\work', undefined, alreadyResolved);
		assert.deepStrictEqual({
			acquiredVariables: system.acquiredVariables.slice(initialAcquisitions),
			command: system.lookupCalls.at(-1)?.command, arguments: config?.args,
			sharedValues: [alreadyResolved.get('input:tool'), alreadyResolved.get('input:argument')],
			endedTasks: system.endedTasks
		}, {
			acquiredVariables: ['${input:argument}'], command: 'C:\\shared\\run.exe', arguments: ['new argument'],
			sharedValues: ['C:\\shared\\run.exe', 'new argument'], endedTasks: ['test', 'test']
		});
	});

	test('clears rerun state when execution rejects without swallowing the error', async () => {
		const system = createSystem(new Map());
		await system.execute('C:\\tools\\run.exe');
		const previousTask = system.system['_currentTask'];
		previousTask.task.runOptions = { ...previousTask.task.runOptions, reevaluateOnRerun: false };
		system.system['_lastTask'] = previousTask;
		const execution = new DeferredPromise<ITaskSummary>();
		system.system.run = () => ({ kind: TaskExecuteKind.Started, task: previousTask.task, promise: execution.p });
		const result = system.system.rerun();
		assert.ok(result);
		const error = new Error('variable resolution failed');
		const rejection = assert.rejects(result.promise, reason => reason === error);
		await execution.error(error);
		await rejection;
		assert.strictEqual(system.system['_isRerun'], false);
	});

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

	test('disposes dependency listeners after repeated empty background rejections', async () => {
		const system = createSystem(new Map([['input:tool', '']]), {
			asDependency: true, configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
		});
		const initialListeners = system.taskListeners;
		const attempts = [];
		for (let i = 0; i < 2; i++) {
			await assert.rejects(system.execute('${input:tool}'), /process task command resolved to an empty string/i);
			attempts.push({
				extraListeners: system.taskListeners - initialListeners,
				activeTasks: system.lifecycle.activeTasks,
				terminalCreated: system.state.terminalCreated,
				inactiveEvents: system.lifecycle.events.filter(event => event === TaskEventKind.Inactive).length,
				endedTasks: [...system.endedTasks]
			});
		}
		assert.deepStrictEqual(attempts, [
			{ extraListeners: 0, activeTasks: 0, terminalCreated: false, inactiveEvents: 0, endedTasks: ['test', 'parent'] },
			{ extraListeners: 0, activeTasks: 0, terminalCreated: false, inactiveEvents: 0, endedTasks: ['test', 'parent', 'test', 'parent'] }
		]);
	});

	test('disposes dependency listeners after successful background execution', async () => {
		const system = createSystem(new Map(), {
			asDependency: true, configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] }
		});
		const initialListeners = system.taskListeners;
		await system.execute('C:\\tools\\run.exe');
		assert.deepStrictEqual({
			extraListeners: system.taskListeners - initialListeners,
			activeTasks: system.lifecycle.activeTasks,
			modelListeners: system.lifecycle.modelListeners,
			inactiveEvents: system.lifecycle.events.filter(event => event === TaskEventKind.Inactive).length
		}, { extraListeners: 0, activeTasks: 0, modelListeners: 0, inactiveEvents: 1 });
	});

	for (const outcome of ['inactive', 'complete', 'reject']) {
		test(`disposes an already-running dependency listener when it becomes ${outcome}`, async () => {
			const fixture = createSystem(new Map(), { configurationProperties: { isBackground: true, problemMatchers: [backgroundMatcher] } });
			const task = fixture.createTask('C:\\tools\\run.exe');
			const completion = new DeferredPromise<ITaskSummary>();
			const initialListeners = fixture.taskListeners;
			const dependency = fixture.system['_getDependencyPromise']({
				task, promise: completion.p, count: { count: 1 }, state: TaskEventKind.Active
			});
			fixture.system['_fireTaskEvent'](TaskEvent.general(TaskEventKind.Inactive, fixture.createTask('C:\\other.exe')));
			const listenersAfterUnrelatedEvent = fixture.taskListeners - initialListeners;
			let result: ITaskSummary | string;
			if (outcome === 'reject') {
				const rejection = assert.rejects(dependency, /dependency failed/);
				await completion.error(new Error('dependency failed'));
				await rejection;
				result = 'rejected';
			} else {
				if (outcome === 'inactive') {
					fixture.system['_fireTaskEvent'](TaskEvent.general(TaskEventKind.Inactive, task));
					result = await dependency;
					await completion.complete({ exitCode: 9 });
				} else {
					await completion.complete({ exitCode: 9 });
					result = await dependency;
				}
			}
			assert.deepStrictEqual({
				listenersAfterUnrelatedEvent, remainingListeners: fixture.taskListeners - initialListeners, result
			}, {
				listenersAfterUnrelatedEvent: 1, remainingListeners: 0,
				result: outcome === 'reject' ? 'rejected' : { exitCode: outcome === 'inactive' ? 0 : 9 }
			});
		});
	}
});
