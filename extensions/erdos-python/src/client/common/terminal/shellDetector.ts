// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, multiInject } from 'inversify';
import { Terminal, env } from 'vscode';
import { traceError, traceVerbose } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import '../extensions';
import { IPlatformService } from '../platform/types';
import { OSType } from '../utils/platform';
import { IShellDetector, ShellIdentificationTelemetry, TerminalShellType } from './types';

const defaultOSShells = {
    [OSType.Linux]: TerminalShellType.bash,
    [OSType.OSX]: TerminalShellType.bash,
    [OSType.Windows]: TerminalShellType.commandPrompt,
    [OSType.Unknown]: TerminalShellType.other,
};

@injectable()
export class ShellDetector {
    constructor(
        @inject(IPlatformService) private readonly platform: IPlatformService,
        @multiInject(IShellDetector) private readonly shellDetectors: IShellDetector[],
    ) {}
    /**
     * Logic is as follows:
     * 1. Try to identify the type of the shell based on the name of the terminal.
     * 2. Try to identify the type of the shell based on the settings in VSC.
     * 3. Try to identify the type of the shell based on the user environment (OS).
     * 4. If all else fail, use defaults hardcoded (cmd for windows, bash for linux & mac).
     * More information here: https://github.com/microsoft/vscode/issues/74233#issuecomment-497527337
     */
    public identifyTerminalShell(terminal?: Terminal): TerminalShellType {
        let shell: TerminalShellType | undefined;
        const telemetryProperties: ShellIdentificationTelemetry = {
            failed: true,
            shellIdentificationSource: 'default',
            terminalProvided: !!terminal,
            hasCustomShell: undefined,
            hasShellInEnv: undefined,
        };

        // Sort in order of priority and then identify the shell.
        const shellDetectors = this.shellDetectors.slice().sort((a, b) => b.priority - a.priority);

        for (const detector of shellDetectors) {
            shell = detector.identify(telemetryProperties, terminal);
            if (shell && shell !== TerminalShellType.other) {
                telemetryProperties.failed = false;
                break;
            }
        }

        // This information is useful in determining how well we identify shells on users machines.
        // This impacts executing code in terminals and activation of environments in terminal.
        // So, the better this works, the better it is for the user.
        sendTelemetryEvent(EventName.TERMINAL_SHELL_IDENTIFICATION, undefined, telemetryProperties);
        traceVerbose(`Shell identified as ${shell} ${terminal ? `(Terminal name is ${terminal.name})` : ''}`);

        // If we could not identify the shell, use the defaults.
        if (shell === undefined || shell === TerminalShellType.other) {
            traceError('Unable to identify shell', env.shell, ' for OS ', this.platform.osType);
            traceVerbose('Using default OS shell');
            shell = defaultOSShells[this.platform.osType];
        }
        return shell;
    }
}
