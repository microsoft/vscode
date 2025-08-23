// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { ExtensionContextKey } from '../../../../client/common/application/contextKeys';
import { ICommandManager, IContextKeyManager } from '../../../../client/common/application/types';
import { PythonWelcome } from '../../../../client/common/application/walkThroughs';
import { Commands, PVSC_EXTENSION_ID } from '../../../../client/common/constants';
import { IPlatformService } from '../../../../client/common/platform/types';
import { IBrowserService, IDisposable } from '../../../../client/common/types';
import { InstallPythonCommand } from '../../../../client/interpreter/configuration/interpreterSelector/commands/installPython';

suite('Install Python Command', () => {
    let cmdManager: ICommandManager;
    let browserService: IBrowserService;
    let contextKeyManager: IContextKeyManager;
    let platformService: IPlatformService;
    let installPythonCommand: InstallPythonCommand;
    let walkthroughID:
        | {
              category: string;
              step: string;
          }
        | undefined;
    setup(() => {
        walkthroughID = undefined;
        cmdManager = mock<ICommandManager>();
        when(cmdManager.executeCommand('workbench.action.openWalkthrough', anything(), false)).thenCall((_, w) => {
            walkthroughID = w;
        });
        browserService = mock<IBrowserService>();
        when(browserService.launch(anything())).thenReturn(undefined);
        contextKeyManager = mock<IContextKeyManager>();
        when(contextKeyManager.setContext(ExtensionContextKey.showInstallPythonTile, true)).thenResolve();
        platformService = mock<IPlatformService>();
        installPythonCommand = new InstallPythonCommand(
            instance(cmdManager),
            instance(contextKeyManager),
            instance(browserService),
            instance(platformService),
            [],
        );
    });

    teardown(() => {
        sinon.restore();
    });

    test('Ensure command is registered with the correct callback handler', async () => {
        let installCommandHandler!: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPython, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });

        await installPythonCommand.activate();

        verify(cmdManager.registerCommand(Commands.InstallPython, anything())).once();

        const installPython = sinon.stub(InstallPythonCommand.prototype, '_installPython');
        await installCommandHandler();
        assert(installPython.calledOnce);
    });

    test('Opens Linux Install tile on Linux', async () => {
        when(platformService.isWindows).thenReturn(false);
        when(platformService.isLinux).thenReturn(true);
        when(platformService.isMac).thenReturn(false);
        const expectedWalkthroughID = {
            category: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}`,
            step: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}#${PythonWelcome.linuxInstallId}`,
        };
        await installPythonCommand._installPython();
        verify(contextKeyManager.setContext(ExtensionContextKey.showInstallPythonTile, true)).once();
        verify(browserService.launch(anything())).never();
        assert.deepEqual(walkthroughID, expectedWalkthroughID);
    });

    test('Opens Mac Install tile on MacOS', async () => {
        when(platformService.isWindows).thenReturn(false);
        when(platformService.isLinux).thenReturn(false);
        when(platformService.isMac).thenReturn(true);
        const expectedWalkthroughID = {
            category: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}`,
            step: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}#${PythonWelcome.macOSInstallId}`,
        };
        await installPythonCommand._installPython();
        verify(contextKeyManager.setContext(ExtensionContextKey.showInstallPythonTile, true)).once();
        verify(browserService.launch(anything())).never();
        assert.deepEqual(walkthroughID, expectedWalkthroughID);
    });

    test('Opens Windows Install tile on Windows 8', async () => {
        when(platformService.isWindows).thenReturn(true);
        when(platformService.isLinux).thenReturn(false);
        when(platformService.isMac).thenReturn(false);
        when(platformService.getVersion()).thenResolve(new SemVer('8.2.0'));
        const expectedWalkthroughID = {
            category: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}`,
            step: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}#${PythonWelcome.windowsInstallId}`,
        };
        await installPythonCommand._installPython();
        verify(contextKeyManager.setContext(ExtensionContextKey.showInstallPythonTile, true)).once();
        verify(browserService.launch(anything())).never();
        assert.deepEqual(walkthroughID, expectedWalkthroughID);
    });

    test('Opens microsoft store app on Windows otherwise', async () => {
        when(platformService.isWindows).thenReturn(true);
        when(platformService.isLinux).thenReturn(false);
        when(platformService.isMac).thenReturn(false);
        when(platformService.getVersion()).thenResolve(new SemVer('10.0.0'));
        await installPythonCommand._installPython();
        verify(browserService.launch(anything())).once();
        verify(contextKeyManager.setContext(ExtensionContextKey.showInstallPythonTile, true)).never();
    });
});
