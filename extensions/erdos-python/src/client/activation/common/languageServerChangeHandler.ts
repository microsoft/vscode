// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ConfigurationTarget, Disposable } from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../common/application/types';
import { PYLANCE_EXTENSION_ID } from '../../common/constants';
import { IConfigurationService, IExtensions } from '../../common/types';
import { createDeferred } from '../../common/utils/async';
import { Pylance } from '../../common/utils/localize';
import { LanguageServerType } from '../types';

export async function promptForPylanceInstall(
    appShell: IApplicationShell,
    commandManager: ICommandManager,
    workspace: IWorkspaceService,
    configService: IConfigurationService,
): Promise<void> {
    const response = await appShell.showWarningMessage(
        Pylance.pylanceRevertToJediPrompt,
        Pylance.pylanceInstallPylance,
        Pylance.pylanceRevertToJedi,
        Pylance.remindMeLater,
    );

    if (response === Pylance.pylanceInstallPylance) {
        commandManager.executeCommand('extension.open', PYLANCE_EXTENSION_ID);
    } else if (response === Pylance.pylanceRevertToJedi) {
        const inspection = workspace.getConfiguration('python').inspect<string>('languageServer');

        let target: ConfigurationTarget | undefined;
        if (inspection?.workspaceValue) {
            target = ConfigurationTarget.Workspace;
        } else if (inspection?.globalValue) {
            target = ConfigurationTarget.Global;
        }

        if (target) {
            await configService.updateSetting('languageServer', LanguageServerType.Jedi, undefined, target);
        }
    }
}

// Tracks language server type and issues appropriate reload or install prompts.
export class LanguageServerChangeHandler implements Disposable {
    // For tests that need to track Pylance install completion.
    private readonly pylanceInstallCompletedDeferred = createDeferred<void>();

    private readonly disposables: Disposable[] = [];

    private pylanceInstalled = false;

    constructor(
        private currentLsType: LanguageServerType | undefined,
        private readonly extensions: IExtensions,
        private readonly appShell: IApplicationShell,
        private readonly commands: ICommandManager,
        private readonly workspace: IWorkspaceService,
        private readonly configService: IConfigurationService,
    ) {
        this.pylanceInstalled = this.isPylanceInstalled();
        this.disposables.push(
            extensions.onDidChange(async () => {
                await this.extensionsChangeHandler();
            }),
        );
    }

    public dispose(): void {
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    // For tests that need to track Pylance install completion.
    get pylanceInstallCompleted(): Promise<void> {
        return this.pylanceInstallCompletedDeferred.promise;
    }

    public async handleLanguageServerChange(lsType: LanguageServerType | undefined): Promise<void> {
        if (this.currentLsType === lsType || lsType === LanguageServerType.Microsoft) {
            return;
        }
        // VS Code has to be reloaded when language server type changes. In case of Pylance
        // it also has to be installed manually by the user. We avoid prompting to reload
        // if target changes to Pylance when Pylance is not installed since otherwise user
        // may get one reload prompt now and then another when Pylance is finally installed.
        // Instead, check the installation and suppress prompt if Pylance is not there.
        // Extensions change event handler will then show its own prompt.
        if (lsType === LanguageServerType.Node && !this.isPylanceInstalled()) {
            // If not installed, point user to Pylance at the store.
            await promptForPylanceInstall(this.appShell, this.commands, this.workspace, this.configService);
            // At this point Pylance is not yet installed. Skip reload prompt
            // since we are going to show it when Pylance becomes available.
        }

        this.currentLsType = lsType;
    }

    private async extensionsChangeHandler(): Promise<void> {
        // Track Pylance extension installation state and prompt to reload when it becomes available.
        const oldInstallState = this.pylanceInstalled;

        this.pylanceInstalled = this.isPylanceInstalled();
        if (oldInstallState === this.pylanceInstalled) {
            this.pylanceInstallCompletedDeferred.resolve();
        }
    }

    private isPylanceInstalled(): boolean {
        return !!this.extensions.getExtension(PYLANCE_EXTENSION_ID);
    }
}
