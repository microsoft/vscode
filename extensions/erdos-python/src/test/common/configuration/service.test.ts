// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { expect } from 'chai';
import { workspace } from 'vscode';
import { IConfigurationService, IDisposableRegistry, IExtensionContext } from '../../../client/common/types';
import { IServiceContainer } from '../../../client/ioc/types';
import { getExtensionSettings } from '../../extensionSettings';
import { initialize } from '../../initialize';

suite('Configuration Service', () => {
    let serviceContainer: IServiceContainer;
    suiteSetup(async () => {
        serviceContainer = (await initialize()).serviceContainer;
    });

    test('Ensure same instance of settings return', () => {
        const workspaceUri = workspace.workspaceFolders![0].uri;
        const settings = serviceContainer.get<IConfigurationService>(IConfigurationService).getSettings(workspaceUri);
        const instanceIsSame = settings === getExtensionSettings(workspaceUri);
        expect(instanceIsSame).to.be.equal(true, 'Incorrect settings');
    });

    test('Ensure async registry works', async () => {
        const asyncRegistry = serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        let subs = serviceContainer.get<IExtensionContext>(IExtensionContext).subscriptions;
        const oldLength = subs.length;
        const disposable = {
            dispose(): Promise<void> {
                return Promise.resolve();
            },
        };
        asyncRegistry.push(disposable);
        subs = serviceContainer.get<IExtensionContext>(IExtensionContext).subscriptions;
        const newLength = subs.length;
        expect(newLength).to.be.equal(oldLength + 1, 'Subscription not added');
        // serviceContainer subscriptions are not disposed of as this breaks other tests that use the service container.
    });
});
