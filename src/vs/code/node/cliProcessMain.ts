/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as path from 'path';

import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { IPager } from 'vs/base/common/paging';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionManifest, IGalleryExtension, LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService, validateLocalExtension } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { combinedAppender, NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { mkdirp, writeFile } from 'vs/base/node/pfs';
import { getBaseLabel } from 'vs/base/common/labels';
import { IStateService } from 'vs/platform/state/common/state';
import { StateService } from 'vs/platform/state/node/stateService';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { ILogService, getLogLevel } from 'vs/platform/log/common/log';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { CommandLineDialogService } from 'vs/platform/dialogs/node/dialogService';

const notFound = (id: string) => localize('notFound', "Extension '{0}' not found.", id);
const notInstalled = (id: string) => localize('notInstalled', "Extension '{0}' is not installed.", id);
const useId = localize('useId', "Make sure you use the full extension ID, including the publisher, eg: {0}", 'ms-vscode.csharp');

function getId(manifest: IExtensionManifest, withVersion?: boolean): string {
	if (withVersion) {
		return `${manifest.publisher}.${manifest.name}@${manifest.version}`;
	} else {
		return `${manifest.publisher}.${manifest.name}`;
	}
}

type Task = { (): TPromise<void> };

class Main {

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService
	) { }

	run(argv: ParsedArgs): TPromise<any> {
		// TODO@joao - make this contributable

		if (argv['install-source']) {
			return this.setInstallSource(argv['install-source']);
		} else if (argv['list-extensions']) {
			return this.listExtensions(argv['show-versions']);
		} else if (argv['install-extension']) {
			const arg = argv['install-extension'];
			const args: string[] = typeof arg === 'string' ? [arg] : arg;
			return this.installExtension(args);
		} else if (argv['uninstall-extension']) {
			const arg = argv['uninstall-extension'];
			const ids: string[] = typeof arg === 'string' ? [arg] : arg;
			return this.uninstallExtension(ids);
		}
		return undefined;
	}

	private setInstallSource(installSource: string): TPromise<any> {
		return writeFile(this.environmentService.installSourcePath, installSource.slice(0, 30));
	}

	private listExtensions(showVersions: boolean): TPromise<any> {
		return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
			extensions.forEach(e => console.log(getId(e.manifest, showVersions)));
		});
	}

	private installExtension(extensions: string[]): TPromise<any> {
		const vsixTasks: Task[] = extensions
			.filter(e => /\.vsix$/i.test(e))
			.map(id => () => {
				const extension = path.isAbsolute(id) ? id : path.join(process.cwd(), id);

				return this.extensionManagementService.install(extension).then(() => {
					console.log(localize('successVsixInstall', "Extension '{0}' was successfully installed!", getBaseLabel(extension)));
				}, error => {
					if (isPromiseCanceledError(error)) {
						console.log(localize('cancelVsixInstall', "Cancelled installing Extension '{0}'.", getBaseLabel(extension)));
						return null;
					} else {
						return TPromise.wrapError(error);
					}
				});
			});

		const galleryTasks: Task[] = extensions
			.filter(e => !/\.vsix$/i.test(e))
			.map(id => () => {
				return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(installed => {
					const isInstalled = installed.some(e => getId(e.manifest) === id);

					if (isInstalled) {
						console.log(localize('alreadyInstalled', "Extension '{0}' is already installed.", id));
						return TPromise.as(null);
					}

					return this.extensionGalleryService.query({ names: [id], source: 'cli' })
						.then<IPager<IGalleryExtension>>(null, err => {
							if (err.responseText) {
								try {
									const response = JSON.parse(err.responseText);
									return TPromise.wrapError(response.message);
								} catch (e) {
									// noop
								}
							}

							return TPromise.wrapError(err);
						})
						.then(result => {
							const [extension] = result.firstPage;

							if (!extension) {
								return TPromise.wrapError(new Error(`${notFound(id)}\n${useId}`));
							}

							console.log(localize('foundExtension', "Found '{0}' in the marketplace.", id));
							console.log(localize('installing', "Installing..."));

							return this.extensionManagementService.installFromGallery(extension)
								.then(
									() => console.log(localize('successInstall', "Extension '{0}' v{1} was successfully installed!", id, extension.version)),
									error => {
										if (isPromiseCanceledError(error)) {
											console.log(localize('cancelVsixInstall', "Cancelled installing Extension '{0}'.", id));
											return null;
										} else {
											return TPromise.wrapError(error);
										}
									});
						});
				});
			});

		return sequence([...vsixTasks, ...galleryTasks]);
	}

	private uninstallExtension(extensions: string[]): TPromise<any> {
		async function getExtensionId(extensionDescription: string): TPromise<string> {
			if (!/\.vsix$/i.test(extensionDescription)) {
				return extensionDescription;
			}

			const zipPath = path.isAbsolute(extensionDescription) ? extensionDescription : path.join(process.cwd(), extensionDescription);
			const manifest = await validateLocalExtension(zipPath);
			return getId(manifest);
		}

		return sequence(extensions.map(extension => () => {
			return getExtensionId(extension).then(id => {
				return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(installed => {
					const [extension] = installed.filter(e => getId(e.manifest) === id);

					if (!extension) {
						return TPromise.wrapError(new Error(`${notInstalled(id)}\n${useId}`));
					}

					console.log(localize('uninstalling', "Uninstalling {0}...", id));

					return this.extensionManagementService.uninstall(extension, true)
						.then(() => console.log(localize('successUninstall', "Extension '{0}' was successfully uninstalled!", id)));
				});
			});
		}));
	}
}

const eventPrefix = 'monacoworkbench';

export function main(argv: ParsedArgs): TPromise<void> {
	const services = new ServiceCollection();

	const environmentService = new EnvironmentService(argv, process.execPath);
	const logService = createSpdLogService('cli', getLogLevel(environmentService), environmentService.logsPath);
	process.once('exit', () => logService.dispose());

	logService.info('main', argv);

	services.set(IEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(IStateService, new SyncDescriptor(StateService));

	const instantiationService: IInstantiationService = new InstantiationService(services);

	return instantiationService.invokeFunction(accessor => {
		const envService = accessor.get(IEnvironmentService);
		const stateService = accessor.get(IStateService);

		return TPromise.join([envService.appSettingsHome, envService.extensionsPath].map(p => mkdirp(p))).then(() => {
			const { appRoot, extensionsPath, extensionDevelopmentPath, isBuilt, installSourcePath } = envService;

			const services = new ServiceCollection();
			services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
			services.set(IRequestService, new SyncDescriptor(RequestService));
			services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
			services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
			services.set(IDialogService, new SyncDescriptor(CommandLineDialogService));

			if (isBuilt && !extensionDevelopmentPath && !envService.args['disable-telemetry'] && product.enableTelemetry) {
				const appenders: AppInsightsAppender[] = [];

				if (product.aiConfig && product.aiConfig.asimovKey) {
					appenders.push(new AppInsightsAppender(eventPrefix, null, product.aiConfig.asimovKey));
				}

				// It is important to dispose the AI adapter properly because
				// only then they flush remaining data.
				process.once('exit', () => appenders.forEach(a => a.dispose()));

				const config: ITelemetryServiceConfig = {
					appender: combinedAppender(...appenders),
					commonProperties: resolveCommonProperties(product.commit, pkg.version, stateService.getItem('telemetry.machineId'), installSourcePath),
					piiPaths: [appRoot, extensionsPath]
				};

				services.set(ITelemetryService, new SyncDescriptor(TelemetryService, config));
			} else {
				services.set(ITelemetryService, NullTelemetryService);
			}

			const instantiationService2 = instantiationService.createChild(services);
			const main = instantiationService2.createInstance(Main);

			return main.run(argv);
		});
	});
}
