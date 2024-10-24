/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import assert from 'assert';
import Severity from '../../../../../base/common/severity.js';
import * as UUID from '../../../../../base/common/uuid.js';

import * as Types from '../../../../../base/common/types.js';
import * as Platform from '../../../../../base/common/platform.js';
import { ValidationStatus } from '../../../../../base/common/parsers.js';
import { ProblemMatcher, FileLocationKind, IProblemPattern, ApplyToKind, INamedProblemMatcher } from '../../common/problemMatcher.js';
import { WorkspaceFolder, IWorkspace } from '../../../../../platform/workspace/common/workspace.js';

import * as Tasks from '../../common/tasks.js';
import { parse, IParseResult, IProblemReporter, IExternalTaskRunnerConfiguration, ICustomTask, TaskConfigSource, IParseContext, ProblemMatcherConverter, IGlobals, ITaskParseResult, UUIDMap, TaskParser } from '../../common/taskConfiguration.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITaskDefinitionRegistry } from '../../common/taskDefinitionRegistry.js';

const workspaceFolder: WorkspaceFolder = new WorkspaceFolder({
	uri: URI.file('/workspace/folderOne'),
	name: 'folderOne',
	index: 0
});

const workspace: IWorkspace = new Workspace('id', [workspaceFolder]);

class ProblemReporter implements IProblemReporter {

	private _validationStatus: ValidationStatus = new ValidationStatus();

	public receivedMessage: boolean = false;
	public lastMessage: string | undefined = undefined;

	public info(message: string): void {
		this.log(message);
	}

	public warn(message: string): void {
		this.log(message);
	}

	public error(message: string): void {
		this.log(message);
	}

	public fatal(message: string): void {
		this.log(message);
	}

	public get status(): ValidationStatus {
		return this._validationStatus;
	}

	private log(message: string): void {
		this.receivedMessage = true;
		this.lastMessage = message;
	}

	public clearMessage(): void {
		this.lastMessage = undefined;
	}
}

class ConfigurationBuilder {

	public result: Tasks.Task[];
	private builders: CustomTaskBuilder[];

	constructor() {
		this.result = [];
		this.builders = [];
	}

	public task(name: string, command: string): CustomTaskBuilder {
		const builder = new CustomTaskBuilder(this, name, command);
		this.builders.push(builder);
		this.result.push(builder.result);
		return builder;
	}

	public done(): void {
		for (const builder of this.builders) {
			builder.done();
		}
	}
}

class PresentationBuilder {

	public result: Tasks.IPresentationOptions;

	constructor(public parent: CommandConfigurationBuilder) {
		this.result = { echo: false, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, close: false };
	}

	public echo(value: boolean): PresentationBuilder {
		this.result.echo = value;
		return this;
	}

	public reveal(value: Tasks.RevealKind): PresentationBuilder {
		this.result.reveal = value;
		return this;
	}

	public focus(value: boolean): PresentationBuilder {
		this.result.focus = value;
		return this;
	}

	public instance(value: Tasks.PanelKind): PresentationBuilder {
		this.result.panel = value;
		return this;
	}

	public showReuseMessage(value: boolean): PresentationBuilder {
		this.result.showReuseMessage = value;
		return this;
	}

	public close(value: boolean): PresentationBuilder {
		this.result.close = value;
		return this;
	}

	public done(): void {
	}
}

class CommandConfigurationBuilder {
	public result: Tasks.ICommandConfiguration;

	private presentationBuilder: PresentationBuilder;

	constructor(public parent: CustomTaskBuilder, command: string) {
		this.presentationBuilder = new PresentationBuilder(this);
		this.result = {
			name: command,
			runtime: Tasks.RuntimeType.Process,
			args: [],
			options: {
				cwd: '${workspaceFolder}'
			},
			presentation: this.presentationBuilder.result,
			suppressTaskName: false
		};
	}

	public name(value: string): CommandConfigurationBuilder {
		this.result.name = value;
		return this;
	}

	public runtime(value: Tasks.RuntimeType): CommandConfigurationBuilder {
		this.result.runtime = value;
		return this;
	}

	public args(value: string[]): CommandConfigurationBuilder {
		this.result.args = value;
		return this;
	}

	public options(value: Tasks.CommandOptions): CommandConfigurationBuilder {
		this.result.options = value;
		return this;
	}

	public taskSelector(value: string): CommandConfigurationBuilder {
		this.result.taskSelector = value;
		return this;
	}

	public suppressTaskName(value: boolean): CommandConfigurationBuilder {
		this.result.suppressTaskName = value;
		return this;
	}

	public presentation(): PresentationBuilder {
		return this.presentationBuilder;
	}

	public done(taskName: string): void {
		this.result.args = this.result.args!.map(arg => arg === '$name' ? taskName : arg);
		this.presentationBuilder.done();
	}
}

class CustomTaskBuilder {

	public result: Tasks.CustomTask;
	private commandBuilder: CommandConfigurationBuilder;

	constructor(public parent: ConfigurationBuilder, name: string, command: string) {
		this.commandBuilder = new CommandConfigurationBuilder(this, command);
		this.result = new Tasks.CustomTask(
			name,
			{ kind: Tasks.TaskSourceKind.Workspace, label: 'workspace', config: { workspaceFolder: workspaceFolder, element: undefined, index: -1, file: '.vscode/tasks.json' } },
			name,
			Tasks.CUSTOMIZED_TASK_TYPE,
			this.commandBuilder.result,
			false,
			{ reevaluateOnRerun: true },
			{
				identifier: name,
				name: name,
				isBackground: false,
				promptOnClose: true,
				problemMatchers: [],
			}
		);
	}

	public identifier(value: string): CustomTaskBuilder {
		this.result.configurationProperties.identifier = value;
		return this;
	}

	public group(value: string | Tasks.TaskGroup): CustomTaskBuilder {
		this.result.configurationProperties.group = value;
		return this;
	}

	public isBackground(value: boolean): CustomTaskBuilder {
		this.result.configurationProperties.isBackground = value;
		return this;
	}

	public promptOnClose(value: boolean): CustomTaskBuilder {
		this.result.configurationProperties.promptOnClose = value;
		return this;
	}

	public problemMatcher(): ProblemMatcherBuilder {
		const builder = new ProblemMatcherBuilder(this);
		this.result.configurationProperties.problemMatchers!.push(builder.result);
		return builder;
	}

	public command(): CommandConfigurationBuilder {
		return this.commandBuilder;
	}

	public done(): void {
		this.commandBuilder.done(this.result.configurationProperties.name!);
	}
}

class ProblemMatcherBuilder {

	public static readonly DEFAULT_UUID = UUID.generateUuid();

	public result: ProblemMatcher;

	constructor(public parent: CustomTaskBuilder) {
		this.result = {
			owner: ProblemMatcherBuilder.DEFAULT_UUID,
			applyTo: ApplyToKind.allDocuments,
			severity: undefined,
			fileLocation: FileLocationKind.Relative,
			filePrefix: '${workspaceFolder}',
			pattern: undefined!
		};
	}

	public owner(value: string): ProblemMatcherBuilder {
		this.result.owner = value;
		return this;
	}

	public applyTo(value: ApplyToKind): ProblemMatcherBuilder {
		this.result.applyTo = value;
		return this;
	}

	public severity(value: Severity): ProblemMatcherBuilder {
		this.result.severity = value;
		return this;
	}

	public fileLocation(value: FileLocationKind): ProblemMatcherBuilder {
		this.result.fileLocation = value;
		return this;
	}

	public filePrefix(value: string): ProblemMatcherBuilder {
		this.result.filePrefix = value;
		return this;
	}

	public pattern(regExp: RegExp): PatternBuilder {
		const builder = new PatternBuilder(this, regExp);
		if (!this.result.pattern) {
			this.result.pattern = builder.result;
		}
		return builder;
	}
}

class PatternBuilder {
	public result: IProblemPattern;

	constructor(public parent: ProblemMatcherBuilder, regExp: RegExp) {
		this.result = {
			regexp: regExp,
			file: 1,
			message: 0,
			line: 2,
			character: 3
		};
	}

	public file(value: number): PatternBuilder {
		this.result.file = value;
		return this;
	}

	public message(value: number): PatternBuilder {
		this.result.message = value;
		return this;
	}

	public location(value: number): PatternBuilder {
		this.result.location = value;
		return this;
	}

	public line(value: number): PatternBuilder {
		this.result.line = value;
		return this;
	}

	public character(value: number): PatternBuilder {
		this.result.character = value;
		return this;
	}

	public endLine(value: number): PatternBuilder {
		this.result.endLine = value;
		return this;
	}

	public endCharacter(value: number): PatternBuilder {
		this.result.endCharacter = value;
		return this;
	}

	public code(value: number): PatternBuilder {
		this.result.code = value;
		return this;
	}

	public severity(value: number): PatternBuilder {
		this.result.severity = value;
		return this;
	}

	public loop(value: boolean): PatternBuilder {
		this.result.loop = value;
		return this;
	}
}

class TasksMockContextKeyService extends MockContextKeyService {
	public override getContext(domNode: HTMLElement): IContext {
		return {
			getValue: <T>(_key: string) => {
				return <T><unknown>true;
			}
		};
	}
}

function testDefaultProblemMatcher(external: IExternalTaskRunnerConfiguration, resolved: number) {
	const reporter = new ProblemReporter();
	const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
	assert.ok(!reporter.receivedMessage);
	assert.strictEqual(result.custom.length, 1);
	const task = result.custom[0];
	assert.ok(task);
	assert.strictEqual(task.configurationProperties.problemMatchers!.length, resolved);
}

function testConfiguration(external: IExternalTaskRunnerConfiguration, builder: ConfigurationBuilder): void {
	builder.done();
	const reporter = new ProblemReporter();
	const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
	if (reporter.receivedMessage) {
		assert.ok(false, reporter.lastMessage);
	}
	assertConfiguration(result, builder.result);
}

class TaskGroupMap {
	private _store: { [key: string]: Tasks.Task[] };

	constructor() {
		this._store = Object.create(null);
	}

	public add(group: string, task: Tasks.Task): void {
		let tasks = this._store[group];
		if (!tasks) {
			tasks = [];
			this._store[group] = tasks;
		}
		tasks.push(task);
	}

	public static assert(actual: TaskGroupMap, expected: TaskGroupMap): void {
		const actualKeys = Object.keys(actual._store);
		const expectedKeys = Object.keys(expected._store);
		if (actualKeys.length === 0 && expectedKeys.length === 0) {
			return;
		}
		assert.strictEqual(actualKeys.length, expectedKeys.length);
		actualKeys.forEach(key => assert.ok(expected._store[key]));
		expectedKeys.forEach(key => actual._store[key]);
		actualKeys.forEach((key) => {
			const actualTasks = actual._store[key];
			const expectedTasks = expected._store[key];
			assert.strictEqual(actualTasks.length, expectedTasks.length);
			if (actualTasks.length === 1) {
				assert.strictEqual(actualTasks[0].configurationProperties.name, expectedTasks[0].configurationProperties.name);
				return;
			}
			const expectedTaskMap: { [key: string]: boolean } = Object.create(null);
			expectedTasks.forEach(task => expectedTaskMap[task.configurationProperties.name!] = true);
			actualTasks.forEach(task => delete expectedTaskMap[task.configurationProperties.name!]);
			assert.strictEqual(Object.keys(expectedTaskMap).length, 0);
		});
	}
}

function assertConfiguration(result: IParseResult, expected: Tasks.Task[]): void {
	assert.ok(result.validationStatus.isOK());
	const actual = result.custom;
	assert.strictEqual(typeof actual, typeof expected);
	if (!actual) {
		return;
	}

	// We can't compare Ids since the parser uses UUID which are random
	// So create a new map using the name.
	const actualTasks: { [key: string]: Tasks.Task } = Object.create(null);
	const actualId2Name: { [key: string]: string } = Object.create(null);
	const actualTaskGroups = new TaskGroupMap();
	actual.forEach(task => {
		assert.ok(!actualTasks[task.configurationProperties.name!]);
		actualTasks[task.configurationProperties.name!] = task;
		actualId2Name[task._id] = task.configurationProperties.name!;

		const taskId = Tasks.TaskGroup.from(task.configurationProperties.group)?._id;
		if (taskId) {
			actualTaskGroups.add(taskId, task);
		}
	});
	const expectedTasks: { [key: string]: Tasks.Task } = Object.create(null);
	const expectedTaskGroup = new TaskGroupMap();
	expected.forEach(task => {
		assert.ok(!expectedTasks[task.configurationProperties.name!]);
		expectedTasks[task.configurationProperties.name!] = task;
		const taskId = Tasks.TaskGroup.from(task.configurationProperties.group)?._id;
		if (taskId) {
			expectedTaskGroup.add(taskId, task);
		}
	});
	const actualKeys = Object.keys(actualTasks);
	assert.strictEqual(actualKeys.length, expected.length);
	actualKeys.forEach((key) => {
		const actualTask = actualTasks[key];
		const expectedTask = expectedTasks[key];
		assert.ok(expectedTask);
		assertTask(actualTask, expectedTask);
	});
	TaskGroupMap.assert(actualTaskGroups, expectedTaskGroup);
}

function assertTask(actual: Tasks.Task, expected: Tasks.Task) {
	assert.ok(actual._id);
	assert.strictEqual(actual.configurationProperties.name, expected.configurationProperties.name, 'name');
	if (!Tasks.InMemoryTask.is(actual) && !Tasks.InMemoryTask.is(expected)) {
		assertCommandConfiguration(actual.command, expected.command);
	}
	assert.strictEqual(actual.configurationProperties.isBackground, expected.configurationProperties.isBackground, 'isBackground');
	assert.strictEqual(typeof actual.configurationProperties.problemMatchers, typeof expected.configurationProperties.problemMatchers);
	assert.strictEqual(actual.configurationProperties.promptOnClose, expected.configurationProperties.promptOnClose, 'promptOnClose');
	assert.strictEqual(typeof actual.configurationProperties.group, typeof expected.configurationProperties.group, `group types unequal`);

	if (actual.configurationProperties.problemMatchers && expected.configurationProperties.problemMatchers) {
		assert.strictEqual(actual.configurationProperties.problemMatchers.length, expected.configurationProperties.problemMatchers.length);
		for (let i = 0; i < actual.configurationProperties.problemMatchers.length; i++) {
			assertProblemMatcher(actual.configurationProperties.problemMatchers[i], expected.configurationProperties.problemMatchers[i]);
		}
	}

	if (actual.configurationProperties.group && expected.configurationProperties.group) {
		if (Types.isString(actual.configurationProperties.group)) {
			assert.strictEqual(actual.configurationProperties.group, expected.configurationProperties.group);
		} else {
			assertGroup(actual.configurationProperties.group as Tasks.TaskGroup, expected.configurationProperties.group as Tasks.TaskGroup);
		}
	}
}

function assertCommandConfiguration(actual: Tasks.ICommandConfiguration, expected: Tasks.ICommandConfiguration) {
	assert.strictEqual(typeof actual, typeof expected);
	if (actual && expected) {
		assertPresentation(actual.presentation!, expected.presentation!);
		assert.strictEqual(actual.name, expected.name, 'name');
		assert.strictEqual(actual.runtime, expected.runtime, 'runtime type');
		assert.strictEqual(actual.suppressTaskName, expected.suppressTaskName, 'suppressTaskName');
		assert.strictEqual(actual.taskSelector, expected.taskSelector, 'taskSelector');
		assert.deepStrictEqual(actual.args, expected.args, 'args');
		assert.strictEqual(typeof actual.options, typeof expected.options);
		if (actual.options && expected.options) {
			assert.strictEqual(actual.options.cwd, expected.options.cwd, 'cwd');
			assert.strictEqual(typeof actual.options.env, typeof expected.options.env, 'env');
			if (actual.options.env && expected.options.env) {
				assert.deepStrictEqual(actual.options.env, expected.options.env, 'env');
			}
		}
	}
}

function assertGroup(actual: Tasks.TaskGroup, expected: Tasks.TaskGroup) {
	assert.strictEqual(typeof actual, typeof expected);
	if (actual && expected) {
		assert.strictEqual(actual._id, expected._id, `group ids unequal. actual: ${actual._id} expected ${expected._id}`);
		assert.strictEqual(actual.isDefault, expected.isDefault, `group defaults unequal. actual: ${actual.isDefault} expected ${expected.isDefault}`);
	}
}

function assertPresentation(actual: Tasks.IPresentationOptions, expected: Tasks.IPresentationOptions) {
	assert.strictEqual(typeof actual, typeof expected);
	if (actual && expected) {
		assert.strictEqual(actual.echo, expected.echo);
		assert.strictEqual(actual.reveal, expected.reveal);
	}
}

function assertProblemMatcher(actual: string | ProblemMatcher, expected: string | ProblemMatcher) {
	assert.strictEqual(typeof actual, typeof expected);
	if (typeof actual === 'string' && typeof expected === 'string') {
		assert.strictEqual(actual, expected, 'Problem matcher references are different');
		return;
	}
	if (typeof actual !== 'string' && typeof expected !== 'string') {
		if (expected.owner === ProblemMatcherBuilder.DEFAULT_UUID) {
			assert.ok(UUID.isUUID(actual.owner), 'Owner must be a UUID');
		} else {
			assert.strictEqual(actual.owner, expected.owner);
		}
		assert.strictEqual(actual.applyTo, expected.applyTo);
		assert.strictEqual(actual.severity, expected.severity);
		assert.strictEqual(actual.fileLocation, expected.fileLocation);
		assert.strictEqual(actual.filePrefix, expected.filePrefix);
		if (actual.pattern && expected.pattern) {
			assertProblemPatterns(actual.pattern, expected.pattern);
		}
	}
}

function assertProblemPatterns(actual: IProblemPattern | IProblemPattern[], expected: IProblemPattern | IProblemPattern[]) {
	assert.strictEqual(typeof actual, typeof expected);
	if (Array.isArray(actual)) {
		const actuals = <IProblemPattern[]>actual;
		const expecteds = <IProblemPattern[]>expected;
		assert.strictEqual(actuals.length, expecteds.length);
		for (let i = 0; i < actuals.length; i++) {
			assertProblemPattern(actuals[i], expecteds[i]);
		}
	} else {
		assertProblemPattern(<IProblemPattern>actual, <IProblemPattern>expected);
	}
}

function assertProblemPattern(actual: IProblemPattern, expected: IProblemPattern) {
	assert.strictEqual(actual.regexp.toString(), expected.regexp.toString());
	assert.strictEqual(actual.file, expected.file);
	assert.strictEqual(actual.message, expected.message);
	if (typeof expected.location !== 'undefined') {
		assert.strictEqual(actual.location, expected.location);
	} else {
		assert.strictEqual(actual.line, expected.line);
		assert.strictEqual(actual.character, expected.character);
		assert.strictEqual(actual.endLine, expected.endLine);
		assert.strictEqual(actual.endCharacter, expected.endCharacter);
	}
	assert.strictEqual(actual.code, expected.code);
	assert.strictEqual(actual.severity, expected.severity);
	assert.strictEqual(actual.loop, expected.loop);
}

suite('Tasks version 0.1.0', () => {
	test('tasks: all default', () => {
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc'
			}, builder);
	});

	test('tasks: global isShellCommand', () => {
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				isShellCommand: true
			},
			builder);
	});

	test('tasks: global show output silent', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			presentation().reveal(Tasks.RevealKind.Silent);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				showOutput: 'silent'
			},
			builder
		);
	});

	test('tasks: global promptOnClose default', () => {
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				promptOnClose: true
			},
			builder
		);
	});

	test('tasks: global promptOnClose', () => {
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			promptOnClose(false).
			command().suppressTaskName(true);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				promptOnClose: false
			},
			builder
		);
	});

	test('tasks: global promptOnClose default watching', () => {
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			isBackground(true).
			promptOnClose(false).
			command().suppressTaskName(true);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				isWatching: true
			},
			builder
		);
	});

	test('tasks: global show output never', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			presentation().reveal(Tasks.RevealKind.Never);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				showOutput: 'never'
			},
			builder
		);
	});

	test('tasks: global echo Command', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			presentation().
			echo(true);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				echoCommand: true
			},
			builder
		);
	});

	test('tasks: global args', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			args(['--p']);
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				args: [
					'--p'
				]
			},
			builder
		);
	});

	test('tasks: options - cwd', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			options({
				cwd: 'myPath'
			});
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				options: {
					cwd: 'myPath'
				}
			},
			builder
		);
	});

	test('tasks: options - env', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			options({ cwd: '${workspaceFolder}', env: { key: 'value' } });
		testConfiguration(
			{
				version: '0.1.0',
				command: 'tsc',
				options: {
					env: {
						key: 'value'
					}
				}
			},
			builder
		);
	});

	test('tasks: os windows', () => {
		const name: string = Platform.isWindows ? 'tsc.win' : 'tsc';
		const builder = new ConfigurationBuilder();
		builder.
			task(name, name).
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			windows: {
				command: 'tsc.win'
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: os windows & global isShellCommand', () => {
		const name: string = Platform.isWindows ? 'tsc.win' : 'tsc';
		const builder = new ConfigurationBuilder();
		builder.
			task(name, name).
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			isShellCommand: true,
			windows: {
				command: 'tsc.win'
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: os mac', () => {
		const name: string = Platform.isMacintosh ? 'tsc.osx' : 'tsc';
		const builder = new ConfigurationBuilder();
		builder.
			task(name, name).
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			osx: {
				command: 'tsc.osx'
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: os linux', () => {
		const name: string = Platform.isLinux ? 'tsc.linux' : 'tsc';
		const builder = new ConfigurationBuilder();
		builder.
			task(name, name).
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			linux: {
				command: 'tsc.linux'
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: overwrite showOutput', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			presentation().reveal(Platform.isWindows ? Tasks.RevealKind.Always : Tasks.RevealKind.Never);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			showOutput: 'never',
			windows: {
				showOutput: 'always'
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: overwrite echo Command', () => {
		const builder = new ConfigurationBuilder();
		builder.
			task('tsc', 'tsc').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			presentation().
			echo(Platform.isWindows ? false : true);
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			echoCommand: true,
			windows: {
				echoCommand: false
			}
		};
		testConfiguration(external, builder);
	});

	test('tasks: global problemMatcher one', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			problemMatcher: '$msCompile'
		};
		testDefaultProblemMatcher(external, 1);
	});

	test('tasks: global problemMatcher two', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			problemMatcher: ['$eslint-compact', '$msCompile']
		};
		testDefaultProblemMatcher(external, 2);
	});

	test('tasks: task definition', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: build task', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isBuildCommand: true
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').group(Tasks.TaskGroup.Build).command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: default build task', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'build'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('build', 'tsc').group(Tasks.TaskGroup.Build).command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: test task', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isTestCommand: true
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').group(Tasks.TaskGroup.Test).command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: default test task', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('test', 'tsc').group(Tasks.TaskGroup.Test).command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: task with values', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test',
					showOutput: 'never',
					echoCommand: true,
					args: ['--p'],
					isWatching: true
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('test', 'tsc').
			group(Tasks.TaskGroup.Test).
			isBackground(true).
			promptOnClose(false).
			command().args(['$name', '--p']).
			presentation().
			echo(true).reveal(Tasks.RevealKind.Never);

		testConfiguration(external, builder);
	});

	test('tasks: task inherits global values', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			showOutput: 'never',
			echoCommand: true,
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('test', 'tsc').
			group(Tasks.TaskGroup.Test).
			command().args(['$name']).presentation().
			echo(true).reveal(Tasks.RevealKind.Never);

		testConfiguration(external, builder);
	});

	test('tasks: problem matcher default', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher .* regular expression', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: '.*'
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().pattern(/.*/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher owner, applyTo, severity and fileLocation', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						owner: 'myOwner',
						applyTo: 'closedDocuments',
						severity: 'warning',
						fileLocation: 'absolute',
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().
			owner('myOwner').
			applyTo(ApplyToKind.closedDocuments).
			severity(Severity.Warning).
			fileLocation(FileLocationKind.Absolute).
			filePrefix(undefined!).
			pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher fileLocation and filePrefix', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						fileLocation: ['relative', 'myPath'],
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().
			fileLocation(FileLocationKind.Relative).
			filePrefix('myPath').
			pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem pattern location', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc',
							file: 10,
							message: 11,
							location: 12,
							severity: 13,
							code: 14
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().
			pattern(/abc/).file(10).message(11).location(12).severity(13).code(14);
		testConfiguration(external, builder);
	});

	test('tasks: problem pattern line & column', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc',
							file: 10,
							message: 11,
							line: 12,
							column: 13,
							endLine: 14,
							endColumn: 15,
							severity: 16,
							code: 17
						}
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().args(['$name']).parent.
			problemMatcher().
			pattern(/abc/).file(10).message(11).
			line(12).character(13).endLine(14).endCharacter(15).
			severity(16).code(17);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close default', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			promptOnClose(true).
			command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close watching', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isWatching: true
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			isBackground(true).promptOnClose(false).
			command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close set', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					promptOnClose: false
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			promptOnClose(false).
			command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: task selector set', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			taskSelector: '/t:',
			tasks: [
				{
					taskName: 'taskName',
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().
			taskSelector('/t:').
			args(['/t:taskName']);
		testConfiguration(external, builder);
	});

	test('tasks: suppress task name set', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			suppressTaskName: false,
			tasks: [
				{
					taskName: 'taskName',
					suppressTaskName: true
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().suppressTaskName(true);
		testConfiguration(external, builder);
	});

	test('tasks: suppress task name inherit', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			suppressTaskName: true,
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskName', 'tsc').
			command().suppressTaskName(true);
		testConfiguration(external, builder);
	});

	test('tasks: two tasks', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskNameOne'
				},
				{
					taskName: 'taskNameTwo'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').
			command().args(['$name']);
		builder.task('taskNameTwo', 'tsc').
			command().args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: with command', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().suppressTaskName(true);
		testConfiguration(external, builder);
	});

	test('tasks: two tasks with command', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc'
				},
				{
					taskName: 'taskNameTwo',
					command: 'dir'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().suppressTaskName(true);
		builder.task('taskNameTwo', 'dir').command().suppressTaskName(true);
		testConfiguration(external, builder);
	});

	test('tasks: with command and args', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc',
					isShellCommand: true,
					args: ['arg'],
					options: {
						cwd: 'cwd',
						env: {
							env: 'env'
						}
					}
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).args(['arg']).options({ cwd: 'cwd', env: { env: 'env' } });
		testConfiguration(external, builder);
	});

	test('tasks: with command os specific', () => {
		const name: string = Platform.isWindows ? 'tsc.win' : 'tsc';
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc',
					windows: {
						command: 'tsc.win'
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', name).command().suppressTaskName(true);
		testConfiguration(external, builder);
	});

	test('tasks: with Windows specific args', () => {
		const args: string[] = Platform.isWindows ? ['arg1', 'arg2'] : ['arg1'];
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'tsc',
					command: 'tsc',
					args: ['arg1'],
					windows: {
						args: ['arg2']
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').command().suppressTaskName(true).args(args);
		testConfiguration(external, builder);
	});

	test('tasks: with Linux specific args', () => {
		const args: string[] = Platform.isLinux ? ['arg1', 'arg2'] : ['arg1'];
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			tasks: [
				{
					taskName: 'tsc',
					command: 'tsc',
					args: ['arg1'],
					linux: {
						args: ['arg2']
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('tsc', 'tsc').command().suppressTaskName(true).args(args);
		testConfiguration(external, builder);
	});

	test('tasks: global command and task command properties', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskNameOne',
					isShellCommand: true,
				} as ICustomTask
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().runtime(Tasks.RuntimeType.Shell).args(['$name']);
		testConfiguration(external, builder);
	});

	test('tasks: global and tasks args', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			args: ['global'],
			tasks: [
				{
					taskName: 'taskNameOne',
					args: ['local']
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().args(['global', '$name', 'local']);
		testConfiguration(external, builder);
	});

	test('tasks: global and tasks args with task selector', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			args: ['global'],
			taskSelector: '/t:',
			tasks: [
				{
					taskName: 'taskNameOne',
					args: ['local']
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('taskNameOne', 'tsc').command().taskSelector('/t:').args(['global', '/t:taskNameOne', 'local']);
		testConfiguration(external, builder);
	});
});

suite('Tasks version 2.0.0', () => {
	test.skip('Build workspace task', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			tasks: [
				{
					taskName: 'dir',
					command: 'dir',
					type: 'shell',
					group: 'build'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('dir', 'dir').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test('Global group none', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			command: 'dir',
			type: 'shell',
			group: 'none'
		};
		const builder = new ConfigurationBuilder();
		builder.task('dir', 'dir').
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test.skip('Global group build', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			command: 'dir',
			type: 'shell',
			group: 'build'
		};
		const builder = new ConfigurationBuilder();
		builder.task('dir', 'dir').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test.skip('Global group default build', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			command: 'dir',
			type: 'shell',
			group: { kind: 'build', isDefault: true }
		};
		const builder = new ConfigurationBuilder();
		const taskGroup = Tasks.TaskGroup.Build;
		taskGroup.isDefault = true;
		builder.task('dir', 'dir').
			group(taskGroup).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test('Local group none', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			tasks: [
				{
					taskName: 'dir',
					command: 'dir',
					type: 'shell',
					group: 'none'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('dir', 'dir').
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test.skip('Local group build', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			tasks: [
				{
					taskName: 'dir',
					command: 'dir',
					type: 'shell',
					group: 'build'
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('dir', 'dir').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test.skip('Local group default build', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			tasks: [
				{
					taskName: 'dir',
					command: 'dir',
					type: 'shell',
					group: { kind: 'build', isDefault: true }
				}
			]
		};
		const builder = new ConfigurationBuilder();
		const taskGroup = Tasks.TaskGroup.Build;
		taskGroup.isDefault = true;
		builder.task('dir', 'dir').
			group(taskGroup).
			command().suppressTaskName(true).
			runtime(Tasks.RuntimeType.Shell).
			presentation().echo(true);
		testConfiguration(external, builder);
	});
	test('Arg overwrite', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '2.0.0',
			tasks: [
				{
					label: 'echo',
					type: 'shell',
					command: 'echo',
					args: [
						'global'
					],
					windows: {
						args: [
							'windows'
						]
					},
					linux: {
						args: [
							'linux'
						]
					},
					osx: {
						args: [
							'osx'
						]
					}
				}
			]
		};
		const builder = new ConfigurationBuilder();
		if (Platform.isWindows) {
			builder.task('echo', 'echo').
				command().suppressTaskName(true).args(['windows']).
				runtime(Tasks.RuntimeType.Shell).
				presentation().echo(true);
			testConfiguration(external, builder);
		} else if (Platform.isLinux) {
			builder.task('echo', 'echo').
				command().suppressTaskName(true).args(['linux']).
				runtime(Tasks.RuntimeType.Shell).
				presentation().echo(true);
			testConfiguration(external, builder);
		} else if (Platform.isMacintosh) {
			builder.task('echo', 'echo').
				command().suppressTaskName(true).args(['osx']).
				runtime(Tasks.RuntimeType.Shell).
				presentation().echo(true);
			testConfiguration(external, builder);
		}
	});
});

suite('Bugs / regression tests', () => {
	(Platform.isLinux ? test.skip : test)('Bug 19548', () => {
		const external: IExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			windows: {
				command: 'powershell',
				options: {
					cwd: '${workspaceFolder}'
				},
				tasks: [
					{
						taskName: 'composeForDebug',
						suppressTaskName: true,
						args: [
							'-ExecutionPolicy',
							'RemoteSigned',
							'.\\dockerTask.ps1',
							'-ComposeForDebug',
							'-Environment',
							'debug'
						],
						isBuildCommand: false,
						showOutput: 'always',
						echoCommand: true
					} as ICustomTask
				]
			},
			osx: {
				command: '/bin/bash',
				options: {
					cwd: '${workspaceFolder}'
				},
				tasks: [
					{
						taskName: 'composeForDebug',
						suppressTaskName: true,
						args: [
							'-c',
							'./dockerTask.sh composeForDebug debug'
						],
						isBuildCommand: false,
						showOutput: 'always'
					} as ICustomTask
				]
			}
		};
		const builder = new ConfigurationBuilder();
		if (Platform.isWindows) {
			builder.task('composeForDebug', 'powershell').
				command().suppressTaskName(true).
				args(['-ExecutionPolicy', 'RemoteSigned', '.\\dockerTask.ps1', '-ComposeForDebug', '-Environment', 'debug']).
				options({ cwd: '${workspaceFolder}' }).
				presentation().echo(true).reveal(Tasks.RevealKind.Always);
			testConfiguration(external, builder);
		} else if (Platform.isMacintosh) {
			builder.task('composeForDebug', '/bin/bash').
				command().suppressTaskName(true).
				args(['-c', './dockerTask.sh composeForDebug debug']).
				options({ cwd: '${workspaceFolder}' }).
				presentation().reveal(Tasks.RevealKind.Always);
			testConfiguration(external, builder);
		}
	});

	test('Bug 28489', () => {
		const external = {
			version: '0.1.0',
			command: '',
			isShellCommand: true,
			args: [''],
			showOutput: 'always',
			'tasks': [
				{
					taskName: 'build',
					command: 'bash',
					args: [
						'build.sh'
					]
				}
			]
		};
		const builder = new ConfigurationBuilder();
		builder.task('build', 'bash').
			group(Tasks.TaskGroup.Build).
			command().suppressTaskName(true).
			args(['build.sh']).
			runtime(Tasks.RuntimeType.Shell);
		testConfiguration(external, builder);
	});
});

class TestNamedProblemMatcher implements Partial<ProblemMatcher> {
}

class TestParseContext implements Partial<IParseContext> {
}

class TestTaskDefinitionRegistry implements Partial<ITaskDefinitionRegistry> {
	private _task: Tasks.ITaskDefinition | undefined;
	public get(key: string): Tasks.ITaskDefinition {
		return this._task!;
	}
	public set(task: Tasks.ITaskDefinition) {
		this._task = task;
	}
}

suite('Task configuration conversions', () => {
	const globals = {} as IGlobals;
	const taskConfigSource = {} as TaskConfigSource;
	const TaskDefinitionRegistry = new TestTaskDefinitionRegistry();
	let instantiationService: TestInstantiationService;
	let parseContext: IParseContext;
	let namedProblemMatcher: INamedProblemMatcher;
	let problemReporter: ProblemReporter;
	setup(() => {
		instantiationService = new TestInstantiationService();
		namedProblemMatcher = instantiationService.createInstance(TestNamedProblemMatcher);
		namedProblemMatcher.name = 'real';
		namedProblemMatcher.label = 'real label';
		problemReporter = new ProblemReporter();
		parseContext = instantiationService.createInstance(TestParseContext);
		parseContext.problemReporter = problemReporter;
		parseContext.namedProblemMatchers = { 'real': namedProblemMatcher };
		parseContext.uuidMap = new UUIDMap();
	});
	teardown(() => {
		instantiationService.dispose();
	});
	suite('ProblemMatcherConverter.from', () => {
		test('returns [] and an error for an unknown problem matcher', () => {
			const result = (ProblemMatcherConverter.from('$fake', parseContext));
			assert.deepEqual(result.value, []);
			assert.strictEqual(result.errors?.length, 1);
		});
		test('returns config for a known problem matcher', () => {
			const result = (ProblemMatcherConverter.from('$real', parseContext));
			assert.strictEqual(result.errors?.length, 0);
			assert.deepEqual(result.value, [{ "label": "real label" }]);
		});
		test('returns config for a known problem matcher including applyTo', () => {
			namedProblemMatcher.applyTo = ApplyToKind.closedDocuments;
			const result = (ProblemMatcherConverter.from('$real', parseContext));
			assert.strictEqual(result.errors?.length, 0);
			assert.deepEqual(result.value, [{ "label": "real label", "applyTo": ApplyToKind.closedDocuments }]);
		});
	});
	suite('TaskParser.from', () => {
		suite('CustomTask', () => {
			suite('incomplete config reports an appropriate error for missing', () => {
				test('name', () => {
					const result = TaskParser.from([{} as ICustomTask], globals, parseContext, taskConfigSource);
					assertTaskParseResult(result, undefined, problemReporter, 'Error: a task must provide a label property');
				});
				test('command', () => {
					const result = TaskParser.from([{ taskName: 'task' } as ICustomTask], globals, parseContext, taskConfigSource);
					assertTaskParseResult(result, undefined, problemReporter, "Error: the task 'task' doesn't define a command");
				});
			});
			test('returns expected result', () => {
				const expected = [
					{ taskName: 'task', command: 'echo test' } as ICustomTask,
					{ taskName: 'task 2', command: 'echo test' } as ICustomTask
				];
				const result = TaskParser.from(expected, globals, parseContext, taskConfigSource);
				assertTaskParseResult(result, { custom: expected }, problemReporter, undefined);
			});
		});
		suite('ConfiguredTask', () => {
			test('returns expected result', () => {
				const expected = [{ taskName: 'task', command: 'echo test', type: 'any', label: 'task' }, { taskName: 'task 2', command: 'echo test', type: 'any', label: 'task 2' }];
				TaskDefinitionRegistry.set({ extensionId: 'registered', taskType: 'any', properties: {} } as Tasks.ITaskDefinition);
				const result = TaskParser.from(expected, globals, parseContext, taskConfigSource, TaskDefinitionRegistry);
				assertTaskParseResult(result, { configured: expected }, problemReporter, undefined);
			});
		});
	});
});

function assertTaskParseResult(actual: ITaskParseResult, expected: ITestTaskParseResult | undefined, problemReporter: ProblemReporter, expectedMessage?: string): void {
	if (expectedMessage === undefined) {
		assert.strictEqual(problemReporter.lastMessage, undefined);
	} else {
		assert.ok(problemReporter.lastMessage?.includes(expectedMessage));
	}

	assert.deepEqual(actual.custom.length, expected?.custom?.length || 0);
	assert.deepEqual(actual.configured.length, expected?.configured?.length || 0);

	let index = 0;
	if (expected?.configured) {
		for (const taskParseResult of expected?.configured) {
			assert.strictEqual(actual.configured[index]._label, taskParseResult.label);
			index++;
		}
	}
	index = 0;
	if (expected?.custom) {
		for (const taskParseResult of expected?.custom) {
			assert.strictEqual(actual.custom[index]._label, taskParseResult.taskName);
			index++;
		}
	}
	problemReporter.clearMessage();
}

interface ITestTaskParseResult {
	custom?: Partial<ICustomTask>[];
	configured?: Partial<ITestConfiguringTask>[];
}

interface ITestConfiguringTask extends Partial<Tasks.ConfiguringTask> {
	label: string;
}
