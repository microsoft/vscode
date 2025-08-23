// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable, inject } from 'inversify';
import { EventEmitter } from 'vscode';
import {
    IApplicationEnvironment,
    IApplicationShell,
    ITerminalManager,
    IWorkspaceService,
} from '../../common/application/types';
import { identifyShellFromShellPath } from '../../common/terminal/shellDetectors/baseShellDetector';
import { TerminalShellType } from '../../common/terminal/types';
import { IDisposableRegistry, IPersistentStateFactory } from '../../common/types';
import { sleep } from '../../common/utils/async';
import { traceError, traceVerbose } from '../../logging';
import { IShellIntegrationDetectionService } from '../types';
import { isTrusted } from '../../common/vscodeApis/workspaceApis';

/**
 * This is a list of shells which support shell integration:
 * https://code.visualstudio.com/docs/terminal/shell-integration
 */
const ShellIntegrationShells = [
    TerminalShellType.powershell,
    TerminalShellType.powershellCore,
    TerminalShellType.bash,
    TerminalShellType.zsh,
    TerminalShellType.fish,
];

export enum isShellIntegrationWorking {
    key = 'SHELL_INTEGRATION_WORKING_KEY',
}

@injectable()
export class ShellIntegrationDetectionService implements IShellIntegrationDetectionService {
    private isWorkingForShell = new Set<TerminalShellType>();

    private readonly didChange = new EventEmitter<void>();

    private isDataWriteEventWorking = true;

    constructor(
        @inject(ITerminalManager) private readonly terminalManager: ITerminalManager,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory,
        @inject(IApplicationEnvironment) private readonly appEnvironment: IApplicationEnvironment,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {
        try {
            const activeShellType = identifyShellFromShellPath(this.appEnvironment.shell);
            const key = getKeyForShell(activeShellType);
            const persistedResult = this.persistentStateFactory.createGlobalPersistentState<boolean>(key);
            if (persistedResult.value) {
                this.isWorkingForShell.add(activeShellType);
            }
            this.appShell.onDidWriteTerminalData(
                (e) => {
                    if (e.data.includes('\x1b]633;A\x07') || e.data.includes('\x1b]133;A\x07')) {
                        let { shell } = this.appEnvironment;
                        if ('shellPath' in e.terminal.creationOptions && e.terminal.creationOptions.shellPath) {
                            shell = e.terminal.creationOptions.shellPath;
                        }
                        const shellType = identifyShellFromShellPath(shell);
                        traceVerbose('Received shell integration sequence for', shellType);
                        const wasWorking = this.isWorkingForShell.has(shellType);
                        this.isWorkingForShell.add(shellType);
                        if (!wasWorking) {
                            // If it wasn't working previously, status has changed.
                            this.didChange.fire();
                        }
                    }
                },
                this,
                this.disposables,
            );
            this.appEnvironment.onDidChangeShell(
                async (shell: string) => {
                    this.createDummyHiddenTerminal(shell);
                },
                this,
                this.disposables,
            );
            this.createDummyHiddenTerminal(this.appEnvironment.shell);
        } catch (ex) {
            this.isDataWriteEventWorking = false;
            traceError('Unable to check if shell integration is active', ex);
        }
        const isEnabled = !!this.workspaceService
            .getConfiguration('terminal')
            .get<boolean>('integrated.shellIntegration.enabled');
        if (!isEnabled) {
            traceVerbose('Shell integration is disabled in user settings.');
        }
    }

    public readonly onDidChangeStatus = this.didChange.event;

    public async isWorking(): Promise<boolean> {
        const { shell } = this.appEnvironment;
        return this._isWorking(shell).catch((ex) => {
            traceError(`Failed to determine if shell supports shell integration`, shell, ex);
            return false;
        });
    }

    public async _isWorking(shell: string): Promise<boolean> {
        const shellType = identifyShellFromShellPath(shell);
        const isSupposedToWork = ShellIntegrationShells.includes(shellType);
        if (!isSupposedToWork) {
            return false;
        }
        const key = getKeyForShell(shellType);
        const persistedResult = this.persistentStateFactory.createGlobalPersistentState<boolean>(key);
        if (persistedResult.value !== undefined) {
            return persistedResult.value;
        }
        const result = await this.useDataWriteApproach(shellType);
        if (result) {
            // Once we know that shell integration is working for a shell, persist it so we need not do this check every session.
            await persistedResult.updateValue(result);
        }
        return result;
    }

    private async useDataWriteApproach(shellType: TerminalShellType) {
        // For now, based on problems with using the command approach, use terminal data write event.
        if (!this.isDataWriteEventWorking) {
            // Assume shell integration is working, if data write event isn't working.
            return true;
        }
        if (shellType === TerminalShellType.powershell || shellType === TerminalShellType.powershellCore) {
            // Due to upstream bug: https://github.com/microsoft/vscode/issues/204616, assume shell integration is working for now.
            return true;
        }
        if (!this.isWorkingForShell.has(shellType)) {
            // Maybe data write event has not been processed yet, wait a bit.
            await sleep(1000);
        }
        traceVerbose(
            'Did we determine shell integration to be working for',
            shellType,
            '?',
            this.isWorkingForShell.has(shellType),
        );
        return this.isWorkingForShell.has(shellType);
    }

    /**
     * Creates a dummy terminal so that we are guaranteed a data write event for this shell type.
     */
    private createDummyHiddenTerminal(shell: string) {
        if (isTrusted()) {
            this.terminalManager.createTerminal({
                shellPath: shell,
                hideFromUser: true,
            });
        }
    }
}

function getKeyForShell(shellType: TerminalShellType) {
    return `${isShellIntegrationWorking.key}_${shellType}`;
}
