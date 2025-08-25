import { injectable, inject } from 'inversify';
import { IExtensionSingleActivationService } from '../../../activation/types';
import { Commands } from '../../constants';
import { ICommandManager } from '../types';
import { IDisposableRegistry } from '../../types';
import { IInstallationChannelManager, ModuleInstallFlags } from '../../installer/types';
import { Product } from '../../types';

@injectable()
export class InstallPackagesCommandHandler implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };

    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IInstallationChannelManager) private readonly channelManager: IInstallationChannelManager,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}

    public async activate(): Promise<void> {
        this.disposables.push(
            this.commandManager.registerCommand(Commands.InstallPackages, this.installPackages, this),
        );
    }

    public async installPackages(packages: string[]): Promise<string[]> {
        if (!packages || packages.length === 0) {
            throw new Error('[VALIDATION_ERROR] At least one package name must be provided');
        }

        const invalidPackages = packages.filter((pkg) => !pkg || typeof pkg !== 'string' || pkg.trim().length === 0);
        if (invalidPackages.length > 0) {
            throw new Error('[VALIDATION_ERROR] All package names must be non-empty strings');
        }
        const results: string[] = [];

        const installer = await this.channelManager.getInstallationChannel(Product.pip, undefined);
        if (!installer) {
            throw new Error('[NO_INSTALLER] No compatible package installer found for current environment');
        }

        for (const packageName of packages) {
            try {
                await installer.installModule(packageName, undefined, undefined, ModuleInstallFlags.none, {
                    waitForCompletion: true,
                });
                results.push(`${packageName} installed successfully using ${installer.displayName}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push(`${packageName}: Installation failed - ${errorMsg}`);
            }
        }

        return results;
    }
}
