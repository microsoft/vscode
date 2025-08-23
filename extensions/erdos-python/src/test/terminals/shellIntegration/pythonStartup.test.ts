// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import {
    GlobalEnvironmentVariableCollection,
    Uri,
    WorkspaceConfiguration,
    Disposable,
    CancellationToken,
    TerminalLinkContext,
    Terminal,
    EventEmitter,
    workspace,
} from 'vscode';
import { assert } from 'chai';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import { registerPythonStartup } from '../../../client/terminals/pythonStartup';
import { IExtensionContext } from '../../../client/common/types';
import * as pythonStartupLinkProvider from '../../../client/terminals/pythonStartupLinkProvider';
import { CustomTerminalLinkProvider } from '../../../client/terminals/pythonStartupLinkProvider';
import { Repl } from '../../../client/common/utils/localize';

suite('Terminal - Shell Integration with PYTHONSTARTUP', () => {
    let getConfigurationStub: sinon.SinonStub;
    let pythonConfig: TypeMoq.IMock<WorkspaceConfiguration>;
    let editorConfig: TypeMoq.IMock<WorkspaceConfiguration>;
    let context: TypeMoq.IMock<IExtensionContext>;
    let createDirectoryStub: sinon.SinonStub;
    let copyStub: sinon.SinonStub;
    let globalEnvironmentVariableCollection: TypeMoq.IMock<GlobalEnvironmentVariableCollection>;

    setup(() => {
        context = TypeMoq.Mock.ofType<IExtensionContext>();
        globalEnvironmentVariableCollection = TypeMoq.Mock.ofType<GlobalEnvironmentVariableCollection>();
        context.setup((c) => c.environmentVariableCollection).returns(() => globalEnvironmentVariableCollection.object);
        context.setup((c) => c.storageUri).returns(() => Uri.parse('a'));
        context.setup((c) => c.subscriptions).returns(() => []);

        globalEnvironmentVariableCollection
            .setup((c) => c.replace(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve());

        globalEnvironmentVariableCollection.setup((c) => c.delete(TypeMoq.It.isAny())).returns(() => Promise.resolve());

        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
        createDirectoryStub = sinon.stub(workspaceApis, 'createDirectory');
        copyStub = sinon.stub(workspaceApis, 'copy');

        pythonConfig = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
        editorConfig = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
        getConfigurationStub.callsFake((section: string) => {
            if (section === 'python') {
                return pythonConfig.object;
            }
            return editorConfig.object;
        });

        createDirectoryStub.callsFake((_) => Promise.resolve());
        copyStub.callsFake((_, __, ___) => Promise.resolve());
    });

    teardown(() => {
        sinon.restore();
    });

    test('Verify createDirectory is called when shell integration is enabled', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);

        await registerPythonStartup(context.object);

        sinon.assert.calledOnce(createDirectoryStub);
    });

    test('Verify createDirectory is not called when shell integration is disabled', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => false);

        await registerPythonStartup(context.object);

        sinon.assert.notCalled(createDirectoryStub);
    });

    test('Verify copy is called when shell integration is enabled', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);

        await registerPythonStartup(context.object);

        sinon.assert.calledOnce(copyStub);
    });

    test('Verify copy is not called when shell integration is disabled', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => false);

        await registerPythonStartup(context.object);

        sinon.assert.notCalled(copyStub);
    });

    test('PYTHONSTARTUP is set when enableShellIntegration setting is true', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);

        await registerPythonStartup(context.object);

        globalEnvironmentVariableCollection.verify(
            (c) => c.replace('PYTHONSTARTUP', TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    test('environmentCollection should not remove PYTHONSTARTUP when enableShellIntegration setting is true', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);

        await registerPythonStartup(context.object);

        globalEnvironmentVariableCollection.verify((c) => c.delete('PYTHONSTARTUP'), TypeMoq.Times.never());
    });

    test('PYTHONSTARTUP is not set when enableShellIntegration setting is false', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => false);

        await registerPythonStartup(context.object);

        globalEnvironmentVariableCollection.verify(
            (c) => c.replace('PYTHONSTARTUP', TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.never(),
        );
    });

    test('PYTHONSTARTUP is deleted when enableShellIntegration setting is false', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => false);

        await registerPythonStartup(context.object);

        globalEnvironmentVariableCollection.verify((c) => c.delete('PYTHONSTARTUP'), TypeMoq.Times.once());
    });

    test('PYTHON_BASIC_REPL is set when shell integration is enabled', async () => {
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);
        await registerPythonStartup(context.object);
        globalEnvironmentVariableCollection.verify(
            (c) => c.replace('PYTHON_BASIC_REPL', '1', TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    test('Ensure registering terminal link calls registerTerminalLinkProvider', async () => {
        const registerTerminalLinkProviderStub = sinon.stub(
            pythonStartupLinkProvider,
            'registerCustomTerminalLinkProvider',
        );
        const disposableArray: Disposable[] = [];
        pythonStartupLinkProvider.registerCustomTerminalLinkProvider(disposableArray);

        sinon.assert.calledOnce(registerTerminalLinkProviderStub);
        sinon.assert.calledWith(registerTerminalLinkProviderStub, disposableArray);

        registerTerminalLinkProviderStub.restore();
    });

    test('Verify onDidChangeConfiguration is called when configuration changes', async () => {
        const onDidChangeConfigurationSpy = sinon.spy(workspace, 'onDidChangeConfiguration');
        pythonConfig.setup((p) => p.get('terminal.shellIntegration.enabled')).returns(() => true);

        await registerPythonStartup(context.object);

        assert.isTrue(onDidChangeConfigurationSpy.calledOnce);
        onDidChangeConfigurationSpy.restore();
    });

    if (process.platform === 'darwin') {
        test('Mac - Verify provideTerminalLinks returns links when context.line contains expectedNativeLink', () => {
            const provider = new CustomTerminalLinkProvider();
            const context: TerminalLinkContext = {
                line: 'Some random string with Cmd click to launch VS Code Native REPL',
                terminal: {} as Terminal,
            };
            const token: CancellationToken = {
                isCancellationRequested: false,
                onCancellationRequested: new EventEmitter<unknown>().event,
            };

            const links = provider.provideTerminalLinks(context, token);

            assert.isNotNull(links, 'Expected links to be not undefined');
            assert.isArray(links, 'Expected links to be an array');
            assert.isNotEmpty(links, 'Expected links to be not empty');

            if (Array.isArray(links)) {
                assert.equal(
                    links[0].command,
                    'python.startNativeREPL',
                    'Expected command to be python.startNativeREPL',
                );
                assert.equal(
                    links[0].startIndex,
                    context.line.indexOf('Cmd click to launch VS Code Native REPL'),
                    'start index should match',
                );
                assert.equal(
                    links[0].length,
                    'Cmd click to launch VS Code Native REPL'.length,
                    'Match expected length',
                );
                assert.equal(
                    links[0].tooltip,
                    Repl.launchNativeRepl,
                    'Expected tooltip to be Launch VS Code Native REPL',
                );
            }
        });
    }
    if (process.platform !== 'darwin') {
        test('Windows/Linux - Verify provideTerminalLinks returns links when context.line contains expectedNativeLink', () => {
            const provider = new CustomTerminalLinkProvider();
            const context: TerminalLinkContext = {
                line: 'Some random string with Ctrl click to launch VS Code Native REPL',
                terminal: {} as Terminal,
            };
            const token: CancellationToken = {
                isCancellationRequested: false,
                onCancellationRequested: new EventEmitter<unknown>().event,
            };

            const links = provider.provideTerminalLinks(context, token);

            assert.isNotNull(links, 'Expected links to be not undefined');
            assert.isArray(links, 'Expected links to be an array');
            assert.isNotEmpty(links, 'Expected links to be not empty');

            if (Array.isArray(links)) {
                assert.equal(
                    links[0].command,
                    'python.startNativeREPL',
                    'Expected command to be python.startNativeREPL',
                );
                assert.equal(
                    links[0].startIndex,
                    context.line.indexOf('Ctrl click to launch VS Code Native REPL'),
                    'start index should match',
                );
                assert.equal(
                    links[0].length,
                    'Ctrl click to launch VS Code Native REPL'.length,
                    'Match expected Length',
                );
                assert.equal(
                    links[0].tooltip,
                    Repl.launchNativeRepl,
                    'Expected tooltip to be Launch VS Code Native REPL',
                );
            }
        });
    }

    test('Verify provideTerminalLinks returns no links when context.line does not contain expectedNativeLink', () => {
        const provider = new CustomTerminalLinkProvider();
        const context: TerminalLinkContext = {
            line: 'Some random string without the expected link',
            terminal: {} as Terminal,
        };
        const token: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: new EventEmitter<unknown>().event,
        };

        const links = provider.provideTerminalLinks(context, token);

        assert.isArray(links, 'Expected links to be an array');
        assert.isEmpty(links, 'Expected links to be empty');
    });
});
