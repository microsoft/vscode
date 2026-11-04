/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { win32 } from '../../../../../base/common/path.js';
import { isWindows, Platform } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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
import { ITaskSystemInfo, VerifiedTask } from '../../common/taskSystem.js';
import { CustomTask, PresentationOptions, RunOptions, RuntimeType, TaskEventKind } from '../../common/tasks.js';

suite('TerminalTaskSystem process executable', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise the real resolution and launch-config pipeline without exposing test-only APIs. */
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceFolder = toWorkspaceFolder(URI.file('C:\\work'));

	function createSystem(values: Map<string, string>, withSystemInfo: boolean = true, foundExecutable?: string) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
		instantiationService.stubInstance(TaskTerminalStatus, { dispose() { } });
		const lookupCalls: { command: string; cwd?: string; paths?: string[] }[] = [];
		const systemInfo: ITaskSystemInfo = {
			platform: Platform.Windows,
			context: undefined,
			uriProvider: path => URI.file(path),
			resolveVariables: async () => ({ variables: new Map(values), process: 'ignored.exe' }),
			findExecutable: async (command, cwd, paths) => {
				lookupCalls.push({ command, cwd, paths });
				return foundExecutable;
			}
		};
		const configurationResolver = new class extends AbstractVariableResolverService {
			override async resolveWithInteraction() { return new Map(values); }
		}(new class extends mock<ConstructorParameters<typeof AbstractVariableResolverService>[0]>() { });
		const pathService = new class extends mock<IPathService>() {
			override path = Promise.resolve(win32);
			override defaultUriScheme = Schemas.file;
		};
		const system = store.add(instantiationService.invokeFunction(accessor => new TerminalTaskSystem(
			new class extends mock<ITerminalService>() { override onDidChangeActiveInstance = Event.None; },
			new class extends mock<ITerminalGroupService>() { },
			new class extends mock<IOutputService>() { },
			accessor.get(IPaneCompositePartService), accessor.get(IViewsService), accessor.get(IMarkerService),
			accessor.get(IModelService), configurationResolver, accessor.get(IWorkspaceContextService),
			accessor.get(IWorkbenchEnvironmentService), 'tasks', accessor.get(IFileService),
			accessor.get(ITerminalProfileResolverService), pathService, accessor.get(IViewDescriptorService),
			accessor.get(ILogService), accessor.get(INotificationService), accessor.get(IContextKeyService),
			instantiationService, () => withSystemInfo ? systemInfo : undefined, async () => undefined,
		)));
		let taskEnded = false;
		store.add(system.onDidStateChange(event => {
			if (event.kind === TaskEventKind.End) {
				taskEnded = true;
			}
		}));
		let launchConfig: IShellLaunchConfig | undefined;
		system['_doCreateTerminal'] = async (_task, _group, config) => {
			launchConfig = config;
			return new class extends mock<ITerminalInstance>() {
				override instanceId = 1;
				override shellLaunchConfig = config;
				override onDisposed = Event.None;
			};
		};
		system['_executeInTerminal'] = async (task, _trigger, resolver, folder) => {
			const [, error] = await system['_createTerminal'](task, resolver, folder);
			if (error) {
				throw new Error(error.message);
			}
			return { exitCode: 0 };
		};
		return {
			lookupCalls,
			get state() { return { taskEnded, terminalCreated: launchConfig !== undefined }; },
			async execute(command: string, cwd = 'C:\\work', env?: { [key: string]: string }, alreadyResolved = new Map<string, string>()) {
				const task = new CustomTask('test', {
					kind: 'workspace', label: 'workspace',
					config: { workspaceFolder, file: '.vscode/tasks.json', index: 0, element: {} }
				}, 'test', 'process', {
					runtime: RuntimeType.Process, name: command, args: ['argument'],
					options: { cwd, env }, presentation: PresentationOptions.defaults
				}, false, RunOptions.defaults, {});
				system['_currentTask'] = new VerifiedTask(task, { resolve: async () => undefined }, 'test');
				await system['_executeCommand'](task, 'test', alreadyResolved);
				return launchConfig;
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
		]), true, 'C:\\tools\\run.EXE');
		const config = await execute('${input:tool}', '${input:cwd}', { Path: '${input:path}' });
		assert.deepStrictEqual({ executable: config?.executable, lookupCalls }, {
			executable: 'C:\\tools\\run.EXE',
			lookupCalls: [{ command: 'run', cwd: 'C:\\work', paths: ['C:\\tools', 'C:\\other'] }]
		});
	});

	test('fully resolved commands still use executable lookup', async () => {
		const { execute, lookupCalls } = createSystem(new Map(), true, 'C:\\tools\\run.exe');
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

	if (isWindows) {
		test('resolves process variables without task system info', async () => {
			const { execute } = createSystem(new Map([['input:tool', 'tools\\run.exe']]), false);
			const config = await execute('${input:tool}');
			assert.strictEqual(config?.executable, 'C:\\work\\tools\\run.exe');
		});
	}
});
