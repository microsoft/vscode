/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { getActivePythonSessions, PythonRuntimeSession } from './session';
import { IPythonRuntimeManager } from './manager';
import { IServiceContainer } from '../ioc/types';
import { IWorkspaceService } from '../common/application/types';
import { IPythonPathUpdaterServiceManager } from '../interpreter/configuration/types';
import { IPersistentState, IPersistentStateFactory } from '../common/types';

const lastForegroundSessionIdKey = 'erdos.lastForegroundSessionId';

class LanguageServerManager implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _persistentStateFactory: IPersistentStateFactory,
        private readonly _pythonPathUpdaterService: IPythonPathUpdaterServiceManager,
        private readonly _pythonRuntimeManager: IPythonRuntimeManager,
        private readonly _workspaceService: IWorkspaceService,
    ) {
        this._disposables.push(
            this._pythonRuntimeManager.onDidCreateSession((session) => {
                this.registerSession(session);
            }),

            erdos.runtime.onDidChangeForegroundSession(async (sessionId) => {
                if (!sessionId) {
                    return;
                }

                const lastForegroundSessionIdState = this.getLastForegroundSessionIdState();
                if (lastForegroundSessionIdState.value === sessionId) {
                    return;
                }

                const sessions = await getActivePythonSessions();
                const foregroundSession = sessions.find((session) => session.metadata.sessionId === sessionId);
                if (!foregroundSession) {
                    return;
                }

                await Promise.all([
                    lastForegroundSessionIdState.updateValue(sessionId),

                    this.activateConsoleLsp(foregroundSession, 'foreground session changed', sessions),
                ]);
            }),
        );
    }

    private getLastForegroundSessionIdState(): IPersistentState<string | undefined> {
        return this._persistentStateFactory.createWorkspacePersistentState<string | undefined>(
            lastForegroundSessionIdKey,
        );
    }

    private async updatePythonPath(pythonPath: string): Promise<void> {
        let folderUri: vscode.Uri | undefined;
        let configTarget: vscode.ConfigurationTarget;

        const { workspaceFolders } = this._workspaceService;

        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            folderUri = undefined;
            configTarget = vscode.ConfigurationTarget.Global;
        } else if (this._workspaceService.workspaceFile) {
            folderUri = this._workspaceService.workspaceFile;
            configTarget = vscode.ConfigurationTarget.Workspace;
        } else {
            folderUri = workspaceFolders[0].uri;
            configTarget = vscode.ConfigurationTarget.WorkspaceFolder;
        }

        await this._pythonPathUpdaterService.updatePythonPath(pythonPath, configTarget, 'ui', folderUri);
    }

    private async activateConsoleLsp(
        session: PythonRuntimeSession,
        reason: string,
        allSessions?: PythonRuntimeSession[],
    ): Promise<void> {
        const { sessionId: foregroundSessionId } = session.metadata;
        const sessions = allSessions ?? (await getActivePythonSessions());
        await Promise.all(
            sessions
                .filter(
                    (session) =>
                        session.metadata.sessionId !== foregroundSessionId &&
                        session.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console,
                )
                .map((session) => session.deactivateLsp(reason)),
        );

        await Promise.all([
            session.activateLsp(reason),

            this.updatePythonPath(session.runtimeMetadata.runtimePath),
        ]);
    }

    private registerSession(session: PythonRuntimeSession): void {
        this._disposables.push(
            session.onDidChangeRuntimeState(async (state) => {
                if (state === erdos.RuntimeState.Ready) {
                    if (session.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console) {
                        const lastForegroundSessionIdState = this.getLastForegroundSessionIdState();
                        if (lastForegroundSessionIdState.value === session.metadata.sessionId) {
                            await this.activateConsoleLsp(session, 'foreground session is ready');
                        }
                    } else if (session.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Notebook) {
                        await session.activateLsp('notebook session is ready');
                    }
                }
            }),
        );
    }

    public dispose(): void {
        this._disposables.forEach((disposable) => disposable.dispose());
    }
}

export function registerLanguageServerManager(
    serviceContainer: IServiceContainer,
    disposables: vscode.Disposable[],
): void {
    const persistentStateFactory = serviceContainer.get<IPersistentStateFactory>(IPersistentStateFactory);
    const pythonRuntimeManager = serviceContainer.get<IPythonRuntimeManager>(IPythonRuntimeManager);
    const pythonPathUpdaterService: IPythonPathUpdaterServiceManager = serviceContainer.get<
        IPythonPathUpdaterServiceManager
    >(IPythonPathUpdaterServiceManager);
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    disposables.push(
        new LanguageServerManager(
            persistentStateFactory,
            pythonPathUpdaterService,
            pythonRuntimeManager,
            workspaceService,
        ),
    );
}
