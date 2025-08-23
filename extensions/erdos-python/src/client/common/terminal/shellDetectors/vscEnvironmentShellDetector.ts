// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject } from 'inversify';
import { Terminal } from 'vscode';
import { traceVerbose } from '../../../logging';
import { IApplicationEnvironment } from '../../application/types';
import { ShellIdentificationTelemetry, TerminalShellType } from '../types';
import { BaseShellDetector } from './baseShellDetector';

/**
 * Identifies the shell, based on the VSC Environment API.
 */
export class VSCEnvironmentShellDetector extends BaseShellDetector {
    constructor(@inject(IApplicationEnvironment) private readonly appEnv: IApplicationEnvironment) {
        super(3);
    }
    public identify(
        telemetryProperties: ShellIdentificationTelemetry,
        terminal?: Terminal,
    ): TerminalShellType | undefined {
        const shellPath =
            terminal?.creationOptions && 'shellPath' in terminal.creationOptions && terminal.creationOptions.shellPath
                ? terminal.creationOptions.shellPath
                : this.appEnv.shell;
        if (!shellPath) {
            return;
        }
        const shell = this.identifyShellFromShellPath(shellPath);
        traceVerbose(`Terminal shell path '${shellPath}' identified as shell '${shell}'`);
        telemetryProperties.shellIdentificationSource =
            shell === TerminalShellType.other ? telemetryProperties.shellIdentificationSource : 'vscode';
        telemetryProperties.failed = shell === TerminalShellType.other ? false : true;
        return shell;
    }
}
