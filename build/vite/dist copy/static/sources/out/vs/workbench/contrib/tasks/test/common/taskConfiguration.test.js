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
import { FileLocationKind, ApplyToKind } from '../../common/problemMatcher.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import * as Tasks from '../../common/tasks.js';
import { parse, TaskConfigSource, ProblemMatcherConverter, UUIDMap, TaskParser } from '../../common/taskConfiguration.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const workspaceFolder = new WorkspaceFolder({
    uri: URI.file('/workspace/folderOne'),
    name: 'folderOne',
    index: 0
});
const workspace = new Workspace('id', [workspaceFolder]);
class ProblemReporter {
    constructor() {
        this._validationStatus = new ValidationStatus();
        this.receivedMessage = false;
        this.lastMessage = undefined;
    }
    info(message) {
        this.log(message);
    }
    warn(message) {
        this.log(message);
    }
    error(message) {
        this.log(message);
    }
    fatal(message) {
        this.log(message);
    }
    get status() {
        return this._validationStatus;
    }
    log(message) {
        this.receivedMessage = true;
        this.lastMessage = message;
    }
    clearMessage() {
        this.lastMessage = undefined;
    }
}
class ConfigurationBuilder {
    constructor() {
        this.result = [];
        this.builders = [];
    }
    task(name, command) {
        const builder = new CustomTaskBuilder(this, name, command);
        this.builders.push(builder);
        this.result.push(builder.result);
        return builder;
    }
    done() {
        for (const builder of this.builders) {
            builder.done();
        }
    }
}
class PresentationBuilder {
    constructor(parent) {
        this.parent = parent;
        this.result = { echo: false, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, close: false };
    }
    echo(value) {
        this.result.echo = value;
        return this;
    }
    reveal(value) {
        this.result.reveal = value;
        return this;
    }
    focus(value) {
        this.result.focus = value;
        return this;
    }
    instance(value) {
        this.result.panel = value;
        return this;
    }
    showReuseMessage(value) {
        this.result.showReuseMessage = value;
        return this;
    }
    close(value) {
        this.result.close = value;
        return this;
    }
    done() {
    }
}
class CommandConfigurationBuilder {
    constructor(parent, command) {
        this.parent = parent;
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
    name(value) {
        this.result.name = value;
        return this;
    }
    runtime(value) {
        this.result.runtime = value;
        return this;
    }
    args(value) {
        this.result.args = value;
        return this;
    }
    options(value) {
        this.result.options = value;
        return this;
    }
    taskSelector(value) {
        this.result.taskSelector = value;
        return this;
    }
    suppressTaskName(value) {
        this.result.suppressTaskName = value;
        return this;
    }
    presentation() {
        return this.presentationBuilder;
    }
    done(taskName) {
        this.result.args = this.result.args.map(arg => arg === '$name' ? taskName : arg);
        this.presentationBuilder.done();
    }
}
class CustomTaskBuilder {
    constructor(parent, name, command) {
        this.parent = parent;
        this.commandBuilder = new CommandConfigurationBuilder(this, command);
        this.result = new Tasks.CustomTask(name, { kind: Tasks.TaskSourceKind.Workspace, label: 'workspace', config: { workspaceFolder: workspaceFolder, element: undefined, index: -1, file: '.vscode/tasks.json' } }, name, Tasks.CUSTOMIZED_TASK_TYPE, this.commandBuilder.result, false, { reevaluateOnRerun: true }, {
            identifier: name,
            name: name,
            isBackground: false,
            promptOnClose: true,
            problemMatchers: [],
        });
    }
    identifier(value) {
        this.result.configurationProperties.identifier = value;
        return this;
    }
    group(value) {
        this.result.configurationProperties.group = value;
        return this;
    }
    isBackground(value) {
        this.result.configurationProperties.isBackground = value;
        return this;
    }
    promptOnClose(value) {
        this.result.configurationProperties.promptOnClose = value;
        return this;
    }
    problemMatcher() {
        const builder = new ProblemMatcherBuilder(this);
        this.result.configurationProperties.problemMatchers.push(builder.result);
        return builder;
    }
    command() {
        return this.commandBuilder;
    }
    done() {
        this.commandBuilder.done(this.result.configurationProperties.name);
    }
}
class ProblemMatcherBuilder {
    static { this.DEFAULT_UUID = UUID.generateUuid(); }
    constructor(parent) {
        this.parent = parent;
        this.result = {
            owner: ProblemMatcherBuilder.DEFAULT_UUID,
            applyTo: ApplyToKind.allDocuments,
            severity: undefined,
            fileLocation: FileLocationKind.Relative,
            filePrefix: '${workspaceFolder}',
            pattern: undefined
        };
    }
    owner(value) {
        this.result.owner = value;
        return this;
    }
    applyTo(value) {
        this.result.applyTo = value;
        return this;
    }
    severity(value) {
        this.result.severity = value;
        return this;
    }
    fileLocation(value) {
        this.result.fileLocation = value;
        return this;
    }
    filePrefix(value) {
        this.result.filePrefix = value;
        return this;
    }
    pattern(regExp) {
        const builder = new PatternBuilder(this, regExp);
        if (!this.result.pattern) {
            this.result.pattern = builder.result;
        }
        return builder;
    }
}
class PatternBuilder {
    constructor(parent, regExp) {
        this.parent = parent;
        this.result = {
            regexp: regExp,
            file: 1,
            message: 0,
            line: 2,
            character: 3
        };
    }
    file(value) {
        this.result.file = value;
        return this;
    }
    message(value) {
        this.result.message = value;
        return this;
    }
    location(value) {
        this.result.location = value;
        return this;
    }
    line(value) {
        this.result.line = value;
        return this;
    }
    character(value) {
        this.result.character = value;
        return this;
    }
    endLine(value) {
        this.result.endLine = value;
        return this;
    }
    endCharacter(value) {
        this.result.endCharacter = value;
        return this;
    }
    code(value) {
        this.result.code = value;
        return this;
    }
    severity(value) {
        this.result.severity = value;
        return this;
    }
    loop(value) {
        this.result.loop = value;
        return this;
    }
}
class TasksMockContextKeyService extends MockContextKeyService {
    getContext(domNode) {
        return {
            getValue: (_key) => {
                return true;
            }
        };
    }
}
function testDefaultProblemMatcher(external, resolved) {
    const reporter = new ProblemReporter();
    const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
    assert.ok(!reporter.receivedMessage);
    assert.strictEqual(result.custom.length, 1);
    const task = result.custom[0];
    assert.ok(task);
    assert.strictEqual(task.configurationProperties.problemMatchers.length, resolved);
}
function testConfiguration(external, builder) {
    builder.done();
    const reporter = new ProblemReporter();
    const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
    if (reporter.receivedMessage) {
        assert.ok(false, reporter.lastMessage);
    }
    assertConfiguration(result, builder.result);
}
class TaskGroupMap {
    constructor() {
        this._store = Object.create(null);
    }
    add(group, task) {
        let tasks = this._store[group];
        if (!tasks) {
            tasks = [];
            this._store[group] = tasks;
        }
        tasks.push(task);
    }
    static assert(actual, expected) {
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
            const expectedTaskMap = Object.create(null);
            expectedTasks.forEach(task => expectedTaskMap[task.configurationProperties.name] = true);
            actualTasks.forEach(task => delete expectedTaskMap[task.configurationProperties.name]);
            assert.strictEqual(Object.keys(expectedTaskMap).length, 0);
        });
    }
}
function assertConfiguration(result, expected) {
    assert.ok(result.validationStatus.isOK());
    const actual = result.custom;
    assert.strictEqual(typeof actual, typeof expected);
    if (!actual) {
        return;
    }
    // We can't compare Ids since the parser uses UUID which are random
    // So create a new map using the name.
    const actualTasks = Object.create(null);
    const actualId2Name = Object.create(null);
    const actualTaskGroups = new TaskGroupMap();
    actual.forEach(task => {
        assert.ok(!actualTasks[task.configurationProperties.name]);
        actualTasks[task.configurationProperties.name] = task;
        actualId2Name[task._id] = task.configurationProperties.name;
        const taskId = Tasks.TaskGroup.from(task.configurationProperties.group)?._id;
        if (taskId) {
            actualTaskGroups.add(taskId, task);
        }
    });
    const expectedTasks = Object.create(null);
    const expectedTaskGroup = new TaskGroupMap();
    expected.forEach(task => {
        assert.ok(!expectedTasks[task.configurationProperties.name]);
        expectedTasks[task.configurationProperties.name] = task;
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
function assertTask(actual, expected) {
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
        }
        else {
            assertGroup(actual.configurationProperties.group, expected.configurationProperties.group);
        }
    }
}
function assertCommandConfiguration(actual, expected) {
    assert.strictEqual(typeof actual, typeof expected);
    if (actual && expected) {
        assertPresentation(actual.presentation, expected.presentation);
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
function assertGroup(actual, expected) {
    assert.strictEqual(typeof actual, typeof expected);
    if (actual && expected) {
        assert.strictEqual(actual._id, expected._id, `group ids unequal. actual: ${actual._id} expected ${expected._id}`);
        assert.strictEqual(actual.isDefault, expected.isDefault, `group defaults unequal. actual: ${actual.isDefault} expected ${expected.isDefault}`);
    }
}
function assertPresentation(actual, expected) {
    assert.strictEqual(typeof actual, typeof expected);
    if (actual && expected) {
        assert.strictEqual(actual.echo, expected.echo);
        assert.strictEqual(actual.reveal, expected.reveal);
    }
}
function assertProblemMatcher(actual, expected) {
    assert.strictEqual(typeof actual, typeof expected);
    if (typeof actual === 'string' && typeof expected === 'string') {
        assert.strictEqual(actual, expected, 'Problem matcher references are different');
        return;
    }
    if (typeof actual !== 'string' && typeof expected !== 'string') {
        if (expected.owner === ProblemMatcherBuilder.DEFAULT_UUID) {
            assert.ok(UUID.isUUID(actual.owner), 'Owner must be a UUID');
        }
        else {
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
function assertProblemPatterns(actual, expected) {
    assert.strictEqual(typeof actual, typeof expected);
    if (Array.isArray(actual)) {
        const actuals = actual;
        const expecteds = expected;
        assert.strictEqual(actuals.length, expecteds.length);
        for (let i = 0; i < actuals.length; i++) {
            assertProblemPattern(actuals[i], expecteds[i]);
        }
    }
    else {
        assertProblemPattern(actual, expected);
    }
}
function assertProblemPattern(actual, expected) {
    assert.strictEqual(actual.regexp.toString(), expected.regexp.toString());
    assert.strictEqual(actual.file, expected.file);
    assert.strictEqual(actual.message, expected.message);
    if (typeof expected.location !== 'undefined') {
        assert.strictEqual(actual.location, expected.location);
    }
    else {
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
    ensureNoDisposablesAreLeakedInTestSuite();
    test('tasks: all default', () => {
        const builder = new ConfigurationBuilder();
        builder.task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true);
        testConfiguration({
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
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            isShellCommand: true
        }, builder);
    });
    test('tasks: global show output silent', () => {
        const builder = new ConfigurationBuilder();
        builder.
            task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            presentation().reveal(Tasks.RevealKind.Silent);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            showOutput: 'silent'
        }, builder);
    });
    test('tasks: global promptOnClose default', () => {
        const builder = new ConfigurationBuilder();
        builder.task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            promptOnClose: true
        }, builder);
    });
    test('tasks: global promptOnClose', () => {
        const builder = new ConfigurationBuilder();
        builder.task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            promptOnClose(false).
            command().suppressTaskName(true);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            promptOnClose: false
        }, builder);
    });
    test('tasks: global promptOnClose default watching', () => {
        const builder = new ConfigurationBuilder();
        builder.task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            isBackground(true).
            promptOnClose(false).
            command().suppressTaskName(true);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            isWatching: true
        }, builder);
    });
    test('tasks: global show output never', () => {
        const builder = new ConfigurationBuilder();
        builder.
            task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            presentation().reveal(Tasks.RevealKind.Never);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            showOutput: 'never'
        }, builder);
    });
    test('tasks: global echo Command', () => {
        const builder = new ConfigurationBuilder();
        builder.
            task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            presentation().
            echo(true);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            echoCommand: true
        }, builder);
    });
    test('tasks: global args', () => {
        const builder = new ConfigurationBuilder();
        builder.
            task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            args(['--p']);
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            args: [
                '--p'
            ]
        }, builder);
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
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            options: {
                cwd: 'myPath'
            }
        }, builder);
    });
    test('tasks: options - env', () => {
        const builder = new ConfigurationBuilder();
        builder.
            task('tsc', 'tsc').
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            options({ cwd: '${workspaceFolder}', env: { key: 'value' } });
        testConfiguration({
            version: '0.1.0',
            command: 'tsc',
            options: {
                env: {
                    key: 'value'
                }
            }
        }, builder);
    });
    test('tasks: os windows', () => {
        const name = Platform.isWindows ? 'tsc.win' : 'tsc';
        const builder = new ConfigurationBuilder();
        builder.
            task(name, name).
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true);
        const external = {
            version: '0.1.0',
            command: 'tsc',
            windows: {
                command: 'tsc.win'
            }
        };
        testConfiguration(external, builder);
    });
    test('tasks: os windows & global isShellCommand', () => {
        const name = Platform.isWindows ? 'tsc.win' : 'tsc';
        const builder = new ConfigurationBuilder();
        builder.
            task(name, name).
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true).
            runtime(Tasks.RuntimeType.Shell);
        const external = {
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
        const name = Platform.isMacintosh ? 'tsc.osx' : 'tsc';
        const builder = new ConfigurationBuilder();
        builder.
            task(name, name).
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true);
        const external = {
            version: '0.1.0',
            command: 'tsc',
            osx: {
                command: 'tsc.osx'
            }
        };
        testConfiguration(external, builder);
    });
    test('tasks: os linux', () => {
        const name = Platform.isLinux ? 'tsc.linux' : 'tsc';
        const builder = new ConfigurationBuilder();
        builder.
            task(name, name).
            group(Tasks.TaskGroup.Build).
            command().suppressTaskName(true);
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            problemMatcher: '$msCompile'
        };
        testDefaultProblemMatcher(external, 1);
    });
    test('tasks: global problemMatcher two', () => {
        const external = {
            version: '0.1.0',
            command: 'tsc',
            problemMatcher: ['$eslint-compact', '$msCompile']
        };
        testDefaultProblemMatcher(external, 2);
    });
    test('tasks: task definition', () => {
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            tasks: [
                {
                    taskName: 'taskName',
                    isBuildCommand: true
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskName', 'tsc').group(Tasks.TaskGroup.Build).command().args(['$name']);
        testConfiguration(external, builder);
    });
    test('tasks: default build task', () => {
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            tasks: [
                {
                    taskName: 'taskName',
                    isTestCommand: true
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskName', 'tsc').group(Tasks.TaskGroup.Test).command().args(['$name']);
        testConfiguration(external, builder);
    });
    test('tasks: default test task', () => {
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            tasks: [
                {
                    taskName: 'test',
                    showOutput: 'never',
                    echoCommand: true,
                    args: ['--p'],
                    isWatching: true
                }
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
            filePrefix(undefined).
            pattern(/abc/);
        testConfiguration(external, builder);
    });
    test('tasks: problem matcher fileLocation and filePrefix', () => {
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            tasks: [
                {
                    taskName: 'taskName',
                    isWatching: true
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskName', 'tsc').
            isBackground(true).promptOnClose(false).
            command().args(['$name']);
        testConfiguration(external, builder);
    });
    test('tasks: prompt on close set', () => {
        const external = {
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
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            suppressTaskName: false,
            tasks: [
                {
                    taskName: 'taskName',
                    suppressTaskName: true
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskName', 'tsc').
            command().suppressTaskName(true);
        testConfiguration(external, builder);
    });
    test('tasks: suppress task name inherit', () => {
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskNameOne', 'tsc').command().suppressTaskName(true).
            runtime(Tasks.RuntimeType.Shell).args(['arg']).options({ cwd: 'cwd', env: { env: 'env' } });
        testConfiguration(external, builder);
    });
    test('tasks: with command os specific', () => {
        const name = Platform.isWindows ? 'tsc.win' : 'tsc';
        const external = {
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
        const args = Platform.isWindows ? ['arg1', 'arg2'] : ['arg1'];
        const external = {
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
        const args = Platform.isLinux ? ['arg1', 'arg2'] : ['arg1'];
        const external = {
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
        const external = {
            version: '0.1.0',
            command: 'tsc',
            tasks: [
                {
                    taskName: 'taskNameOne',
                    isShellCommand: true,
                }
            ]
        };
        const builder = new ConfigurationBuilder();
        builder.task('taskNameOne', 'tsc').command().runtime(Tasks.RuntimeType.Shell).args(['$name']);
        testConfiguration(external, builder);
    });
    test('tasks: global and tasks args', () => {
        const external = {
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
        const external = {
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
    ensureNoDisposablesAreLeakedInTestSuite();
    test.skip('Build workspace task', () => {
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        const external = {
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
        }
        else if (Platform.isLinux) {
            builder.task('echo', 'echo').
                command().suppressTaskName(true).args(['linux']).
                runtime(Tasks.RuntimeType.Shell).
                presentation().echo(true);
            testConfiguration(external, builder);
        }
        else if (Platform.isMacintosh) {
            builder.task('echo', 'echo').
                command().suppressTaskName(true).args(['osx']).
                runtime(Tasks.RuntimeType.Shell).
                presentation().echo(true);
            testConfiguration(external, builder);
        }
    });
});
suite('Bugs / regression tests', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    (Platform.isLinux ? test.skip : test)('Bug 19548', () => {
        const external = {
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
                    }
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
                    }
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
        }
        else if (Platform.isMacintosh) {
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
class TestNamedProblemMatcher {
}
class TestParseContext {
}
class TestTaskDefinitionRegistry {
    get(key) {
        return this._task;
    }
    set(task) {
        this._task = task;
    }
}
suite('Task configuration conversions', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const globals = {};
    const taskConfigSource = {};
    const TaskDefinitionRegistry = new TestTaskDefinitionRegistry();
    let instantiationService;
    let parseContext;
    let namedProblemMatcher;
    let problemReporter;
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
            assert.deepEqual(result.value, [{ 'label': 'real label' }]);
        });
        test('returns config for a known problem matcher including applyTo', () => {
            namedProblemMatcher.applyTo = ApplyToKind.closedDocuments;
            const result = (ProblemMatcherConverter.from('$real', parseContext));
            assert.strictEqual(result.errors?.length, 0);
            assert.deepEqual(result.value, [{ 'label': 'real label', 'applyTo': ApplyToKind.closedDocuments }]);
        });
    });
    suite('TaskParser.from', () => {
        suite('CustomTask', () => {
            suite('incomplete config reports an appropriate error for missing', () => {
                test('name', () => {
                    const result = TaskParser.from([{}], globals, parseContext, taskConfigSource);
                    assertTaskParseResult(result, undefined, problemReporter, 'Error: a task must provide a label property');
                });
                test('command', () => {
                    const result = TaskParser.from([{ taskName: 'task' }], globals, parseContext, taskConfigSource);
                    assertTaskParseResult(result, undefined, problemReporter, `Error: the task 'task' doesn't define a command`);
                });
            });
            test('returns expected result', () => {
                const expected = [
                    { taskName: 'task', command: 'echo test' },
                    { taskName: 'task 2', command: 'echo test' }
                ];
                const result = TaskParser.from(expected, globals, parseContext, taskConfigSource);
                assertTaskParseResult(result, { custom: expected }, problemReporter, undefined);
            });
        });
        suite('ConfiguredTask', () => {
            test('returns expected result', () => {
                const expected = [{ taskName: 'task', command: 'echo test', type: 'any', label: 'task' }, { taskName: 'task 2', command: 'echo test', type: 'any', label: 'task 2' }];
                TaskDefinitionRegistry.set({ extensionId: 'registered', taskType: 'any', properties: {} });
                const result = TaskParser.from(expected, globals, parseContext, taskConfigSource, TaskDefinitionRegistry);
                assertTaskParseResult(result, { configured: expected }, problemReporter, undefined);
            });
        });
    });
});
function assertTaskParseResult(actual, expected, problemReporter, expectedMessage) {
    if (expectedMessage === undefined) {
        assert.strictEqual(problemReporter.lastMessage, undefined);
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0NvbmZpZ3VyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL3Rlc3QvY29tbW9uL3Rhc2tDb25maWd1cmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLFFBQVEsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBRTNELE9BQU8sS0FBSyxLQUFLLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFFBQVEsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQWtCLGdCQUFnQixFQUFtQixXQUFXLEVBQXdCLE1BQU0sZ0NBQWdDLENBQUM7QUFDdEksT0FBTyxFQUFFLGVBQWUsRUFBYyxNQUFNLHVEQUF1RCxDQUFDO0FBRXBHLE9BQU8sS0FBSyxLQUFLLE1BQU0sdUJBQXVCLENBQUM7QUFDL0MsT0FBTyxFQUFFLEtBQUssRUFBaUYsZ0JBQWdCLEVBQWlCLHVCQUF1QixFQUE4QixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcFAsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFFaEgsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzNGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRXpILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1B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