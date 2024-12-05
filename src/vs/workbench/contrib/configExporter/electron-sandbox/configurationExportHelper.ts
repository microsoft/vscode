/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationNode, IConfigurationRegistry, Extensions, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

interface IExportedConfigurationNode {
	name: string;
	description: string;
	default: any;
	type?: string | string[];
	enum?: any[];
	enumDescriptions?: string[];
}

interface IConfigurationExport {
	settings: IExportedConfigurationNode[];
	buildTime: number;
	commit?: string;
	buildNumber?: number;
}

export class DefaultConfigurationExportHelper {

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService
	) {
		const exportDefaultConfigurationPath = environmentService.args['export-default-configuration'];
		if (exportDefaultConfigurationPath) {
			this.writeConfigModelAndQuit(URI.file(exportDefaultConfigurationPath));
		}
	}

	private async writeConfigModelAndQuit(target: URI): Promise<void> {
		try {
			await this.extensionService.whenInstalledExtensionsRegistered();
			await this.writeConfigModel(target);
		} finally {
			this.commandService.executeCommand('workbench.action.quit');
		}
	}

	private async writeConfigModel(target: URI): Promise<void> {
		const config = this.getConfigModel();

		const resultString = JSON.stringify(config, undefined, '  ');
		await this.fileService.writeFile(target, VSBuffer.fromString(resultString));
	}

	private getConfigModel(): IConfigurationExport {
		const configRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const configurations = configRegistry.getConfigurations().slice();
		const settings: IExportedConfigurationNode[] = [];
		const processedNames = new Set<string>();

		const processProperty = (name: string, prop: IConfigurationPropertySchema) => {
			if (processedNames.has(name)) {
				console.warn('Setting is registered twice: ' + name);
				return;
			}

			processedNames.add(name);
			const propDetails: IExportedConfigurationNode = {
				name,
				description: prop.description || prop.markdownDescription || '',
				default: prop.default,
				type: prop.type
			};

			if (prop.enum) {
				propDetails.enum = prop.enum;
			}

			if (prop.enumDescriptions || prop.markdownEnumDescriptions) {
				propDetails.enumDescriptions = prop.enumDescriptions || prop.markdownEnumDescriptions;
			}

			settings.push(propDetails);
		};

		const processConfig = (config: IConfigurationNode) => {
			if (config.properties) {
				for (const name in config.properties) {
					processProperty(name, config.properties[name]);
				}
			}

			config.allOf?.forEach(processConfig);
		};

		configurations.forEach(processConfig);

		const excludedProps = configRegistry.getExcludedConfigurationProperties();
		for (const name in excludedProps) {
			processProperty(name, excludedProps[name]);
		}

		const result: IConfigurationExport = {
			settings: settings.sort((a, b) => a.name.localeCompare(b.name)),
			buildTime: Date.now(),
			commit: this.productService.commit,
			buildNumber: this.productService.settingsSearchBuildId
		};

		return result;
	}
}
