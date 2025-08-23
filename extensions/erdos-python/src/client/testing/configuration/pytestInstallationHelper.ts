// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri, l10n } from 'vscode';
import { IApplicationShell } from '../../common/application/types';
import { traceInfo, traceError } from '../../logging';
import { useEnvExtension, getEnvExtApi } from '../../envExt/api.internal';
import { getEnvironment } from '../../envExt/api.internal';

/**
 * Helper class to handle pytest installation using the appropriate method
 * based on whether the Python Environments extension is available.
 */
export class PytestInstallationHelper {
    constructor(private readonly appShell: IApplicationShell) {}

    /**
     * Prompts the user to install pytest with appropriate installation method.
     * @param workspaceUri The workspace URI where pytest should be installed
     * @returns Promise that resolves to true if installation was attempted, false otherwise
     */
    async promptToInstallPytest(workspaceUri: Uri): Promise<boolean> {
        const message = l10n.t('pytest selected but not installed. Would you like to install pytest?');
        const installOption = l10n.t('Install pytest');

        const selection = await this.appShell.showInformationMessage(message, { modal: true }, installOption);

        if (selection === installOption) {
            return this.installPytest(workspaceUri);
        }

        return false;
    }

    /**
     * Installs pytest using the appropriate method based on available extensions.
     * @param workspaceUri The workspace URI where pytest should be installed
     * @returns Promise that resolves to true if installation was successful, false otherwise
     */
    private async installPytest(workspaceUri: Uri): Promise<boolean> {
        try {
            if (useEnvExtension()) {
                return this.installPytestWithEnvExtension(workspaceUri);
            } else {
                // Fall back to traditional installer if environments extension is not available
                traceInfo(
                    'Python Environments extension not available, installation cannot proceed via environment extension',
                );
                return false;
            }
        } catch (error) {
            traceError('Error installing pytest:', error);
            return false;
        }
    }

    /**
     * Installs pytest using the Python Environments extension.
     * @param workspaceUri The workspace URI where pytest should be installed
     * @returns Promise that resolves to true if installation was successful, false otherwise
     */
    private async installPytestWithEnvExtension(workspaceUri: Uri): Promise<boolean> {
        try {
            const envExtApi = await getEnvExtApi();
            const environment = await getEnvironment(workspaceUri);

            if (!environment) {
                traceError('No Python environment found for workspace:', workspaceUri.fsPath);
                await this.appShell.showErrorMessage(
                    l10n.t('No Python environment found. Please set up a Python environment first.'),
                );
                return false;
            }

            traceInfo('Installing pytest using Python Environments extension...');
            await envExtApi.managePackages(environment, {
                install: ['pytest'],
            });

            traceInfo('pytest installation completed successfully');
            return true;
        } catch (error) {
            traceError('Failed to install pytest using Python Environments extension:', error);
            return false;
        }
    }

    /**
     * Checks if the Python Environments extension is available for package management.
     * @returns True if the extension is available, false otherwise
     */
    isEnvExtensionAvailable(): boolean {
        return useEnvExtension();
    }
}
