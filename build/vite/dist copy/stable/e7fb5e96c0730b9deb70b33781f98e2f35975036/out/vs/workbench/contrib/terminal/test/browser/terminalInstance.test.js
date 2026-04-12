/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TitleEventSource } from '../../../../../platform/terminal/common/terminal.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalConfigurationService } from '../../browser/terminalConfigurationService.js';
import { parseExitResult, TerminalInstance, TerminalLabelComputer } from '../../browser/terminalInstance.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { ITerminalProfileResolverService, DEFAULT_COMMANDS_TO_SKIP_SHELL } from '../../common/terminal.js';
import { TestViewDescriptorService } from './xterm/xtermTerminal.test.js';
import { fixPath } from '../../../../services/search/test/browser/queryBuilder.test.js';
import { TestTerminalProfileResolverService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
const root1 = '/foo/root1';
const ROOT_1 = fixPath(root1);
const root2 = '/foo/root2';
const ROOT_2 = fixPath(root2);
class MockTerminalProfileResolverService extends TestTerminalProfileResolverService {
    async getDefaultProfile() {
        return {
            profileName: 'my-sh',
            path: '/usr/bin/zsh',
            env: {
                TEST: 'TEST',
            },
            isDefault: true,
            isUnsafePath: false,
            isFromPath: true,
            icon: {
                id: 'terminal-linux',
            },
            color: 'terminal.ansiYellow',
        };
    }
}
const terminalShellTypeContextKey = {
    set: () => { },
    reset: () => { },
    get: () => undefined
};
class TestTerminalChildProcess extends Disposable {
    get capabilities() { return []; }
    constructor(shouldPersist) {
        super();
        this.shouldPersist = shouldPersist;
        this.id = 0;
        this.onDidChangeProperty = Event.None;
        this.onProcessData = Event.None;
        this.onProcessExit = Event.None;
        this.onProcessReady = Event.None;
        this.onProcessTitleChanged = Event.None;
        this.onProcessShellTypeChanged = Event.None;
    }
    updateProperty(property, value) {
        throw new Error('Method not implemented.');
    }
    async start() { return undefined; }
    shutdown(immediate) { }
    input(data) { }
    sendSignal(signal) { }
    resize(cols, rows) { }
    clearBuffer() { }
    acknowledgeDataEvent(charCount) { }
    async setUnicodeVersion(version) { }
    async getInitialCwd() { return ''; }
    async getCwd() { return ''; }
    async processBinary(data) { }
    refreshProperty(property) { return Promise.resolve(''); }
}
class TestTerminalInstanceService extends Disposable {
    async getBackend() {
        return {
            onPtyHostExit: Event.None,
            onPtyHostUnresponsive: Event.None,
            onPtyHostResponsive: Event.None,
            onPtyHostRestart: Event.None,
            onDidMoveWindowInstance: Event.None,
            onDidRequestDetach: Event.None,
            createProcess: async (shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) => this._register(new TestTerminalChildProcess(shouldPersist)),
            getLatency: () => Promise.resolve([])
        };
    }
}
suite('Workbench - TerminalInstance', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('TerminalInstance', () => {
        let terminalInstance;
        async function createTerminalInstance() {
            const instantiationService = workbenchInstantiationService({
                configurationService: () => new TestConfigurationService({
                    files: {},
                    terminal: {
                        integrated: {
                            fontFamily: 'monospace',
                            scrollback: 1000,
                            fastScrollSensitivity: 2,
                            mouseWheelScrollSensitivity: 1,
                            unicodeVersion: '6',
                            commandsToSkipShell: [],
                            shellIntegration: {
                                enabled: true
                            }
                        }
                    },
                })
            }, store);
            instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
            instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
            instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
            instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
            instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } });
            const instance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));
            await instance.xtermReadyPromise;
            return instance;
        }
        test('should create an instance of TerminalInstance with env from default profile', async () => {
            terminalInstance = await createTerminalInstance();
            // Wait for the terminal instance to resolve shell launch config env.
            await new Promise(resolve => setTimeout(resolve, 100));
            deepStrictEqual(terminalInstance.shellLaunchConfig.env, { TEST: 'TEST' });
        });
        test('should preserve title for task terminals', async () => {
            const instantiationService = workbenchInstantiationService({
                configurationService: () => new TestConfigurationService({
                    files: {},
                    terminal: {
                        integrated: {
                            fontFamily: 'monospace',
                            scrollback: 1000,
                            fastScrollSensitivity: 2,
                            mouseWheelScrollSensitivity: 1,
                            unicodeVersion: '6',
                            shellIntegration: {
                                enabled: true
                            }
                        }
                    },
                })
            }, store);
            instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
            instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
            instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
            instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
            instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } });
            const taskTerminal = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {
                type: 'Task',
                name: 'Test Task Name'
            }));
            // Simulate setting the title via API (as the task system would do)
            await taskTerminal.rename('Test Task Name');
            strictEqual(taskTerminal.title, 'Test Task Name');
            // Simulate a process title change (which happens when task completes)
            await taskTerminal.rename('some-process-name', TitleEventSource.Process);
            // Verify that the task name is preserved
            strictEqual(taskTerminal.title, 'Test Task Name', 'Task terminal should preserve API-set title');
        });
        test('custom key event handler should handle commands in DEFAULT_COMMANDS_TO_SKIP_SHELL in VS Code and not xterm when sendKeybindingsToShell is disabled', async () => {
            const instance = await createTerminalInstance();
            const keybindingService = instance['_keybindingService'];
            const originalSoftDispatch = keybindingService.softDispatch;
            keybindingService.softDispatch = () => ({ kind: 2 /* ResultKind.KbFound */, commandId: 'workbench.action.zoomIn', commandArgs: undefined, isBubble: false });
            let capturedHandler;
            instance.xterm.raw.attachCustomKeyEventHandler = handler => { capturedHandler = handler; };
            const container = document.createElement('div');
            document.body.appendChild(container);
            instance.attachToElement(container);
            instance.setVisible(true);
            const event = new KeyboardEvent('keydown', { key: '=', cancelable: true });
            try {
                deepStrictEqual({ result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented }, { result: false, defaultPrevented: true });
            }
            finally {
                keybindingService.softDispatch = originalSoftDispatch;
                container.remove();
            }
        });
        test('custom key event handler should intercept Meta-modified keys that resolve to a command when sendKeybindingsToShell is disabled', async () => {
            const instance = await createTerminalInstance();
            const keybindingService = instance['_keybindingService'];
            const originalSoftDispatch = keybindingService.softDispatch;
            strictEqual(DEFAULT_COMMANDS_TO_SKIP_SHELL.includes('test.metaKeyInterceptCommand'), false);
            keybindingService.softDispatch = () => ({ kind: 2 /* ResultKind.KbFound */, commandId: 'test.metaKeyInterceptCommand', commandArgs: undefined, isBubble: false });
            let capturedHandler;
            instance.xterm.raw.attachCustomKeyEventHandler = handler => { capturedHandler = handler; };
            const container = document.createElement('div');
            document.body.appendChild(container);
            instance.attachToElement(container);
            instance.setVisible(true);
            const event = new KeyboardEvent('keydown', { key: '=', metaKey: true, cancelable: true });
            try {
                deepStrictEqual({ result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented }, { result: false, defaultPrevented: true });
            }
            finally {
                keybindingService.softDispatch = originalSoftDispatch;
                container.remove();
            }
        });
    });
    suite('DEFAULT_COMMANDS_TO_SKIP_SHELL', () => {
        test('should include zoom commands so they are not consumed by kitty keyboard protocol', () => {
            deepStrictEqual(['workbench.action.zoomIn', 'workbench.action.zoomOut', 'workbench.action.zoomReset'].every(cmd => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(cmd)), true);
        });
    });
    suite('parseExitResult', () => {
        test('should return no message for exit code = undefined', () => {
            deepStrictEqual(parseExitResult(undefined, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: undefined, message: undefined });
            deepStrictEqual(parseExitResult(undefined, {}, 5 /* ProcessState.KilledByUser */, undefined), { code: undefined, message: undefined });
            deepStrictEqual(parseExitResult(undefined, {}, 6 /* ProcessState.KilledByProcess */, undefined), { code: undefined, message: undefined });
        });
        test('should return no message for exit code = 0', () => {
            deepStrictEqual(parseExitResult(0, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 0, message: undefined });
            deepStrictEqual(parseExitResult(0, {}, 5 /* ProcessState.KilledByUser */, undefined), { code: 0, message: undefined });
            deepStrictEqual(parseExitResult(0, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 0, message: undefined });
        });
        test('should return friendly message when executable is specified for non-zero exit codes', () => {
            deepStrictEqual(parseExitResult(1, { executable: 'foo' }, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 1, message: 'The terminal process "foo" failed to launch (exit code: 1).' });
            deepStrictEqual(parseExitResult(1, { executable: 'foo' }, 5 /* ProcessState.KilledByUser */, undefined), { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' });
            deepStrictEqual(parseExitResult(1, { executable: 'foo' }, 6 /* ProcessState.KilledByProcess */, undefined), { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' });
        });
        test('should return friendly message when executable and args are specified for non-zero exit codes', () => {
            deepStrictEqual(parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 1, message: `The terminal process "foo 'bar', 'baz'" failed to launch (exit code: 1).` });
            deepStrictEqual(parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, 5 /* ProcessState.KilledByUser */, undefined), { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` });
            deepStrictEqual(parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, 6 /* ProcessState.KilledByProcess */, undefined), { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` });
        });
        test('should return friendly message when executable and arguments are omitted for non-zero exit codes', () => {
            deepStrictEqual(parseExitResult(1, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 1, message: `The terminal process failed to launch (exit code: 1).` });
            deepStrictEqual(parseExitResult(1, {}, 5 /* ProcessState.KilledByUser */, undefined), { code: 1, message: `The terminal process terminated with exit code: 1.` });
            deepStrictEqual(parseExitResult(1, {}, 6 /* ProcessState.KilledByProcess */, undefined), { code: 1, message: `The terminal process terminated with exit code: 1.` });
        });
        test('should ignore pty host-related errors', () => {
            deepStrictEqual(parseExitResult({ message: 'Could not find pty with id 16' }, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: undefined, message: undefined });
        });
        test('should format conpty failure code 5', () => {
            deepStrictEqual(parseExitResult({ code: 5, message: 'A native exception occurred during launch (Cannot create process, error code: 5)' }, { executable: 'foo' }, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 5, message: `The terminal process failed to launch: Access was denied to the path containing your executable "foo". Manage and change your permissions to get this to work.` });
        });
        test('should format conpty failure code 267', () => {
            deepStrictEqual(parseExitResult({ code: 267, message: 'A native exception occurred during launch (Cannot create process, error code: 267)' }, {}, 4 /* ProcessState.KilledDuringLaunch */, '/foo'), { code: 267, message: `The terminal process failed to launch: Invalid starting directory "/foo", review your terminal.integrated.cwd setting.` });
        });
        test('should format conpty failure code 1260', () => {
            deepStrictEqual(parseExitResult({ code: 1260, message: 'A native exception occurred during launch (Cannot create process, error code: 1260)' }, { executable: 'foo' }, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 1260, message: `The terminal process failed to launch: Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator.` });
        });
        test('should format conpty launch failure', () => {
            deepStrictEqual(parseExitResult({ message: 'A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the `terminal.integrated.windowsUseConptyDll` setting.' }, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: undefined, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the \`terminal.integrated.windowsUseConptyDll\` setting..` });
        });
        test('should format generic failures', () => {
            deepStrictEqual(parseExitResult({ code: 123, message: 'A native exception occurred during launch (Cannot create process, error code: 123)' }, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 123, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot create process, error code: 123).` });
            deepStrictEqual(parseExitResult({ code: 123, message: 'foo' }, {}, 4 /* ProcessState.KilledDuringLaunch */, undefined), { code: 123, message: `The terminal process failed to launch: foo.` });
        });
    });
    suite('TerminalLabelComputer', () => {
        let instantiationService;
        let capabilities;
        function createInstance(partial) {
            const capabilities = store.add(new TerminalCapabilityStore());
            if (!isWindows) {
                capabilities.add(1 /* TerminalCapability.NaiveCwdDetection */, null);
            }
            return {
                shellLaunchConfig: {},
                shellType: "pwsh" /* GeneralShellType.PowerShell */,
                cwd: 'cwd',
                initialCwd: undefined,
                processName: '',
                sequence: undefined,
                workspaceFolder: undefined,
                staticTitle: undefined,
                capabilities,
                title: '',
                description: '',
                userHome: undefined,
                ...partial
            };
        }
        setup(async () => {
            instantiationService = workbenchInstantiationService(undefined, store);
            capabilities = store.add(new TerminalCapabilityStore());
            if (!isWindows) {
                capabilities.add(1 /* TerminalCapability.NaiveCwdDetection */, null);
            }
        });
        function createLabelComputer(configuration) {
            instantiationService.set(IConfigurationService, new TestConfigurationService(configuration));
            instantiationService.set(ITerminalConfigurationService, store.add(instantiationService.createInstance(TerminalConfigurationService)));
            return store.add(instantiationService.createInstance(TerminalLabelComputer));
        }
        test('should resolve to "" when the template variables are empty', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '', description: '' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: '' }));
            // TODO:
            // terminalLabelComputer.onLabelChanged(e => {
            // 	strictEqual(e.title, '');
            // 	strictEqual(e.description, '');
            // });
            strictEqual(terminalLabelComputer.title, '');
            strictEqual(terminalLabelComputer.description, '');
        });
        test('should resolve cwd', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${cwd}', description: '${cwd}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: ROOT_1 }));
            strictEqual(terminalLabelComputer.title, ROOT_1);
            strictEqual(terminalLabelComputer.description, ROOT_1);
        });
        test('should resolve workspaceFolder', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${workspaceFolder}', description: '${workspaceFolder}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) } }));
            strictEqual(terminalLabelComputer.title, 'folder');
            strictEqual(terminalLabelComputer.description, 'folder');
        });
        test('should resolve local', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${local}', description: '${local}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Local' } }));
            strictEqual(terminalLabelComputer.title, 'Local');
            strictEqual(terminalLabelComputer.description, 'Local');
        });
        test('should resolve process', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${process}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh' }));
            strictEqual(terminalLabelComputer.title, 'zsh');
            strictEqual(terminalLabelComputer.description, 'zsh');
        });
        test('should resolve sequence', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${sequence}', description: '${sequence}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: 'sequence' }));
            strictEqual(terminalLabelComputer.title, 'sequence');
            strictEqual(terminalLabelComputer.description, 'sequence');
        });
        test('should resolve task', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${task}', description: '${task}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
            strictEqual(terminalLabelComputer.title, 'zsh ~ Task');
            strictEqual(terminalLabelComputer.description, 'Task');
        });
        test('should resolve separator', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${separator}', description: '${separator}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
            strictEqual(terminalLabelComputer.title, 'zsh');
            strictEqual(terminalLabelComputer.description, '');
        });
        test('should always return static title when specified', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}', description: '${workspaceFolder}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) }, staticTitle: 'my-title' }));
            strictEqual(terminalLabelComputer.title, 'my-title');
            strictEqual(terminalLabelComputer.description, 'folder');
        });
        test('should use shellLaunchConfig.titleTemplate as template when set', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${cwd}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: 'my-sequence', processName: 'zsh', shellLaunchConfig: { titleTemplate: '${sequence}' } }));
            strictEqual(terminalLabelComputer.title, 'my-sequence');
            strictEqual(terminalLabelComputer.description, 'cwd');
        });
        test('should provide cwdFolder for all cwds only when in multi-root', () => {
            const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
            // single-root, cwd is same as root
            strictEqual(terminalLabelComputer.title, 'process');
            strictEqual(terminalLabelComputer.description, '');
            // multi-root
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
            if (isWindows) {
                strictEqual(terminalLabelComputer.title, 'process');
                strictEqual(terminalLabelComputer.description, '');
            }
            else {
                strictEqual(terminalLabelComputer.title, 'process ~ root2');
                strictEqual(terminalLabelComputer.description, 'root2');
            }
        });
        test('should hide cwdFolder in single folder workspaces when cwd matches the workspace\'s default cwd even when slashes differ', async () => {
            let terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
            terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
            strictEqual(terminalLabelComputer.title, 'process');
            strictEqual(terminalLabelComputer.description, '');
            if (!isWindows) {
                terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
                terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
                strictEqual(terminalLabelComputer.title, 'process ~ root2');
                strictEqual(terminalLabelComputer.description, 'root2');
            }
        });
    });
    suite('getCwdResource', () => {
        let mockFileService;
        let mockPathService;
        function createMockTerminalInstance(options) {
            const capabilities = store.add(new TerminalCapabilityStore());
            if (options.cwd) {
                const mockCwdDetection = {
                    getCwd: () => options.cwd
                };
                capabilities.add(0 /* TerminalCapability.CwdDetection */, mockCwdDetection);
            }
            // Mock file service
            mockFileService = {
                exists: async (resource) => options.fileExists !== false
            };
            // Mock path service
            mockPathService = {
                fileURI: async (path) => {
                    if (options.remoteAuthority) {
                        return URI.parse(`vscode-remote://${options.remoteAuthority}${path}`);
                    }
                    return URI.file(path);
                }
            };
            return {
                capabilities,
                remoteAuthority: options.remoteAuthority,
                async getCwdResource() {
                    const cwd = this.capabilities.get(0 /* TerminalCapability.CwdDetection */)?.getCwd();
                    if (!cwd) {
                        return undefined;
                    }
                    let resource;
                    if (this.remoteAuthority) {
                        resource = await mockPathService.fileURI(cwd);
                    }
                    else {
                        resource = URI.file(cwd);
                    }
                    if (await mockFileService.exists(resource)) {
                        return resource;
                    }
                    return undefined;
                }
            };
        }
        test('should return undefined when no CwdDetection capability', async () => {
            const instance = createMockTerminalInstance({});
            const result = await instance.getCwdResource();
            strictEqual(result, undefined);
        });
        test('should return undefined when CwdDetection capability returns no cwd', async () => {
            const instance = createMockTerminalInstance({ cwd: undefined });
            const result = await instance.getCwdResource();
            strictEqual(result, undefined);
        });
        test('should return URI.file for local terminal when file exists', async () => {
            const testCwd = '/test/path';
            const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
            const result = await instance.getCwdResource();
            strictEqual(result?.scheme, 'file');
            strictEqual(result?.path, testCwd);
        });
        test('should return undefined when file does not exist', async () => {
            const testCwd = '/test/nonexistent';
            const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: false });
            const result = await instance.getCwdResource();
            strictEqual(result, undefined);
        });
        test('should use pathService.fileURI for remote terminal', async () => {
            const testCwd = '/test/remote/path';
            const instance = createMockTerminalInstance({
                cwd: testCwd,
                remoteAuthority: 'test-remote',
                fileExists: true
            });
            const result = await instance.getCwdResource();
            strictEqual(result?.scheme, 'vscode-remote');
            strictEqual(result?.authority, 'test-remote');
            strictEqual(result?.path, testCwd);
        });
        test('should handle Windows paths correctly', async () => {
            const testCwd = isWindows ? 'C:\\test\\path' : '/test/path';
            const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
            const result = await instance.getCwdResource();
            strictEqual(result?.scheme, 'file');
            if (isWindows) {
                strictEqual(result?.path, '/C:/test/path');
            }
            else {
                strictEqual(result?.path, testCwd);
            }
        });
        test('should handle empty cwd string', async () => {
            const instance = createMockTerminalInstance({ cwd: '' });
            const result = await instance.getCwdResource();
            strictEqual(result, undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJbnN0YW5jZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL3Rlcm1pbmFsSW5zdGFuY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUE0QixNQUFNLHdDQUF3QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUl6SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRkFBaUYsQ0FBQztBQUMxSCxPQUFPLEVBQTZELGdCQUFnQixFQUFnRixNQUFNLHFEQUFxRCxDQUFDO0FBRWhPLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3JFLE9BQU8sRUFBRSw2QkFBNkIsRUFBcUIsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6SSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFF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