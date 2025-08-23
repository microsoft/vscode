// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { Disposable, Terminal, Uri } from 'vscode';
import { IActiveResourceService, ICommandManager, IWorkspaceService } from '../../client/common/application/types';
import { Commands } from '../../client/common/constants';
import { TerminalEnvVarActivation } from '../../client/common/experiments/groups';
import { TerminalService } from '../../client/common/terminal/service';
import { ITerminalActivator, ITerminalServiceFactory } from '../../client/common/terminal/types';
import {
    IConfigurationService,
    IExperimentService,
    IPythonSettings,
    ITerminalSettings,
} from '../../client/common/types';
import { IServiceContainer } from '../../client/ioc/types';
import { TerminalProvider } from '../../client/providers/terminalProvider';
import * as extapi from '../../client/envExt/api.internal';

suite('Terminal Provider', () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let commandManager: TypeMoq.IMock<ICommandManager>;
    let workspace: TypeMoq.IMock<IWorkspaceService>;
    let activeResourceService: TypeMoq.IMock<IActiveResourceService>;
    let experimentService: TypeMoq.IMock<IExperimentService>;
    let terminalProvider: TerminalProvider;
    let useEnvExtensionStub: sinon.SinonStub;
    const resource = Uri.parse('a');
    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        experimentService = TypeMoq.Mock.ofType<IExperimentService>();
        experimentService.setup((e) => e.inExperimentSync(TerminalEnvVarActivation.experiment)).returns(() => false);
        activeResourceService = TypeMoq.Mock.ofType<IActiveResourceService>();
        workspace = TypeMoq.Mock.ofType<IWorkspaceService>();
        serviceContainer.setup((c) => c.get(IExperimentService)).returns(() => experimentService.object);
        serviceContainer.setup((c) => c.get(ICommandManager)).returns(() => commandManager.object);
        serviceContainer.setup((c) => c.get(IWorkspaceService)).returns(() => workspace.object);
        serviceContainer.setup((c) => c.get(IActiveResourceService)).returns(() => activeResourceService.object);
    });
    teardown(() => {
        sinon.restore();
        try {
            terminalProvider.dispose();
        } catch {
            // No catch clause.
        }
    });

    test('Ensure command is registered', () => {
        terminalProvider = new TerminalProvider(serviceContainer.object);
        commandManager.verify(
            (c) =>
                c.registerCommand(TypeMoq.It.isValue(Commands.Create_Terminal), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    test('Ensure command handler is disposed', () => {
        const disposable = TypeMoq.Mock.ofType<Disposable>();
        commandManager
            .setup((c) =>
                c.registerCommand(TypeMoq.It.isValue(Commands.Create_Terminal), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            )
            .returns(() => disposable.object);

        terminalProvider = new TerminalProvider(serviceContainer.object);
        terminalProvider.dispose();

        disposable.verify((d) => d.dispose(), TypeMoq.Times.once());
    });

    test('Ensure terminal is created and displayed when command is invoked', () => {
        const disposable = TypeMoq.Mock.ofType<Disposable>();
        let commandHandler: undefined | (() => void);
        commandManager
            .setup((c) =>
                c.registerCommand(TypeMoq.It.isValue(Commands.Create_Terminal), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            )
            .returns((_cmd, callback) => {
                commandHandler = callback;
                return disposable.object;
            });
        activeResourceService
            .setup((a) => a.getActiveResource())
            .returns(() => resource)
            .verifiable(TypeMoq.Times.once());
        workspace.setup((w) => w.workspaceFolders).returns(() => undefined);

        terminalProvider = new TerminalProvider(serviceContainer.object);
        expect(commandHandler).not.to.be.equal(undefined, 'Handler not set');

        const terminalServiceFactory = TypeMoq.Mock.ofType<ITerminalServiceFactory>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(ITerminalServiceFactory)))
            .returns(() => terminalServiceFactory.object);
        const terminalService = TypeMoq.Mock.ofType<TerminalService>();
        terminalServiceFactory
            .setup((t) => t.createTerminalService(TypeMoq.It.isValue(resource), TypeMoq.It.isValue('Python')))
            .returns(() => terminalService.object);

        commandHandler!.call(terminalProvider);
        activeResourceService.verifyAll();
        terminalService.verify((t) => t.show(false), TypeMoq.Times.once());
    });

    suite('terminal.activateCurrentTerminal setting', () => {
        let pythonSettings: TypeMoq.IMock<IPythonSettings>;
        let terminalSettings: TypeMoq.IMock<ITerminalSettings>;
        let configService: TypeMoq.IMock<IConfigurationService>;
        let terminalActivator: TypeMoq.IMock<ITerminalActivator>;
        let terminal: TypeMoq.IMock<Terminal>;

        setup(() => {
            configService = TypeMoq.Mock.ofType<IConfigurationService>();
            serviceContainer
                .setup((c) => c.get(TypeMoq.It.isValue(IConfigurationService)))
                .returns(() => configService.object);
            pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
            activeResourceService = TypeMoq.Mock.ofType<IActiveResourceService>();

            terminalSettings = TypeMoq.Mock.ofType<ITerminalSettings>();
            pythonSettings.setup((s) => s.terminal).returns(() => terminalSettings.object);

            terminalActivator = TypeMoq.Mock.ofType<ITerminalActivator>();
            serviceContainer
                .setup((c) => c.get(TypeMoq.It.isValue(ITerminalActivator)))
                .returns(() => terminalActivator.object);
            serviceContainer
                .setup((c) => c.get(TypeMoq.It.isValue(IActiveResourceService)))
                .returns(() => activeResourceService.object);

            terminal = TypeMoq.Mock.ofType<Terminal>();
            terminal.setup((c) => c.creationOptions).returns(() => ({ hideFromUser: false }));
        });

        test('If terminal.activateCurrentTerminal setting is set, provided terminal should be activated', async () => {
            terminalSettings.setup((t) => t.activateEnvInCurrentTerminal).returns(() => true);
            configService
                .setup((c) => c.getSettings(resource))
                .returns(() => pythonSettings.object)
                .verifiable(TypeMoq.Times.once());
            activeResourceService
                .setup((a) => a.getActiveResource())
                .returns(() => resource)
                .verifiable(TypeMoq.Times.once());

            terminalProvider = new TerminalProvider(serviceContainer.object);
            await terminalProvider.initialize(terminal.object);

            terminalActivator.verify(
                (a) => a.activateEnvironmentInTerminal(terminal.object, TypeMoq.It.isAny()),
                TypeMoq.Times.once(),
            );
            configService.verifyAll();
            activeResourceService.verifyAll();
        });

        test('If terminal.activateCurrentTerminal setting is not set, provided terminal should not be activated', async () => {
            terminalSettings.setup((t) => t.activateEnvInCurrentTerminal).returns(() => false);
            configService
                .setup((c) => c.getSettings(resource))
                .returns(() => pythonSettings.object)
                .verifiable(TypeMoq.Times.once());
            activeResourceService
                .setup((a) => a.getActiveResource())
                .returns(() => resource)
                .verifiable(TypeMoq.Times.once());

            terminalProvider = new TerminalProvider(serviceContainer.object);
            await terminalProvider.initialize(terminal.object);

            terminalActivator.verify(
                (a) => a.activateEnvironmentInTerminal(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                TypeMoq.Times.never(),
            );
            activeResourceService.verifyAll();
            configService.verifyAll();
        });

        test('If terminal.activateCurrentTerminal setting is set, but hideFromUser is true, provided terminal should not be activated', async () => {
            terminalSettings.setup((t) => t.activateEnvInCurrentTerminal).returns(() => true);
            configService
                .setup((c) => c.getSettings(resource))
                .returns(() => pythonSettings.object)
                .verifiable(TypeMoq.Times.once());
            activeResourceService
                .setup((a) => a.getActiveResource())
                .returns(() => resource)
                .verifiable(TypeMoq.Times.once());

            terminal.setup((c) => c.creationOptions).returns(() => ({ hideFromUser: true }));

            terminalProvider = new TerminalProvider(serviceContainer.object);
            await terminalProvider.initialize(terminal.object);

            terminalActivator.verify(
                (a) => a.activateEnvironmentInTerminal(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                TypeMoq.Times.never(),
            );
            activeResourceService.verifyAll();
            configService.verifyAll();
        });

        test('terminal.activateCurrentTerminal setting is set but provided terminal is undefined', async () => {
            terminalSettings.setup((t) => t.activateEnvInCurrentTerminal).returns(() => true);
            configService
                .setup((c) => c.getSettings(resource))
                .returns(() => pythonSettings.object)
                .verifiable(TypeMoq.Times.once());
            activeResourceService
                .setup((a) => a.getActiveResource())
                .returns(() => resource)
                .verifiable(TypeMoq.Times.once());

            terminalProvider = new TerminalProvider(serviceContainer.object);
            await terminalProvider.initialize(undefined);

            terminalActivator.verify(
                (a) => a.activateEnvironmentInTerminal(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                TypeMoq.Times.never(),
            );
            activeResourceService.verifyAll();
            configService.verifyAll();
        });

        test('Exceptions are swallowed if initializing terminal provider fails', async () => {
            terminalSettings.setup((t) => t.activateEnvInCurrentTerminal).returns(() => true);
            configService.setup((c) => c.getSettings(resource)).throws(new Error('Kaboom'));
            activeResourceService.setup((a) => a.getActiveResource()).returns(() => resource);

            terminalProvider = new TerminalProvider(serviceContainer.object);
            try {
                await terminalProvider.initialize(undefined);
            } catch (ex) {
                assert.ok(false, `No error should be thrown, ${ex}`);
            }
        });
    });
});
