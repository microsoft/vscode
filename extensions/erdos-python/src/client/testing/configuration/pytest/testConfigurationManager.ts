import * as path from 'path';
import { QuickPickItem, Uri } from 'vscode';
import { IFileSystem } from '../../../common/platform/types';
import { Product } from '../../../common/types';
import { IServiceContainer } from '../../../ioc/types';
import { IApplicationShell } from '../../../common/application/types';
import { TestConfigurationManager } from '../../common/testConfigurationManager';
import { ITestConfigSettingsService } from '../../common/types';
import { PytestInstallationHelper } from '../pytestInstallationHelper';
import { traceInfo } from '../../../logging';

export class ConfigurationManager extends TestConfigurationManager {
    private readonly pytestInstallationHelper: PytestInstallationHelper;

    constructor(workspace: Uri, serviceContainer: IServiceContainer, cfg?: ITestConfigSettingsService) {
        super(workspace, Product.pytest, serviceContainer, cfg);
        const appShell = serviceContainer.get<IApplicationShell>(IApplicationShell);
        this.pytestInstallationHelper = new PytestInstallationHelper(appShell);
    }

    public async requiresUserToConfigure(wkspace: Uri): Promise<boolean> {
        const configFiles = await this.getConfigFiles(wkspace.fsPath);
        // If a config file exits, there's nothing to be configured.
        if (configFiles.length > 0 && configFiles.length !== 1 && configFiles[0] !== 'setup.cfg') {
            return false;
        }
        return true;
    }

    public async configure(wkspace: Uri): Promise<void> {
        const args: string[] = [];
        const configFileOptionLabel = 'Use existing config file';
        const options: QuickPickItem[] = [];
        const configFiles = await this.getConfigFiles(wkspace.fsPath);
        // If a config file exits, there's nothing to be configured.
        if (configFiles.length > 0 && configFiles.length !== 1 && configFiles[0] !== 'setup.cfg') {
            return;
        }

        if (configFiles.length === 1 && configFiles[0] === 'setup.cfg') {
            options.push({
                label: configFileOptionLabel,
                description: 'setup.cfg',
            });
        }
        const subDirs = await this.getTestDirs(wkspace.fsPath);
        const testDir = await this.selectTestDir(wkspace.fsPath, subDirs, options);
        if (typeof testDir === 'string' && testDir !== configFileOptionLabel) {
            args.push(testDir);
        }
        const installed = await this.installer.isInstalled(Product.pytest);
        await this.testConfigSettingsService.updateTestArgs(wkspace.fsPath, Product.pytest, args);
        if (!installed) {
            // Check if Python Environments extension is available for enhanced installation flow
            if (this.pytestInstallationHelper.isEnvExtensionAvailable()) {
                traceInfo('pytest not installed, prompting user with environment extension integration');
                const installAttempted = await this.pytestInstallationHelper.promptToInstallPytest(wkspace);
                if (!installAttempted) {
                    // User chose to ignore or installation failed
                    return;
                }
            } else {
                // Fall back to traditional installer
                traceInfo('pytest not installed, falling back to traditional installer');
                await this.installer.install(Product.pytest);
            }
        }
    }

    private async getConfigFiles(rootDir: string): Promise<string[]> {
        const fs = this.serviceContainer.get<IFileSystem>(IFileSystem);
        const promises = ['pytest.ini', 'tox.ini', 'setup.cfg'].map(async (cfg) =>
            (await fs.fileExists(path.join(rootDir, cfg))) ? cfg : '',
        );
        const values = await Promise.all(promises);
        return values.filter((exists) => exists.length > 0);
    }
}
