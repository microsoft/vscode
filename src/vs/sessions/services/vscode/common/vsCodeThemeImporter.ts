/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../../base/common/jsonc.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionsScannerService } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionType, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchThemeService } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';

/** The VS Code configuration key for the active color theme. */
export const COLOR_THEME_SETTINGS_ID = 'workbench.colorTheme';

/**
 * Service that reads the parent VS Code installation's active color theme
 * and can import it into the Agents app — installing the providing extension
 * from the gallery if necessary.
 */
export interface IVSCodeThemeImporterService {

	readonly _serviceBrand: undefined;

	/**
	 * Resolves the parent VS Code's active color theme. Returns `undefined`
	 * when the parent settings cannot be read or the theme is already one of
	 * the onboarding themes displayed in the theme picker.
	 */
	getVSCodeTheme(): Promise<string | undefined>;

	/**
	 * Imports the VS Code theme into the Agents app.
	 */
	importVSCodeTheme(): Promise<void>;
}

export const IVSCodeThemeImporterService = createDecorator<IVSCodeThemeImporterService>('vsCodeThemeImporterService');

/**
 * Describes a color theme from the parent VS Code installation.
 */
interface IParentThemeInfo {
	/** The settingsId of the theme (e.g. "Dark Modern", "Monokai"). */
	readonly settingsId: string;
	/**
	 * The location of the extension that provides this theme.
	 * `undefined` when the theme is already available (built-in or installed).
	 */
	readonly extensionLocation: URI | undefined;
}

export class VSCodeThemeImporterService extends Disposable implements IVSCodeThemeImporterService {

	declare readonly _serviceBrand: undefined;

	private _parentThemePromise: Promise<IParentThemeInfo | undefined> | undefined;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
	) {
		super();
	}

	async getVSCodeTheme(): Promise<string | undefined> {
		if (!this._parentThemePromise) {
			this._parentThemePromise = this._resolveVSCodeTheme();
		}
		const themeInfo = await this._parentThemePromise;
		return themeInfo?.settingsId;
	}

	async importVSCodeTheme(): Promise<void> {
		try {
			if (!this._parentThemePromise) {
				this._parentThemePromise = this._resolveVSCodeTheme();
			}
			const theme = await this._parentThemePromise;
			if (!theme) {
				return;
			}

			// Install the extension from the host's extensions directory if needed
			if (theme.extensionLocation) {
				this.logService.info(`[VSCodeThemeImporter] Installing extension from ${theme.extensionLocation.toString()}`);
				const profileLocation = this.userDataProfileService.currentProfile.extensionsResource;
				await this.extensionManagementService.installFromLocation(theme.extensionLocation, profileLocation);
			}

			// Apply the theme
			const allThemes = await this.themeService.getColorThemes();
			const match = allThemes.find(t => t.settingsId === theme.settingsId);
			if (match) {
				await this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
				return;
			}

			this.logService.warn(`[VSCodeThemeImporter] Theme ${theme.settingsId} not found after import`);
		} catch (err) {
			this.logService.error(`[VSCodeThemeImporter] Failed to import theme:`, err);
		}
	}

	private async _resolveVSCodeTheme(): Promise<IParentThemeInfo | undefined> {
		try {
			const settingsId = await this._readVSCodeThemeId();
			if (!settingsId) {
				return undefined;
			}

			// Find the extension providing this theme by scanning the host's extensions
			const extensionLocation = await this._findThemeExtension(settingsId);

			return { settingsId, extensionLocation };
		} catch (err) {
			this.logService.warn('[VSCodeThemeImporter] Failed to resolve VS Code theme:', err);
			return undefined;
		}
	}

	/**
	 * Scans the host VS Code's extensions directory to find which extension
	 * provides the given theme. Returns the extension location URI, or
	 * `undefined` if the theme is already available (built-in or installed).
	 */
	private async _findThemeExtension(themeSettingsId: string): Promise<URI | undefined> {
		const allThemes = await this.themeService.getColorThemes();
		if (allThemes.find(t => t.settingsId === themeSettingsId)) {
			return undefined;
		}

		const hostExtensionsHome = this.environmentService.hostExtensionsHome;
		if (!hostExtensionsHome) {
			return undefined;
		}

		try {
			const scanned = await this.extensionsScannerService.scanOneOrMultipleExtensions(
				hostExtensionsHome,
				ExtensionType.User,
				{},
			);
			for (const ext of scanned) {
				if (this._extensionProvidesTheme(ext.manifest, themeSettingsId)) {
					return ext.location;
				}
			}
		} catch (err) {
			this.logService.warn('[VSCodeThemeImporter] Failed to scan host extensions:', err);
		}

		return undefined;
	}

	private _extensionProvidesTheme(manifest: IExtensionManifest, themeSettingsId: string): boolean {
		const themes = manifest.contributes?.themes;
		if (!Array.isArray(themes)) {
			return false;
		}
		return themes.some(t => {
			const id = (t as { id?: string; label?: string }).id ?? (t as { label?: string }).label;
			return id === themeSettingsId;
		});
	}

	private async _readVSCodeThemeId(): Promise<string | undefined> {
		const hostDataHome = this.environmentService.hostUserRoamingDataHome;
		if (!hostDataHome) {
			return undefined;
		}

		try {
			const settingsUri = joinPath(hostDataHome, 'settings.json');
			const content = await this.fileService.readFile(settingsUri);
			const settings = parseJSONC<Record<string, unknown>>(content.value.toString());
			const themeId = settings[COLOR_THEME_SETTINGS_ID];
			if (typeof themeId === 'string') {
				return themeId;
			}
			this.logService.warn('[VSCodeThemeImporter] workbench.colorTheme is not set in host settings.json', themeId);
			return undefined;
		} catch (e) {
			this.logService.warn('[VSCodeThemeImporter] Failed to read host settings.json, falling back to default theme', getErrorMessage(e));
			return undefined;
		}
	}
}

registerSingleton(IVSCodeThemeImporterService, VSCodeThemeImporterService, InstantiationType.Delayed);
