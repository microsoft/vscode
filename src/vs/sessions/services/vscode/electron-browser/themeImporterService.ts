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
import { IExtensionManagementService, ILocalExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionsScannerService } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionType, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchThemeService } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IThemeImporterService, IThemePreviewResult, COLOR_THEME_SETTINGS_ID } from '../common/themeImporter.js';
import { INativeWorkbenchEnvironmentService } from '../../../../workbench/services/environment/electron-browser/environmentService.js';

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

class ThemeImporterService extends Disposable implements IThemeImporterService {

	declare readonly _serviceBrand: undefined;

	private _parentThemePromise: Promise<IParentThemeInfo | undefined> | undefined;
	private _previewPromise: Promise<IThemePreviewResult | undefined> | undefined;

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
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

	async previewVSCodeTheme(): Promise<IThemePreviewResult | undefined> {
		if (!this._previewPromise) {
			this._previewPromise = this._doPreview();
			// Clear cache if preview resolved to undefined so callers can retry
			this._previewPromise.then(result => {
				if (!result) {
					this._previewPromise = undefined;
				}
			});
		}
		return this._previewPromise;
	}

	private async _doPreview(): Promise<IThemePreviewResult | undefined> {
		try {
			const theme = await this._getVSCodeTheme();
			if (!theme) {
				return undefined;
			}

			const installed = await this._installFromHostLocation(theme);
			await this._setTheme(theme.settingsId);

			return {
				apply: () => this._apply(theme),
				reset: () => {
					this._previewPromise = undefined;
					return this._reset(installed);
				},
			};
		} catch (err) {
			this.logService.error('[VSCodeThemeImporter] Failed to preview theme:', err);
			return undefined;
		}
	}

	private async _apply(theme: IParentThemeInfo): Promise<void> {
		try {
			if (!theme.extensionLocation) {
				return;
			}

			// Copy extension to Agents app's own extensions directory
			const extensionsHome = URI.file(this.environmentService.extensionsPath);
			const folderName = theme.extensionLocation.path.split('/').pop()!;
			const targetLocation = joinPath(extensionsHome, folderName);

			this.logService.info(`[VSCodeThemeImporter] Copying extension to ${targetLocation.toString()}`);
			await this.fileService.copy(theme.extensionLocation, targetLocation, true);

			// Replace install from the copied location
			const profileLocation = this.userDataProfileService.currentProfile.extensionsResource;
			await this.extensionManagementService.installFromLocation(targetLocation, profileLocation);
		} catch (err) {
			this.logService.error('[VSCodeThemeImporter] Failed to apply theme:', err);
		}
	}

	private async _reset(installed: ILocalExtension | undefined): Promise<void> {
		if (!installed) {
			return;
		}
		try {
			const profileLocation = this.userDataProfileService.currentProfile.extensionsResource;
			await this.extensionManagementService.uninstall(installed, { profileLocation });
		} catch (err) {
			this.logService.warn('[VSCodeThemeImporter] Failed to uninstall preview extension:', err);
		}
	}

	private async _getVSCodeTheme(): Promise<IParentThemeInfo | undefined> {
		if (!this._parentThemePromise) {
			this._parentThemePromise = this._resolveVSCodeTheme();
		}
		return this._parentThemePromise;
	}

	/**
	 * Installs the extension from the host's extensions directory if needed.
	 * Returns the installed extension, or `undefined` if no install was needed.
	 */
	private async _installFromHostLocation(theme: IParentThemeInfo): Promise<ILocalExtension | undefined> {
		if (!theme.extensionLocation) {
			return undefined;
		}
		this.logService.info(`[VSCodeThemeImporter] Installing extension from ${theme.extensionLocation.toString()}`);
		const profileLocation = this.userDataProfileService.currentProfile.extensionsResource;
		return this.extensionManagementService.installFromLocation(theme.extensionLocation, profileLocation);
	}

	private async _setTheme(themeSettingsId: string): Promise<void> {
		const allThemes = await this.themeService.getColorThemes();
		const match = allThemes.find(t => t.settingsId === themeSettingsId);
		if (match) {
			await this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
		} else {
			this.logService.warn(`[VSCodeThemeImporter] Theme ${themeSettingsId} not found after install`);
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

		const hostExtensionsHome = this.environmentService.parentAppExtensionsHome;
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
			const theme = t as { id?: string; label?: string };
			return theme.id === themeSettingsId || theme.label === themeSettingsId;
		});
	}

	private async _readVSCodeThemeId(): Promise<string | undefined> {
		const hostDataHome = this.environmentService.parentAppUserRoamingDataHome;
		if (!hostDataHome) {
			this.logService.warn('[VSCodeThemeImporter] Host user data home is not available');
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
			this.logService.warn('[VSCodeThemeImporter] workbench.colorTheme is not set in host settings.json', themeId, settingsUri.toString());
			return undefined;
		} catch (e) {
			this.logService.warn('[VSCodeThemeImporter] Failed to read host settings.json, falling back to default theme', getErrorMessage(e));
			return undefined;
		}
	}
}

registerSingleton(IThemeImporterService, ThemeImporterService, InstantiationType.Delayed);
