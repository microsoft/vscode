/* eslint-disable global-require */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import type * as whichTypes from 'which';
import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../../../../../activation/types';
import { Commands } from '../../../../../common/constants';
import { IDisposableRegistry } from '../../../../../common/types';
import { ICommandManager, ITerminalManager } from '../../../../../common/application/types';
import { sleep } from '../../../../../common/utils/async';
import { OSType } from '../../../../../common/utils/platform';
import { traceVerbose } from '../../../../../logging';
import { Interpreters } from '../../../../../common/utils/localize';

enum PackageManagers {
    brew = 'brew',
    apt = 'apt',
    dnf = 'dnf',
}

/**
 * Runs commands listed in walkthrough to install Python.
 */
@injectable()
export class InstallPythonViaTerminal implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: true, virtualWorkspace: false };

    private readonly packageManagerCommands: Record<PackageManagers, string[]> = {
        brew: ['brew install python3'],
        dnf: ['sudo dnf install python3'],
        apt: ['sudo apt-get update', 'sudo apt-get install python3 python3-venv python3-pip'],
    };

    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(ITerminalManager) private readonly terminalManager: ITerminalManager,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}

    public async activate(): Promise<void> {
        this.disposables.push(
            this.commandManager.registerCommand(Commands.InstallPythonOnMac, () =>
                this._installPythonOnUnix(OSType.OSX),
            ),
        );
        this.disposables.push(
            this.commandManager.registerCommand(Commands.InstallPythonOnLinux, () =>
                this._installPythonOnUnix(OSType.Linux),
            ),
        );
    }

    public async _installPythonOnUnix(os: OSType.Linux | OSType.OSX): Promise<void> {
        const commands = await this.getCommands(os);
        const installMessage =
            os === OSType.OSX
                ? Interpreters.installPythonTerminalMacMessage
                : Interpreters.installPythonTerminalMessageLinux;
        const terminal = this.terminalManager.createTerminal({
            name: 'Python',
            message: commands.length ? undefined : installMessage,
        });
        terminal.show(true);
        await waitForTerminalToStartup();
        for (const command of commands) {
            terminal.sendText(command);
            await waitForCommandToProcess();
        }
    }

    private async getCommands(os: OSType.Linux | OSType.OSX) {
        if (os === OSType.OSX) {
            return this.getCommandsForPackageManagers([PackageManagers.brew]);
        }
        if (os === OSType.Linux) {
            return this.getCommandsForPackageManagers([PackageManagers.apt, PackageManagers.dnf]);
        }
        throw new Error('OS not supported');
    }

    private async getCommandsForPackageManagers(packageManagers: PackageManagers[]) {
        for (const packageManager of packageManagers) {
            if (await isPackageAvailable(packageManager)) {
                return this.packageManagerCommands[packageManager];
            }
        }
        return [];
    }
}

async function isPackageAvailable(packageManager: PackageManagers) {
    try {
        const which = require('which') as typeof whichTypes;
        const resolvedPath = await which.default(packageManager);
        traceVerbose(`Resolved path to ${packageManager} module:`, resolvedPath);
        return resolvedPath.trim().length > 0;
    } catch (ex) {
        traceVerbose(`${packageManager} not found`, ex);
        return false;
    }
}

async function waitForTerminalToStartup() {
    // Sometimes the terminal takes some time to start up before it can start accepting input.
    await sleep(100);
}

async function waitForCommandToProcess() {
    // Give the command some time to complete.
    // Its been observed that sending commands too early will strip some text off in VS Code Terminal.
    await sleep(500);
}
