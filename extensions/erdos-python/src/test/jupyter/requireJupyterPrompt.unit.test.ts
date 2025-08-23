// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { mock, instance, verify, anything, when } from 'ts-mockito';
import { IApplicationShell, ICommandManager } from '../../client/common/application/types';
import { Commands, JUPYTER_EXTENSION_ID } from '../../client/common/constants';
import { IDisposableRegistry } from '../../client/common/types';
import { Common, Interpreters } from '../../client/common/utils/localize';
import { RequireJupyterPrompt } from '../../client/jupyter/requireJupyterPrompt';

suite('RequireJupyterPrompt Unit Tests', () => {
    let requireJupyterPrompt: RequireJupyterPrompt;
    let appShell: IApplicationShell;
    let commandManager: ICommandManager;
    let disposables: IDisposableRegistry;

    setup(() => {
        appShell = mock<IApplicationShell>();
        commandManager = mock<ICommandManager>();
        disposables = mock<IDisposableRegistry>();

        requireJupyterPrompt = new RequireJupyterPrompt(
            instance(appShell),
            instance(commandManager),
            instance(disposables),
        );
    });

    test('Activation registers command', async () => {
        await requireJupyterPrompt.activate();

        verify(commandManager.registerCommand(Commands.InstallJupyter, anything())).once();
    });

    test('Show prompt with Yes selection installs Jupyter extension', async () => {
        when(
            appShell.showInformationMessage(Interpreters.requireJupyter, Common.bannerLabelYes, Common.bannerLabelNo),
        ).thenReturn(Promise.resolve(Common.bannerLabelYes));

        await requireJupyterPrompt.activate();
        await requireJupyterPrompt._showPrompt();

        verify(
            commandManager.executeCommand('workbench.extensions.installExtension', JUPYTER_EXTENSION_ID, undefined),
        ).once();
    });

    test('Show prompt with No selection does not install Jupyter extension', async () => {
        when(
            appShell.showInformationMessage(Interpreters.requireJupyter, Common.bannerLabelYes, Common.bannerLabelNo),
        ).thenReturn(Promise.resolve(Common.bannerLabelNo));

        await requireJupyterPrompt.activate();
        await requireJupyterPrompt._showPrompt();

        verify(
            commandManager.executeCommand('workbench.extensions.installExtension', JUPYTER_EXTENSION_ID, undefined),
        ).never();
    });
});
