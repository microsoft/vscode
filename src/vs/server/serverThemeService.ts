/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { locale } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { RemoteAgentEnvironmentChannel } from 'vs/server/remoteAgentEnvironmentImpl';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { ExtensionMessageCollector, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { ThemeConfiguration } from 'vs/workbench/services/themes/common/themeConfiguration';
import { registerColorThemeExtensionPoint, ThemeRegistry } from 'vs/workbench/services/themes/common/themeExtensionPoints';
import { IThemeExtensionPoint } from 'vs/workbench/services/themes/common/workbenchThemeService';

export interface IServerThemeService {
	fetchColorThemeData(): Promise<ColorThemeData>;
	readyPromise: Promise<void>;
}

export const IServerThemeService = createDecorator<IServerThemeService>('IServerThemeService');
let colorThemesExtPoint: IExtensionPoint<IThemeExtensionPoint[]>;
let colorThemeRegistry: ThemeRegistry<ColorThemeData>;

/** Wrapped to avoid Jest instance issues. */
try {
	colorThemesExtPoint = registerColorThemeExtensionPoint();
	colorThemeRegistry = new ThemeRegistry(colorThemesExtPoint, ColorThemeData.fromExtensionTheme);
} catch (error) {
	if (error instanceof Error && error.message.includes('Handler already set')) {
		// Disregard
	}
	throw error;
}

const extPointName = colorThemesExtPoint.name;

/**
 * The server theme service allows for limited and readonly access to theme resources.
 * @remark This is not yet as robust as `WorkbenchThemeService`
 */
export class ServerThemeService implements IServerThemeService {
	private logPrefix = '[Theme Service]';
	private machineThemeConfiguration = new ThemeConfiguration(this.machineConfigurationService);
	public readyPromise: Promise<void>;

	constructor (
		private logService: ILogService,
		private machineConfigurationService: IConfigurationService,
		private extensionScannerService: RemoteAgentEnvironmentChannel,
		private extensionResourceLoaderService: IExtensionResourceLoaderService,
	) {

		this.readyPromise = new Promise<void>(resolve => {
			this.refreshThemeExtensions().then(resolve);
		});
	}

	async refreshThemeExtensions(): Promise<void> {
		const availableExtensions = await this.extensionScannerService._scanExtensions(locale || 'en-us');

		this.logService.debug(this.logPrefix, 'Scanning for theme extension...');

		const users: IExtensionPointUser<IThemeExtensionPoint[]>[] = availableExtensions
			.filter(desc => {
				return desc.contributes && Object.hasOwnProperty.call(desc.contributes, extPointName);
			})
			.map(desc => {
				this.logService.debug(this.logPrefix, desc.name);

				return {
					description: desc,
					value: desc.contributes![extPointName as keyof typeof desc.contributes] as IThemeExtensionPoint[],
					collector: new ExtensionMessageCollector(() => { }, desc, extPointName)
				};
			});

		colorThemesExtPoint.acceptUsers(users);
	}

	/**
	 * Returns the color data from a user's currently active theme.
	 * @remark If the theme is not found, a default will be provided.
	 */
	async fetchColorThemeData(): Promise<ColorThemeData> {
		const machineThemeId = this.machineThemeConfiguration.colorTheme;

		this.logService.debug(this.logPrefix, `Attempting to find user's active theme: ${machineThemeId}`);

		let theme = colorThemeRegistry.findThemeBySettingsId(machineThemeId);

		if (!theme) {
			this.logService.warn(`User's active theme not found the registry. Was it mispelled or uninstalled?`);

			theme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.LIGHT);
		}

		await theme.ensureLoaded(this.extensionResourceLoaderService);

		return theme;
	}
}

export class ExtensionResourceLoaderService implements IExtensionResourceLoaderService {
	declare readonly _serviceBrand: undefined;
	public supportsExtensionGalleryResources = false;

	constructor (
		@IFileService private readonly _fileService: IFileService
	) { }

	async readExtensionResource(uri: URI): Promise<string> {
		const result = await this._fileService.readFile(uri);
		return result.value.toString();
	}

	getExtensionGalleryResourceURL(galleryExtension: { publisher: string, name: string, version: string }, path?: string): undefined {
		return;
	}
}
