/* eslint-disable max-classes-per-file */

import { inject, injectable } from 'inversify';
import * as semver from 'semver';
import { CancellationToken, l10n, Uri } from 'vscode';
import '../extensions';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { EnvironmentType, ModuleInstallerType, PythonEnvironment } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IApplicationShell, IWorkspaceService } from '../application/types';
import { IProcessServiceFactory, IPythonExecutionFactory } from '../process/types';
import {
    IConfigurationService,
    IInstaller,
    InstallerResponse,
    IPersistentStateFactory,
    ProductInstallStatus,
    Product,
    ProductType,
} from '../types';
import { Common } from '../utils/localize';
import { isResource, noop } from '../utils/misc';
import { translateProductToModule } from './moduleInstaller';
import { ProductNames } from './productNames';
import {
    IBaseInstaller,
    IInstallationChannelManager,
    IModuleInstaller,
    InstallOptions,
    InterpreterUri,
    IProductPathService,
    IProductService,
    ModuleInstallFlags,
} from './types';
import { traceError, traceInfo } from '../../logging';
import { isParentPath } from '../platform/fs-paths';

export { Product } from '../types';

// Products which may not be available to install from certain package registries, keyed by product name
// Installer implementations can check this to determine a suitable installation channel for a product
// This is temporary and can be removed when https://github.com/microsoft/vscode-jupyter/issues/5034 is unblocked
const UnsupportedChannelsForProduct = new Map<Product, Set<EnvironmentType>>([
    [Product.torchProfilerInstallName, new Set([EnvironmentType.Conda, EnvironmentType.Pixi])],
]);

abstract class BaseInstaller implements IBaseInstaller {
    private static readonly PromptPromises = new Map<string, Promise<InstallerResponse>>();

    protected readonly appShell: IApplicationShell;

    protected readonly configService: IConfigurationService;

    protected readonly workspaceService: IWorkspaceService;

    private readonly productService: IProductService;

    protected readonly persistentStateFactory: IPersistentStateFactory;

    constructor(protected serviceContainer: IServiceContainer) {
        this.appShell = serviceContainer.get<IApplicationShell>(IApplicationShell);
        this.configService = serviceContainer.get<IConfigurationService>(IConfigurationService);
        this.workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        this.productService = serviceContainer.get<IProductService>(IProductService);
        this.persistentStateFactory = serviceContainer.get<IPersistentStateFactory>(IPersistentStateFactory);
    }

    public promptToInstall(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        // If this method gets called twice, while previous promise has not been resolved, then return that same promise.
        // E.g. previous promise is not resolved as a message has been displayed to the user, so no point displaying
        // another message.
        const workspaceFolder =
            resource && isResource(resource) ? this.workspaceService.getWorkspaceFolder(resource) : undefined;
        const key = `${product}${workspaceFolder ? workspaceFolder.uri.fsPath : ''}`;
        if (BaseInstaller.PromptPromises.has(key)) {
            return BaseInstaller.PromptPromises.get(key)!;
        }
        const promise = this.promptToInstallImplementation(product, resource, cancel, flags);
        BaseInstaller.PromptPromises.set(key, promise);
        promise.then(() => BaseInstaller.PromptPromises.delete(key)).ignoreErrors();
        promise.catch(() => BaseInstaller.PromptPromises.delete(key)).ignoreErrors();

        return promise;
    }

    public async install(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<InstallerResponse> {
        if (product === Product.unittest) {
            return InstallerResponse.Installed;
        }

        const channels = this.serviceContainer.get<IInstallationChannelManager>(IInstallationChannelManager);
        const installer = await channels.getInstallationChannel(product, resource);
        if (!installer) {
            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: 'unavailable',
                productName: ProductNames.get(product),
            });
            return InstallerResponse.Ignore;
        }

        await installer
            .installModule(product, resource, cancel, flags, options)
            .catch((ex) => traceError(`Error in installing the product '${ProductNames.get(product)}', ${ex}`));

        return this.isInstalled(product, resource).then((isInstalled) => {
            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: installer.displayName,
                productName: ProductNames.get(product),
                isInstalled,
            });
            return isInstalled ? InstallerResponse.Installed : InstallerResponse.Ignore;
        });
    }

    /**
     *
     * @param product A product which supports SemVer versioning.
     * @param semVerRequirement A SemVer version requirement.
     * @param resource A URI or a PythonEnvironment.
     */
    public async isProductVersionCompatible(
        product: Product,
        semVerRequirement: string,
        resource?: InterpreterUri,
    ): Promise<ProductInstallStatus> {
        const version = await this.getProductSemVer(product, resource);
        if (!version) {
            return ProductInstallStatus.NotInstalled;
        }
        if (semver.satisfies(version, semVerRequirement)) {
            return ProductInstallStatus.Installed;
        }
        return ProductInstallStatus.NeedsUpgrade;
    }

    /**
     *
     * @param product A product which supports SemVer versioning.
     * @param resource A URI or a PythonEnvironment.
     */
    private async getProductSemVer(product: Product, resource: InterpreterUri): Promise<semver.SemVer | null> {
        const interpreter = isResource(resource) ? undefined : resource;
        const uri = isResource(resource) ? resource : undefined;
        const executableName = this.getExecutableNameFromSettings(product, uri);

        const isModule = this.isExecutableAModule(product, uri);

        let version;
        if (isModule) {
            const pythonProcess = await this.serviceContainer
                .get<IPythonExecutionFactory>(IPythonExecutionFactory)
                .createActivatedEnvironment({ resource: uri, interpreter, allowEnvironmentFetchExceptions: true });
            version = await pythonProcess.getModuleVersion(executableName);
        } else {
            const process = await this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory).create(uri);
            const result = await process.exec(executableName, ['--version'], { mergeStdOutErr: true });
            version = result.stdout.trim();
        }
        if (!version) {
            return null;
        }
        try {
            return semver.coerce(version);
        } catch (e) {
            traceError(`Unable to parse version ${version} for product ${product}: `, e);
            return null;
        }
    }

    public async isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean> {
        if (product === Product.unittest) {
            return true;
        }
        // User may have customized the module name or provided the fully qualified path.
        const interpreter = isResource(resource) ? undefined : resource;
        const uri = isResource(resource) ? resource : undefined;
        const executableName = this.getExecutableNameFromSettings(product, uri);

        const isModule = this.isExecutableAModule(product, uri);
        if (isModule) {
            const pythonProcess = await this.serviceContainer
                .get<IPythonExecutionFactory>(IPythonExecutionFactory)
                .createActivatedEnvironment({ resource: uri, interpreter, allowEnvironmentFetchExceptions: true });
            return pythonProcess.isModuleInstalled(executableName);
        }
        const process = await this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory).create(uri);
        return process
            .exec(executableName, ['--version'], { mergeStdOutErr: true })
            .then(() => true)
            .catch(() => false);
    }

    protected abstract promptToInstallImplementation(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse>;

    protected getExecutableNameFromSettings(product: Product, resource?: Uri): string {
        const productType = this.productService.getProductType(product);
        const productPathService = this.serviceContainer.get<IProductPathService>(IProductPathService, productType);
        return productPathService.getExecutableNameFromSettings(product, resource);
    }

    protected isExecutableAModule(product: Product, resource?: Uri): boolean {
        const productType = this.productService.getProductType(product);
        const productPathService = this.serviceContainer.get<IProductPathService>(IProductPathService, productType);
        return productPathService.isExecutableAModule(product, resource);
    }
}

export class TestFrameworkInstaller extends BaseInstaller {
    protected async promptToInstallImplementation(
        product: Product,
        resource?: Uri,
        cancel?: CancellationToken,
        _flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        const productName = ProductNames.get(product)!;

        const options: string[] = [];
        let message = l10n.t('Test framework {0} is not installed. Install?', productName);
        if (this.isExecutableAModule(product, resource)) {
            options.push(...[Common.bannerLabelYes, Common.bannerLabelNo]);
        } else {
            const executable = this.getExecutableNameFromSettings(product, resource);
            message = l10n.t('Path to the {0} test framework is invalid ({1})', productName, executable);
        }

        const item = await this.appShell.showErrorMessage(message, ...options);
        return item === Common.bannerLabelYes ? this.install(product, resource, cancel) : InstallerResponse.Ignore;
    }
}

export class DataScienceInstaller extends BaseInstaller {
    // Override base installer to support a more DS-friendly streamlined installation.
    public async install(
        product: Product,
        interpreterUri?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        // Precondition
        if (isResource(interpreterUri)) {
            throw new Error('All data science packages require an interpreter be passed in');
        }

        // At this point we know that `interpreterUri` is of type PythonInterpreter
        const interpreter = interpreterUri as PythonEnvironment;

        // Get a list of known installation channels, pip, conda, etc.
        let channels: IModuleInstaller[] = await this.serviceContainer
            .get<IInstallationChannelManager>(IInstallationChannelManager)
            .getInstallationChannels(interpreter);

        // Pick an installerModule based on whether the interpreter is conda or not. Default is pip.
        const moduleName = translateProductToModule(product);
        const version = `${interpreter.version?.major || ''}.${interpreter.version?.minor || ''}.${
            interpreter.version?.patch || ''
        }`;

        // If this is a non-conda environment & pip isn't installed, we need to install pip.
        // The prompt would have been disabled prior to this point, so we can assume that.
        if (
            flags &&
            flags & ModuleInstallFlags.installPipIfRequired &&
            interpreter.envType !== EnvironmentType.Conda &&
            !channels.some((channel) => channel.type === ModuleInstallerType.Pip)
        ) {
            const installers = this.serviceContainer.getAll<IModuleInstaller>(IModuleInstaller);
            const pipInstaller = installers.find((installer) => installer.type === ModuleInstallerType.Pip);
            if (pipInstaller) {
                traceInfo(`Installing pip as its not available to install ${moduleName}.`);
                await pipInstaller
                    .installModule(Product.pip, interpreter, cancel)
                    .catch((ex) =>
                        traceError(
                            `Error in installing the module '${moduleName} as Pip could not be installed', ${ex}`,
                        ),
                    );

                await this.isInstalled(Product.pip, interpreter)
                    .then((isInstalled) => {
                        sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                            installer: pipInstaller.displayName,
                            requiredInstaller: ModuleInstallerType.Pip,
                            version,
                            envType: interpreter.envType,
                            isInstalled,
                            productName: ProductNames.get(Product.pip),
                        });
                    })
                    .catch(noop);

                // Refresh the list of channels (pip may be avaialble now).
                channels = await this.serviceContainer
                    .get<IInstallationChannelManager>(IInstallationChannelManager)
                    .getInstallationChannels(interpreter);
            } else {
                sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                    installer: 'unavailable',
                    requiredInstaller: ModuleInstallerType.Pip,
                    productName: ProductNames.get(Product.pip),
                    version,
                    envType: interpreter.envType,
                });
                traceError(`Unable to install pip when its required.`);
            }
        }

        const isAvailableThroughConda = !UnsupportedChannelsForProduct.get(product)?.has(EnvironmentType.Conda);
        let requiredInstaller = ModuleInstallerType.Unknown;
        if (interpreter.envType === EnvironmentType.Conda && isAvailableThroughConda) {
            requiredInstaller = ModuleInstallerType.Conda;
        } else if (interpreter.envType === EnvironmentType.Conda && !isAvailableThroughConda) {
            // This case is temporary and can be removed when https://github.com/microsoft/vscode-jupyter/issues/5034 is unblocked
            traceInfo(
                `Interpreter type is conda but package ${moduleName} is not available through conda, using pip instead.`,
            );
            requiredInstaller = ModuleInstallerType.Pip;
        } else {
            switch (interpreter.envType) {
                case EnvironmentType.Pipenv:
                    requiredInstaller = ModuleInstallerType.Pipenv;
                    break;
                case EnvironmentType.Poetry:
                    requiredInstaller = ModuleInstallerType.Poetry;
                    break;
                default:
                    requiredInstaller = ModuleInstallerType.Pip;
            }
        }
        const installerModule: IModuleInstaller | undefined = channels.find((v) => v.type === requiredInstaller);

        if (!installerModule) {
            this.appShell
                .showErrorMessage(
                    l10n.t(
                        'Could not install {0}. If pip is not available, please use the package manager of your choice to manually install this library into your Python environment.',
                        moduleName,
                    ),
                )
                .then(noop, noop);
            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: 'unavailable',
                requiredInstaller,
                productName: ProductNames.get(product),
                version,
                envType: interpreter.envType,
            });
            return InstallerResponse.Ignore;
        }

        await installerModule
            .installModule(product, interpreter, cancel, flags)
            .catch((ex) => traceError(`Error in installing the module '${moduleName}', ${ex}`));

        return this.isInstalled(product, interpreter).then((isInstalled) => {
            sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
                installer: installerModule.displayName || '',
                requiredInstaller,
                version,
                envType: interpreter.envType,
                isInstalled,
                productName: ProductNames.get(product),
            });
            return isInstalled ? InstallerResponse.Installed : InstallerResponse.Ignore;
        });
    }

    /**
     * This method will not get invoked for Jupyter extension.
     * Implemented as a backup.
     */
    protected async promptToInstallImplementation(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        _flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        const productName = ProductNames.get(product)!;
        const item = await this.appShell.showErrorMessage(
            l10n.t('Data Science library {0} is not installed. Install?', productName),
            Common.bannerLabelYes,
            Common.bannerLabelNo,
        );
        if (item === Common.bannerLabelYes) {
            return this.install(product, resource, cancel);
        }
        return InstallerResponse.Ignore;
    }
}

export class PythonInstaller implements IBaseInstaller {
    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {}

    public async isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean> {
        if (product !== Product.python) {
            throw new Error(`${product} cannot be installed via conda python installer`);
        }
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const environment = isResource(resource) ? await interpreterService.getActiveInterpreter(resource) : resource;
        if (!environment) {
            return true;
        }
        if (
            environment.envPath?.length &&
            environment.envType === EnvironmentType.Conda &&
            !isParentPath(environment?.path, environment.envPath)
        ) {
            return false;
        }
        return true;
    }

    public async install(
        product: Product,
        resource?: InterpreterUri,
        _cancel?: CancellationToken,
        _flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        if (product !== Product.python) {
            throw new Error(`${product} cannot be installed via python installer`);
        }
        // Active interpreter is a conda environment which does not contain python, hence install it.
        const installers = this.serviceContainer.getAll<IModuleInstaller>(IModuleInstaller);
        const condaInstaller = installers.find((installer) => installer.type === ModuleInstallerType.Conda);
        if (!condaInstaller || !(await condaInstaller.isSupported(resource))) {
            traceError('Conda installer not available for installing python in the given environment');
            return InstallerResponse.Ignore;
        }
        const moduleName = translateProductToModule(product);
        await condaInstaller
            .installModule(Product.python, resource, undefined, undefined, { installAsProcess: true })
            .catch((ex) => traceError(`Error in installing the module '${moduleName}', ${ex}`));
        return this.isInstalled(product, resource).then((isInstalled) =>
            isInstalled ? InstallerResponse.Installed : InstallerResponse.Ignore,
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public async promptToInstall(
        _product: Product,
        _resource?: InterpreterUri,
        _cancel?: CancellationToken,
        _flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        // This package is installed directly without any prompt.
        return InstallerResponse.Ignore;
    }

    // eslint-disable-next-line class-methods-use-this
    public async isProductVersionCompatible(
        _product: Product,
        _semVerRequirement: string,
        _resource?: InterpreterUri,
    ): Promise<ProductInstallStatus> {
        return ProductInstallStatus.Installed;
    }
}

@injectable()
export class ProductInstaller implements IInstaller {
    private readonly productService: IProductService;

    private interpreterService: IInterpreterService;

    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {
        this.productService = serviceContainer.get<IProductService>(IProductService);
        this.interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
    }

    public dispose(): void {
        /** Do nothing. */
    }

    public async promptToInstall(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse> {
        const currentInterpreter = isResource(resource)
            ? await this.interpreterService.getActiveInterpreter(resource)
            : resource;
        if (!currentInterpreter) {
            return InstallerResponse.Ignore;
        }
        return this.createInstaller(product).promptToInstall(product, resource, cancel, flags);
    }

    public async isProductVersionCompatible(
        product: Product,
        semVerRequirement: string,
        resource?: InterpreterUri,
    ): Promise<ProductInstallStatus> {
        return this.createInstaller(product).isProductVersionCompatible(product, semVerRequirement, resource);
    }

    public async install(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
        options?: InstallOptions,
    ): Promise<InstallerResponse> {
        return this.createInstaller(product).install(product, resource, cancel, flags, options);
    }

    public async isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean> {
        return this.createInstaller(product).isInstalled(product, resource);
    }

    // eslint-disable-next-line class-methods-use-this
    public translateProductToModuleName(product: Product): string {
        return translateProductToModule(product);
    }

    private createInstaller(product: Product): IBaseInstaller {
        const productType = this.productService.getProductType(product);
        switch (productType) {
            case ProductType.TestFramework:
                return new TestFrameworkInstaller(this.serviceContainer);
            case ProductType.DataScience:
                return new DataScienceInstaller(this.serviceContainer);
            case ProductType.Python:
                return new PythonInstaller(this.serviceContainer);
            default:
                break;
        }
        throw new Error(`Unknown product ${product}`);
    }
}
