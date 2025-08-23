// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert, expect } from 'chai';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import { Uri } from 'vscode';
import { IApplicationShell } from '../../../client/common/application/types';
import { InstallationChannelManager } from '../../../client/common/installer/channelManager';
import { IModuleInstaller } from '../../../client/common/installer/types';
import { IPlatformService } from '../../../client/common/platform/types';
import { Product } from '../../../client/common/types';
import { Installer } from '../../../client/common/utils/localize';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import { EnvironmentType } from '../../../client/pythonEnvironments/info';

suite('InstallationChannelManager - getInstallationChannel()', () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let appShell: TypeMoq.IMock<IApplicationShell>;

    let getInstallationChannels: sinon.SinonStub<any>;

    let showNoInstallersMessage: sinon.SinonStub<any>;
    const resource = Uri.parse('a');
    let installChannelManager: InstallationChannelManager;

    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        serviceContainer.setup((s) => s.get<IApplicationShell>(IApplicationShell)).returns(() => appShell.object);
    });

    teardown(() => {
        sinon.restore();
    });

    test('If there is exactly one installation channel, return it', async () => {
        const moduleInstaller = TypeMoq.Mock.ofType<IModuleInstaller>();
        moduleInstaller.setup((m) => m.name).returns(() => 'singleChannel');
        moduleInstaller.setup((m) => (m as any).then).returns(() => undefined);
        getInstallationChannels = sinon.stub(InstallationChannelManager.prototype, 'getInstallationChannels');
        getInstallationChannels.resolves([moduleInstaller.object]);
        showNoInstallersMessage = sinon.stub(InstallationChannelManager.prototype, 'showNoInstallersMessage');
        showNoInstallersMessage.resolves();
        installChannelManager = new InstallationChannelManager(serviceContainer.object);

        const channel = await installChannelManager.getInstallationChannel(undefined as any, resource);
        expect(channel).to.not.equal(undefined, 'Channel should be set');
        expect(channel!.name).to.equal('singleChannel');
    });

    test('If no channels are returned by the resource, show no installer message and return', async () => {
        getInstallationChannels = sinon.stub(InstallationChannelManager.prototype, 'getInstallationChannels');
        getInstallationChannels.resolves([]);
        showNoInstallersMessage = sinon.stub(InstallationChannelManager.prototype, 'showNoInstallersMessage');
        showNoInstallersMessage.resolves();
        installChannelManager = new InstallationChannelManager(serviceContainer.object);

        const channel = await installChannelManager.getInstallationChannel(Product.pytest, resource);
        expect(channel).to.equal(undefined, 'should be undefined');
        assert.ok(showNoInstallersMessage.calledOnceWith(resource));
    });

    test('If no channel is selected in the quickpick, return undefined', async () => {
        const moduleInstaller1 = TypeMoq.Mock.ofType<IModuleInstaller>();
        moduleInstaller1.setup((m) => m.displayName).returns(() => 'moduleInstaller1');
        moduleInstaller1.setup((m) => (m as any).then).returns(() => undefined);
        const moduleInstaller2 = TypeMoq.Mock.ofType<IModuleInstaller>();
        moduleInstaller2.setup((m) => m.displayName).returns(() => 'moduleInstaller2');
        moduleInstaller2.setup((m) => (m as any).then).returns(() => undefined);
        appShell
            .setup((a) => a.showQuickPick(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(undefined))
            .verifiable(TypeMoq.Times.once());
        getInstallationChannels = sinon.stub(InstallationChannelManager.prototype, 'getInstallationChannels');
        getInstallationChannels.resolves([moduleInstaller1.object, moduleInstaller2.object]);
        showNoInstallersMessage = sinon.stub(InstallationChannelManager.prototype, 'showNoInstallersMessage');
        showNoInstallersMessage.resolves();
        installChannelManager = new InstallationChannelManager(serviceContainer.object);

        const channel = await installChannelManager.getInstallationChannel(Product.pytest, resource);
        assert.ok(showNoInstallersMessage.notCalled);
        appShell.verifyAll();
        expect(channel).to.equal(undefined, 'Channel should not be set');
    });

    test('If multiple channels are returned by the resource, show quick pick of the channel names and return the selected channel installer', async () => {
        const moduleInstaller1 = TypeMoq.Mock.ofType<IModuleInstaller>();
        moduleInstaller1.setup((m) => m.displayName).returns(() => 'moduleInstaller1');
        moduleInstaller1.setup((m) => (m as any).then).returns(() => undefined);
        const moduleInstaller2 = TypeMoq.Mock.ofType<IModuleInstaller>();
        moduleInstaller2.setup((m) => m.displayName).returns(() => 'moduleInstaller2');
        moduleInstaller2.setup((m) => (m as any).then).returns(() => undefined);
        const selection = {
            label: 'some label',
            description: '',
            installer: moduleInstaller2.object,
        };
        appShell
            .setup((a) => a.showQuickPick<typeof selection>(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(selection))
            .verifiable(TypeMoq.Times.once());
        getInstallationChannels = sinon.stub(InstallationChannelManager.prototype, 'getInstallationChannels');
        getInstallationChannels.resolves([moduleInstaller1.object, moduleInstaller2.object]);
        showNoInstallersMessage = sinon.stub(InstallationChannelManager.prototype, 'showNoInstallersMessage');
        showNoInstallersMessage.resolves();
        installChannelManager = new InstallationChannelManager(serviceContainer.object);

        const channel = await installChannelManager.getInstallationChannel(Product.pytest, resource);
        assert.ok(showNoInstallersMessage.notCalled);
        appShell.verifyAll();
        expect(channel).to.not.equal(undefined, 'Channel should be set');
        expect(channel!.displayName).to.equal('moduleInstaller2');
    });
});

suite('InstallationChannelManager - getInstallationChannels()', () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    const resource = Uri.parse('a');
    let installChannelManager: InstallationChannelManager;

    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
    });

    test('If no installers are returned by serviceContainer, return an empty list', async () => {
        serviceContainer.setup((s) => s.getAll<IModuleInstaller>(IModuleInstaller)).returns(() => []);
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        const channel = await installChannelManager.getInstallationChannels(resource);
        assert.deepEqual(channel, []);
    });

    test('Return highest priority supported installers', async () => {
        const moduleInstallers: IModuleInstaller[] = [];
        // Setup 2 installers with priority 1, where one is supported and other is not
        for (let i = 0; i < 2; i = i + 1) {
            const moduleInstaller = TypeMoq.Mock.ofType<IModuleInstaller>();
            moduleInstaller.setup((m) => (m as any).then).returns(() => undefined);
            moduleInstaller.setup((m) => m.priority).returns(() => 1);
            moduleInstaller.setup((m) => m.isSupported(resource)).returns(() => Promise.resolve(i % 2 === 0));
            moduleInstallers.push(moduleInstaller.object);
        }
        // Setup 3 installers with priority 2, where two are supported and other is not
        for (let i = 2; i < 5; i = i + 1) {
            const moduleInstaller = TypeMoq.Mock.ofType<IModuleInstaller>();
            moduleInstaller.setup((m) => (m as any).then).returns(() => undefined);
            moduleInstaller.setup((m) => m.priority).returns(() => 2);
            moduleInstaller.setup((m) => m.isSupported(resource)).returns(() => Promise.resolve(i % 2 === 0));
            moduleInstallers.push(moduleInstaller.object);
        }
        // Setup 2 installers with priority 3, but none are supported
        for (let i = 5; i < 7; i = i + 1) {
            const moduleInstaller = TypeMoq.Mock.ofType<IModuleInstaller>();
            moduleInstaller.setup((m) => (m as any).then).returns(() => undefined);
            moduleInstaller.setup((m) => m.priority).returns(() => 3);
            moduleInstaller.setup((m) => m.isSupported(resource)).returns(() => Promise.resolve(false));
            moduleInstallers.push(moduleInstaller.object);
        }
        serviceContainer.setup((s) => s.getAll<IModuleInstaller>(IModuleInstaller)).returns(() => moduleInstallers);
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        const channels = await installChannelManager.getInstallationChannels(resource);
        // Verify that highest supported priority is 2, so number of installers supported with that priority is 2
        expect(channels.length).to.equal(2);
        for (let i = 0; i < 2; i = i + 1) {
            expect(channels[i].priority).to.equal(2);
        }
    });
});

suite('InstallationChannelManager - showNoInstallersMessage()', () => {
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    const resource = Uri.parse('a');
    let installChannelManager: InstallationChannelManager;

    setup(() => {
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
    });

    test('If no active interpreter is returned, simply return', async () => {
        serviceContainer
            .setup((s) => s.get<IInterpreterService>(IInterpreterService))
            .returns(() => interpreterService.object);
        serviceContainer.setup((s) => s.get<IApplicationShell>(IApplicationShell)).verifiable(TypeMoq.Times.never());
        interpreterService.setup((i) => i.getActiveInterpreter(resource)).returns(() => Promise.resolve(undefined));
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        await installChannelManager.showNoInstallersMessage(resource);
        serviceContainer.verifyAll();
    });

    test('If active interpreter is Conda, show conda prompt', async () => {
        const activeInterpreter = {
            envType: EnvironmentType.Conda,
        };
        const appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        serviceContainer
            .setup((s) => s.get<IInterpreterService>(IInterpreterService))
            .returns(() => interpreterService.object);
        serviceContainer
            .setup((s) => s.get<IApplicationShell>(IApplicationShell))
            .returns(() => appShell.object)
            .verifiable(TypeMoq.Times.once());
        interpreterService
            .setup((i) => i.getActiveInterpreter(resource))

            .returns(() => Promise.resolve(activeInterpreter as any));
        appShell
            .setup((a) => a.showErrorMessage(Installer.noCondaOrPipInstaller, Installer.searchForHelp))
            .verifiable(TypeMoq.Times.once());
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        await installChannelManager.showNoInstallersMessage(resource);
        serviceContainer.verifyAll();
        appShell.verifyAll();
    });

    test('If active interpreter is not Conda, show pip prompt', async () => {
        const activeInterpreter = {
            envType: EnvironmentType.Pipenv,
        };
        const appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        serviceContainer
            .setup((s) => s.get<IInterpreterService>(IInterpreterService))
            .returns(() => interpreterService.object);
        serviceContainer
            .setup((s) => s.get<IApplicationShell>(IApplicationShell))
            .returns(() => appShell.object)
            .verifiable(TypeMoq.Times.once());
        interpreterService
            .setup((i) => i.getActiveInterpreter(resource))

            .returns(() => Promise.resolve(activeInterpreter as any));
        appShell
            .setup((a) => a.showErrorMessage(Installer.noPipInstaller, Installer.searchForHelp))
            .verifiable(TypeMoq.Times.once());
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        await installChannelManager.showNoInstallersMessage(resource);
        serviceContainer.verifyAll();
        appShell.verifyAll();
    });

    [EnvironmentType.Conda, EnvironmentType.Pipenv].forEach((interpreterType) => {
        [
            {
                osName: 'Windows',
                isWindows: true,
                isMac: false,
            },
            {
                osName: 'Linux',
                isWindows: false,
                isMac: false,
            },
            {
                osName: 'MacOS',
                isWindows: false,
                isMac: true,
            },
        ].forEach((testParams) => {
            const expectedURL = `https://www.bing.com/search?q=Install Pip ${testParams.osName} ${
                interpreterType === EnvironmentType.Conda ? 'Conda' : ''
            }`;
            test(`If \'Search for help\' is selected in error prompt, open correct URL for ${
                testParams.osName
            } when Interpreter type is ${
                interpreterType === EnvironmentType.Conda ? 'Conda' : 'not Conda'
            }`, async () => {
                const activeInterpreter = {
                    envType: interpreterType,
                };
                const appShell = TypeMoq.Mock.ofType<IApplicationShell>();
                const platformService = TypeMoq.Mock.ofType<IPlatformService>();
                serviceContainer
                    .setup((s) => s.get<IInterpreterService>(IInterpreterService))
                    .returns(() => interpreterService.object);
                serviceContainer
                    .setup((s) => s.get<IApplicationShell>(IApplicationShell))
                    .returns(() => appShell.object)
                    .verifiable(TypeMoq.Times.once());
                serviceContainer
                    .setup((s) => s.get<IPlatformService>(IPlatformService))
                    .returns(() => platformService.object)
                    .verifiable(TypeMoq.Times.once());
                interpreterService
                    .setup((i) => i.getActiveInterpreter(resource))

                    .returns(() => Promise.resolve(activeInterpreter as any));
                platformService.setup((p) => p.isWindows).returns(() => testParams.isWindows);
                platformService.setup((p) => p.isMac).returns(() => testParams.isMac);
                appShell
                    .setup((a) => a.showErrorMessage(TypeMoq.It.isAny(), Installer.searchForHelp))
                    .returns(() => Promise.resolve(Installer.searchForHelp))
                    .verifiable(TypeMoq.Times.once());
                appShell
                    .setup((a) => a.openUrl(expectedURL))
                    .returns(() => undefined)
                    .verifiable(TypeMoq.Times.once());
                installChannelManager = new InstallationChannelManager(serviceContainer.object);
                await installChannelManager.showNoInstallersMessage(resource);
                serviceContainer.verifyAll();
                appShell.verifyAll();
            });
        });
    });
    test("If 'Search for help' is not selected in error prompt, don't open URL", async () => {
        const activeInterpreter = {
            envType: EnvironmentType.Conda,
        };
        const appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        const platformService = TypeMoq.Mock.ofType<IPlatformService>();
        serviceContainer
            .setup((s) => s.get<IInterpreterService>(IInterpreterService))
            .returns(() => interpreterService.object);
        serviceContainer
            .setup((s) => s.get<IApplicationShell>(IApplicationShell))
            .returns(() => appShell.object)
            .verifiable(TypeMoq.Times.once());
        serviceContainer
            .setup((s) => s.get<IPlatformService>(IPlatformService))
            .returns(() => platformService.object)
            .verifiable(TypeMoq.Times.never());
        interpreterService
            .setup((i) => i.getActiveInterpreter(resource))

            .returns(() => Promise.resolve(activeInterpreter as any));
        platformService.setup((p) => p.isWindows).returns(() => true);
        appShell
            .setup((a) => a.showErrorMessage(TypeMoq.It.isAnyString(), Installer.searchForHelp))
            .returns(() => Promise.resolve(undefined))
            .verifiable(TypeMoq.Times.once());
        appShell
            .setup((a) => a.openUrl(TypeMoq.It.isAny()))
            .returns(() => undefined)
            .verifiable(TypeMoq.Times.never());
        installChannelManager = new InstallationChannelManager(serviceContainer.object);
        await installChannelManager.showNoInstallersMessage(resource);
        serviceContainer.verifyAll();
        appShell.verifyAll();
    });
});
