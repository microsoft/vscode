// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Container } from 'inversify';
import * as TypeMoq from 'typemoq';
import { IApplicationShell } from '../../client/common/application/types';
import { InstallationChannelManager } from '../../client/common/installer/channelManager';
import { IModuleInstaller } from '../../client/common/installer/types';
import { Product } from '../../client/common/types';
import {
    IInterpreterAutoSelectionService,
    IInterpreterAutoSelectionProxyService,
} from '../../client/interpreter/autoSelection/types';
import { ServiceContainer } from '../../client/ioc/container';
import { ServiceManager } from '../../client/ioc/serviceManager';
import { IServiceContainer } from '../../client/ioc/types';
import { MockAutoSelectionService } from '../mocks/autoSelector';
import { createTypeMoq } from '../mocks/helper';

suite('Installation - installation channels', () => {
    let serviceManager: ServiceManager;
    let serviceContainer: IServiceContainer;

    setup(() => {
        const cont = new Container();
        serviceManager = new ServiceManager(cont);
        serviceContainer = new ServiceContainer(cont);
        serviceManager.addSingleton<IInterpreterAutoSelectionService>(
            IInterpreterAutoSelectionService,
            MockAutoSelectionService,
        );
        serviceManager.addSingleton<IInterpreterAutoSelectionProxyService>(
            IInterpreterAutoSelectionProxyService,
            MockAutoSelectionService,
        );
    });

    test('Single channel', async () => {
        const installer = mockInstaller(true, '');
        const cm = new InstallationChannelManager(serviceContainer);
        const channels = await cm.getInstallationChannels();
        assert.strictEqual(channels.length, 1, 'Incorrect number of channels');
        assert.strictEqual(channels[0], installer.object, 'Incorrect installer');
    });

    test('Multiple channels', async () => {
        const installer1 = mockInstaller(true, '1');
        mockInstaller(false, '2');
        const installer3 = mockInstaller(true, '3');

        const cm = new InstallationChannelManager(serviceContainer);
        const channels = await cm.getInstallationChannels();
        assert.strictEqual(channels.length, 2, 'Incorrect number of channels');
        assert.strictEqual(channels[0], installer1.object, 'Incorrect installer 1');
        assert.strictEqual(channels[1], installer3.object, 'Incorrect installer 2');
    });

    test('pipenv channel', async () => {
        mockInstaller(true, '1');
        mockInstaller(false, '2');
        mockInstaller(true, '3');
        const pipenvInstaller = mockInstaller(true, 'pipenv', 10);

        const cm = new InstallationChannelManager(serviceContainer);
        const channels = await cm.getInstallationChannels();
        assert.strictEqual(channels.length, 1, 'Incorrect number of channels');
        assert.strictEqual(channels[0], pipenvInstaller.object, 'Installer must be pipenv');
    });

    test('Select installer', async () => {
        const installer1 = mockInstaller(true, '1');
        const installer2 = mockInstaller(true, '2');

        const appShell = createTypeMoq<IApplicationShell>();
        serviceManager.addSingletonInstance<IApplicationShell>(IApplicationShell, appShell.object);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let items: any[] | undefined;
        appShell
            .setup((x) => x.showQuickPick(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .callback((i: string[]) => {
                items = i;
            })
            .returns(
                () => new Promise<string | undefined>((resolve, _reject) => resolve(undefined)),
            );

        installer1.setup((x) => x.displayName).returns(() => 'Name 1');
        installer2.setup((x) => x.displayName).returns(() => 'Name 2');

        const cm = new InstallationChannelManager(serviceContainer);
        await cm.getInstallationChannel(Product.pytest);

        assert.notStrictEqual(items, undefined, 'showQuickPick not called');
        assert.strictEqual(items!.length, 2, 'Incorrect number of installer shown');
        assert.notStrictEqual(items![0]!.label!.indexOf('Name 1'), -1, 'Incorrect first installer name');
        assert.notStrictEqual(items![1]!.label!.indexOf('Name 2'), -1, 'Incorrect second installer name');
    });

    function mockInstaller(supported: boolean, name: string, priority?: number): TypeMoq.IMock<IModuleInstaller> {
        const installer = createTypeMoq<IModuleInstaller>();
        installer
            .setup((x) => x.isSupported(TypeMoq.It.isAny()))
            .returns(
                () => new Promise<boolean>((resolve) => resolve(supported)),
            );
        installer.setup((x) => x.priority).returns(() => priority || 0);
        serviceManager.addSingletonInstance<IModuleInstaller>(IModuleInstaller, installer.object, name);
        return installer;
    }
});
