/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService, IWorkbenchColorTheme, IWorkbenchFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, ThemeSettings } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as errors from 'vs/base/common/errors';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { IColorTheme, Extensions as ThemingExtensions, IThemingRegistry, ThemeType, LIGHT, DARK, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { registerFileIconThemeSchemas } from 'vs/workbench/services/themes/common/fileIconThemeSchema';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FileIconThemeData } from 'vs/workbench/services/themes/browser/fileIconThemeData';
import { removeClasses, addClasses } from 'vs/base/browser/dom';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { registerColorThemeSchemas } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { ThemeRegistry, registerColorThemeExtensionPoint, registerFileIconThemeExtensionPoint } from 'vs/workbench/services/themes/common/themeExtensionPoints';
import { updateColorThemeConfigurationSchemas, updateFileIconThemeConfigurationSchemas, ThemeConfiguration } from 'vs/workbench/services/themes/common/themeConfiguration';

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';
const PERSISTED_ICON_THEME_STORAGE_KEY = 'iconThemeData';
const PERSISTED_OS_COLOR_SCHEME = 'osColorScheme';

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

const DEFAULT_ICON_THEME_ID = 'vscode.vscode-theme-seti-vs-seti';
const fileIconsEnabledClass = 'file-icons-enabled';

const colorThemeRulesClassName = 'contributedColorTheme';
const iconThemeRulesClassName = 'contributedIconTheme';

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);

function validateThemeId(theme: string): string {
	// migrations
	switch (theme) {
		case VS_LIGHT_THEME: return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
		case VS_DARK_THEME: return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
		case VS_HC_THEME: return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
		case `vs ${oldDefaultThemeExtensionId}-themes-light_plus-tmTheme`: return `vs ${defaultThemeExtensionId}-themes-light_plus-json`;
		case `vs-dark ${oldDefaultThemeExtensionId}-themes-dark_plus-tmTheme`: return `vs-dark ${defaultThemeExtensionId}-themes-dark_plus-json`;
	}
	return theme;
}

const colorThemesExtPoint = registerColorThemeExtensionPoint();
const fileIconThemesExtPoint = registerFileIconThemeExtensionPoint();

export class WorkbenchThemeService implements IWorkbenchThemeService {
	_serviceBrand: undefined;

	private readonly colorThemeRegistry: ThemeRegistry<ColorThemeData>;
	private currentColorTheme: ColorThemeData;
	private readonly container: HTMLElement;
	private readonly onColorThemeChange: Emitter<IWorkbenchColorTheme>;
	private readonly colorThemeWatcher: ThemeFileWatcher;
	private colorThemingParticipantChangeListener: IDisposable | undefined;

	private readonly fileIconThemeRegistry: ThemeRegistry<FileIconThemeData>;
	private currentFileIconTheme: FileIconThemeData;
	private readonly onFileIconThemeChange: Emitter<IWorkbenchFileIconTheme>;
	private readonly fileIconThemeWatcher: ThemeFileWatcher;

	private settings: ThemeConfiguration;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IWorkbenchLayoutService readonly layoutService: IWorkbenchLayoutService
	) {
		this.container = layoutService.getWorkbenchContainer();
		this.settings = new ThemeConfiguration(configurationService);

		this.colorThemeRegistry = new ThemeRegistry(extensionService, colorThemesExtPoint, ColorThemeData.fromExtensionTheme);
		this.colorThemeWatcher = new ThemeFileWatcher(fileService, environmentService, () => this.reloadCurrentColorTheme());
		this.onColorThemeChange = new Emitter<IWorkbenchColorTheme>({ leakWarningThreshold: 400 });
		this.currentColorTheme = ColorThemeData.createUnloadedTheme('');

		this.fileIconThemeWatcher = new ThemeFileWatcher(fileService, environmentService, () => this.reloadCurrentFileIconTheme());
		this.fileIconThemeRegistry = new ThemeRegistry(extensionService, fileIconThemesExtPoint, FileIconThemeData.fromExtensionTheme, true);
		this.onFileIconThemeChange = new Emitter<IWorkbenchFileIconTheme>();
		this.currentFileIconTheme = FileIconThemeData.createUnloadedTheme('');

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData: ColorThemeData | undefined = undefined;
		let persistedThemeData = this.storageService.get(PERSISTED_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedThemeData) {
			themeData = ColorThemeData.fromStorageData(persistedThemeData);
		}
		const containerBaseTheme = this.getBaseThemeFromContainer();
		if (!themeData || themeData.baseTheme !== containerBaseTheme) {
			themeData = ColorThemeData.createUnloadedTheme(containerBaseTheme);
		}
		themeData.setCustomColors(this.settings.colorCustomizations);
		themeData.setCustomTokenColors(this.settings.tokenColorCustomizations);
		themeData.setCustomTokenStyleRules(this.settings.tokenStylesCustomizations);
		this.updateDynamicCSSRules(themeData);
		this.applyTheme(themeData, undefined, true);

		const persistedIconThemeData = this.storageService.get(PERSISTED_ICON_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedIconThemeData) {
			const iconData = FileIconThemeData.fromStorageData(persistedIconThemeData);
			if (iconData) {
				_applyIconTheme(iconData, () => {
					this.doSetFileIconTheme(iconData);
					return Promise.resolve(iconData);
				});
			}
		}

		this.initialize().then(undefined, errors.onUnexpectedError).then(_ => {
			this.installConfigurationListener();
			this.installPreferredSchemeListener();
		});

		let prevColorId: string | undefined = undefined;

		// update settings schema setting for theme specific settings
		this.colorThemeRegistry.onDidChange(async event => {
			updateColorThemeConfigurationSchemas(event.themes);

			const colorThemeSetting = this.settings.colorTheme;
			if (colorThemeSetting !== this.currentColorTheme.settingsId) {
				const theme = await this.colorThemeRegistry.findThemeBySettingsId(colorThemeSetting, undefined);
				if (theme) {
					this.setColorTheme(theme.id, undefined);
					return;
				}
			}

			if (this.currentColorTheme.isLoaded) {
				const themeData = await this.colorThemeRegistry.findThemeById(this.currentColorTheme.id);
				if (!themeData) {
					// current theme is no longer available
					prevColorId = this.currentColorTheme.id;
					this.setColorTheme(DEFAULT_THEME_ID, 'auto');
				} else {
					if (this.currentColorTheme.id === DEFAULT_THEME_ID && !types.isUndefined(prevColorId) && await this.colorThemeRegistry.findThemeById(prevColorId)) {
						// restore color
						this.setColorTheme(prevColorId, 'auto');
						prevColorId = undefined;
					} else {
						this.reloadCurrentColorTheme();
					}
				}
			}
		});

		let prevFileIconId: string | undefined = undefined;
		this.fileIconThemeRegistry.onDidChange(async event => {
			updateFileIconThemeConfigurationSchemas(event.themes);

			const iconThemeSetting = this.settings.fileIconTheme;
			if (iconThemeSetting !== this.currentFileIconTheme.settingsId) {
				const theme = await this.findFileIconThemeBySettingId(iconThemeSetting);
				if (theme) {
					this.setFileIconTheme(theme.id, undefined);
					return;
				}
			}

			if (this.currentFileIconTheme.isLoaded) {
				const theme = await this.findFileIconThemeById(this.currentFileIconTheme.id);
				if (!theme) {
					// current theme is no longer available
					prevFileIconId = this.currentFileIconTheme.id;
					this.setFileIconTheme(DEFAULT_ICON_THEME_ID, 'auto');
				} else {
					// restore color
					if (this.currentFileIconTheme.id === DEFAULT_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && await this.findFileIconThemeById(prevFileIconId)) {
						this.setFileIconTheme(prevFileIconId, 'auto');
						prevFileIconId = undefined;
					} else {
						this.reloadCurrentFileIconTheme();
					}
				}
			}
		});
	}

	public get onDidColorThemeChange(): Event<IWorkbenchColorTheme> {
		return this.onColorThemeChange.event;
	}

	public get onDidFileIconThemeChange(): Event<IWorkbenchFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	private initialize(): Promise<[IWorkbenchColorTheme | null, IWorkbenchFileIconTheme | null]> {
		const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;

		const initializeColorTheme = async () => {
			if (extDevLocs && extDevLocs.length === 1) { // in dev mode, switch to a theme provided by the extension under dev.
				const devThemes = await this.colorThemeRegistry.findThemeByExtensionLocation(extDevLocs[0]);
				if (devThemes.length) {
					return this.setColorTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
				}
			}
			const theme = await this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, DEFAULT_THEME_ID);

			const persistedColorScheme = this.storageService.get(PERSISTED_OS_COLOR_SCHEME, StorageScope.GLOBAL);
			const preferredColorScheme = this.getPreferredColorScheme();
			if (persistedColorScheme && preferredColorScheme && persistedColorScheme !== preferredColorScheme) {
				return this.applyPreferredColorTheme(preferredColorScheme);
			}
			return this.setColorTheme(theme && theme.id, undefined);
		};

		const initializeIconTheme = async () => {
			if (extDevLocs && extDevLocs.length === 1) { // in dev mode, switch to a theme provided by the extension under dev.
				const devThemes = await this.fileIconThemeRegistry.findThemeByExtensionLocation(extDevLocs[0]);
				if (devThemes.length) {
					return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
				}
			}
			const theme = await this.findFileIconThemeBySettingId(this.settings.fileIconTheme);
			return this.setFileIconTheme(theme ? theme.id : DEFAULT_ICON_THEME_ID, undefined);
		};

		return Promise.all([initializeColorTheme(), initializeIconTheme()]);
	}

	private installConfigurationListener() {
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ThemeSettings.COLOR_THEME)) {
				const colorThemeSetting = this.settings.colorTheme;
				if (colorThemeSetting !== this.currentColorTheme.settingsId) {
					this.colorThemeRegistry.findThemeBySettingsId(colorThemeSetting, undefined).then(theme => {
						if (theme) {
							this.setColorTheme(theme.id, undefined);
						}
					});
				}
			}
			if (e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME)) {
				this.handlePreferredSchemeUpdated();
			}
			if (e.affectsConfiguration(ThemeSettings.PREFERRED_DARK_THEME) && this.getPreferredColorScheme() === DARK) {
				this.applyPreferredColorTheme(DARK);
			}
			if (e.affectsConfiguration(ThemeSettings.PREFERRED_LIGHT_THEME) && this.getPreferredColorScheme() === LIGHT) {
				this.applyPreferredColorTheme(LIGHT);
			}
			if (e.affectsConfiguration(ThemeSettings.PREFERRED_HC_THEME) && this.getPreferredColorScheme() === HIGH_CONTRAST) {
				this.applyPreferredColorTheme(HIGH_CONTRAST);
			}
			if (e.affectsConfiguration(ThemeSettings.ICON_THEME)) {
				const iconThemeSetting = this.settings.fileIconTheme;
				if (iconThemeSetting !== this.currentFileIconTheme.settingsId) {
					this.findFileIconThemeBySettingId(iconThemeSetting).then(theme => {
						this.setFileIconTheme(theme ? theme.id : DEFAULT_ICON_THEME_ID, undefined);
					});
				}
			}
			if (this.currentColorTheme) {
				let hasColorChanges = false;
				if (e.affectsConfiguration(ThemeSettings.COLOR_CUSTOMIZATIONS)) {
					this.currentColorTheme.setCustomColors(this.settings.colorCustomizations);
					hasColorChanges = true;
				}
				if (e.affectsConfiguration(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS)) {
					this.currentColorTheme.setCustomTokenColors(this.settings.tokenColorCustomizations);
					hasColorChanges = true;
				}
				if (e.affectsConfiguration(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS_EXPERIMENTAL)) {
					this.currentColorTheme.setCustomTokenStyleRules(this.settings.tokenStylesCustomizations);
					hasColorChanges = true;
				}
				if (hasColorChanges) {
					this.updateDynamicCSSRules(this.currentColorTheme);
					this.onColorThemeChange.fire(this.currentColorTheme);
				}
			}
		});
	}

	// preferred scheme handling

	private installPreferredSchemeListener() {
		window.matchMedia('(prefers-color-scheme: dark)').addListener(async () => this.handlePreferredSchemeUpdated());
	}

	private async handlePreferredSchemeUpdated() {
		const scheme = this.getPreferredColorScheme();
		this.storageService.store(PERSISTED_OS_COLOR_SCHEME, scheme, StorageScope.GLOBAL);
		if (scheme) {
			return this.applyPreferredColorTheme(scheme);
		}
		return undefined;
	}

	private getPreferredColorScheme(): ThemeType | undefined {
		const detectHCThemeSetting = this.configurationService.getValue<boolean>(ThemeSettings.DETECT_HC);
		if (this.environmentService.configuration.highContrast && detectHCThemeSetting) {
			return HIGH_CONTRAST;
		}
		if (this.configurationService.getValue<boolean>(ThemeSettings.DETECT_COLOR_SCHEME)) {
			if (window.matchMedia(`(prefers-color-scheme: light)`).matches) {
				return LIGHT;
			} else if (window.matchMedia(`(prefers-color-scheme: dark)`).matches) {
				return DARK;
			}
		}
		return undefined;
	}

	private async applyPreferredColorTheme(type: ThemeType): Promise<IWorkbenchColorTheme | null> {
		const settingId = type === DARK ? ThemeSettings.PREFERRED_DARK_THEME : type === LIGHT ? ThemeSettings.PREFERRED_LIGHT_THEME : ThemeSettings.PREFERRED_HC_THEME;
		const themeSettingId = this.configurationService.getValue<string>(settingId);
		if (themeSettingId) {
			const theme = await this.colorThemeRegistry.findThemeBySettingsId(themeSettingId, undefined);
			if (theme) {
				return this.setColorTheme(theme.id, 'auto');
			}
		}
		return null;
	}

	public getColorTheme(): IWorkbenchColorTheme {
		return this.currentColorTheme;
	}

	public getColorThemes(): Promise<IWorkbenchColorTheme[]> {
		return this.colorThemeRegistry.getThemes();
	}

	public setColorTheme(themeId: string | undefined, settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IWorkbenchColorTheme | null> {
		if (!themeId) {
			return Promise.resolve(null);
		}
		if (themeId === this.currentColorTheme.id && this.currentColorTheme.isLoaded) {
			return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		return this.colorThemeRegistry.findThemeById(themeId, DEFAULT_THEME_ID).then(themeData => {
			if (!themeData) {
				return null;
			}
			return themeData.ensureLoaded(this.extensionResourceLoaderService).then(_ => {
				if (themeId === this.currentColorTheme.id && !this.currentColorTheme.isLoaded && this.currentColorTheme.hasEqualData(themeData)) {
					this.currentColorTheme.clearCaches();
					// the loaded theme is identical to the perisisted theme. Don't need to send an event.
					this.currentColorTheme = themeData;
					themeData.setCustomColors(this.settings.colorCustomizations);
					themeData.setCustomTokenColors(this.settings.tokenColorCustomizations);
					themeData.setCustomTokenStyleRules(this.settings.tokenStylesCustomizations);
					return Promise.resolve(themeData);
				}
				themeData.setCustomColors(this.settings.colorCustomizations);
				themeData.setCustomTokenColors(this.settings.tokenColorCustomizations);
				themeData.setCustomTokenStyleRules(this.settings.tokenStylesCustomizations);
				this.updateDynamicCSSRules(themeData);
				return this.applyTheme(themeData, settingsTarget);
			}, error => {
				return Promise.reject(new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location!.toString(), error.message)));
			});
		});
	}

	private async reloadCurrentColorTheme() {
		await this.currentColorTheme.reload(this.extensionResourceLoaderService);
		this.currentColorTheme.setCustomColors(this.settings.colorCustomizations);
		this.currentColorTheme.setCustomTokenColors(this.settings.tokenColorCustomizations);
		this.currentColorTheme.setCustomTokenStyleRules(this.settings.tokenStylesCustomizations);
		this.updateDynamicCSSRules(this.currentColorTheme);
		this.applyTheme(this.currentColorTheme, undefined, false);
	}

	public restoreColorTheme() {
		const colorThemeSetting = this.settings.colorTheme;
		if (colorThemeSetting !== this.currentColorTheme.settingsId) {
			this.colorThemeRegistry.findThemeBySettingsId(colorThemeSetting, undefined).then(theme => {
				if (theme) {
					this.setColorTheme(theme.id, undefined);
				}
			});
		}
	}

	private updateDynamicCSSRules(themeData: IColorTheme) {
		const cssRules = new Set<string>();
		const ruleCollector = {
			addRule: (rule: string) => {
				if (!cssRules.has(rule)) {
					cssRules.add(rule);
				}
			}
		};
		themingRegistry.getThemingParticipants().forEach(p => p(themeData, ruleCollector, this.environmentService));
		_applyRules([...cssRules].join('\n'), colorThemeRulesClassName);
	}

	private applyTheme(newTheme: ColorThemeData, settingsTarget: ConfigurationTarget | undefined | 'auto', silent = false): Promise<IWorkbenchColorTheme | null> {
		if (this.currentColorTheme.id) {
			removeClasses(this.container, this.currentColorTheme.id);
		} else {
			removeClasses(this.container, VS_DARK_THEME, VS_LIGHT_THEME, VS_HC_THEME);
		}
		addClasses(this.container, newTheme.id);

		this.currentColorTheme.clearCaches();
		this.currentColorTheme = newTheme;
		if (!this.colorThemingParticipantChangeListener) {
			this.colorThemingParticipantChangeListener = themingRegistry.onThemingParticipantAdded(_ => this.updateDynamicCSSRules(this.currentColorTheme));
		}

		this.colorThemeWatcher.update(newTheme);

		this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');

		if (silent) {
			return Promise.resolve(null);
		}

		this.onColorThemeChange.fire(this.currentColorTheme);

		// remember theme data for a quick restore
		if (newTheme.isLoaded) {
			this.storageService.store(PERSISTED_THEME_STORAGE_KEY, newTheme.toStorageData(), StorageScope.GLOBAL);
		}

		return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
	}


	private themeExtensionsActivated = new Map<string, boolean>();
	private sendTelemetry(themeId: string, themeData: ExtensionData | undefined, themeType: string) {
		if (themeData) {
			const key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
				type ActivatePluginClassification = {
					id: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
					name: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
					isBuiltin: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
					publisherDisplayName: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
					themeId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
				};
				type ActivatePluginEvent = {
					id: string;
					name: string;
					isBuiltin: boolean;
					publisherDisplayName: string;
					themeId: string;
				};
				this.telemetryService.publicLog2<ActivatePluginEvent, ActivatePluginClassification>('activatePlugin', {
					id: themeData.extensionId,
					name: themeData.extensionName,
					isBuiltin: themeData.extensionIsBuiltin,
					publisherDisplayName: themeData.extensionPublisher,
					themeId: themeId
				});
				this.themeExtensionsActivated.set(key, true);
			}
		}
	}

	public getFileIconThemes(): Promise<IWorkbenchFileIconTheme[]> {
		return this.fileIconThemeRegistry.getThemes();
	}

	public getFileIconTheme() {
		return this.currentFileIconTheme;
	}

	public setFileIconTheme(iconTheme: string | undefined, settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IWorkbenchFileIconTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentFileIconTheme.id && this.currentFileIconTheme.isLoaded) {
			return this.settings.setFileIconTheme(this.currentFileIconTheme, settingsTarget);
		}
		const onApply = (newIconTheme: FileIconThemeData) => {
			this.doSetFileIconTheme(newIconTheme);

			// remember theme data for a quick restore
			if (newIconTheme.isLoaded && (!newIconTheme.location || !getRemoteAuthority(newIconTheme.location))) {
				this.storageService.store(PERSISTED_ICON_THEME_STORAGE_KEY, newIconTheme.toStorageData(), StorageScope.GLOBAL);
			}

			return this.settings.setFileIconTheme(this.currentFileIconTheme, settingsTarget);
		};

		return this.findFileIconThemeById(iconTheme).then(data => {
			const iconThemeData = data || FileIconThemeData.noIconTheme();
			return iconThemeData.ensureLoaded(this.fileService).then(_ => {
				return _applyIconTheme(iconThemeData, onApply);
			});
		});
	}

	private async findFileIconThemeById(id: string): Promise<FileIconThemeData | undefined> {
		return id.length === 0 ? FileIconThemeData.noIconTheme() : this.fileIconThemeRegistry.findThemeById(id);
	}

	private async findFileIconThemeBySettingId(settingsId: string | null): Promise<FileIconThemeData | undefined> {
		return !settingsId ? FileIconThemeData.noIconTheme() : this.fileIconThemeRegistry.findThemeBySettingsId(settingsId);
	}

	private async reloadCurrentFileIconTheme() {
		await this.currentFileIconTheme.reload(this.fileService);
		_applyIconTheme(this.currentFileIconTheme, () => {
			this.doSetFileIconTheme(this.currentFileIconTheme);
			return Promise.resolve(this.currentFileIconTheme);
		});
	}

	public restoreFileIconTheme() {
		const fileIconThemeSetting = this.settings.fileIconTheme;
		if (fileIconThemeSetting !== this.currentFileIconTheme.settingsId) {
			this.fileIconThemeRegistry.findThemeBySettingsId(fileIconThemeSetting).then(theme => {
				if (theme) {
					this.setFileIconTheme(theme.id, undefined);
				}
			});
		}
	}

	private doSetFileIconTheme(iconThemeData: FileIconThemeData): void {
		this.currentFileIconTheme = iconThemeData;

		if (iconThemeData.id) {
			addClasses(this.container, fileIconsEnabledClass);
		} else {
			removeClasses(this.container, fileIconsEnabledClass);
		}

		this.fileIconThemeWatcher.update(iconThemeData);

		if (iconThemeData.id) {
			this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'fileIcon');
		}
		this.onFileIconThemeChange.fire(this.currentFileIconTheme);

	}

	private getBaseThemeFromContainer() {
		for (let i = this.container.classList.length - 1; i >= 0; i--) {
			const item = this.container.classList.item(i);
			if (item === VS_LIGHT_THEME || item === VS_DARK_THEME || item === VS_HC_THEME) {
				return item;
			}
		}
		return VS_DARK_THEME;
	}
}

class ThemeFileWatcher {

	private inExtensionDevelopment: boolean;
	private watchedLocation: URI | undefined;
	private watcherDisposable: IDisposable | undefined;
	private fileChangeListener: IDisposable | undefined;

	constructor(private fileService: IFileService, environmentService: IWorkbenchEnvironmentService, private onUpdate: () => void) {
		this.inExtensionDevelopment = !!environmentService.extensionDevelopmentLocationURI;
	}

	update(theme: { location?: URI, watch?: boolean; }) {
		if (!resources.isEqual(theme.location, this.watchedLocation)) {
			this.dispose();
			if (theme.location && (theme.watch || this.inExtensionDevelopment)) {
				this.watchedLocation = theme.location;
				this.watcherDisposable = this.fileService.watch(theme.location);
				this.fileService.onDidFilesChange(e => {
					if (this.watchedLocation && e.contains(this.watchedLocation, FileChangeType.UPDATED)) {
						this.onUpdate();
					}
				});
			}
		}
	}

	dispose() {
		this.watcherDisposable = dispose(this.watcherDisposable);
		this.fileChangeListener = dispose(this.fileChangeListener);
		this.watchedLocation = undefined;
	}
}

function _applyIconTheme(data: FileIconThemeData, onApply: (theme: FileIconThemeData) => Promise<IWorkbenchFileIconTheme>): Promise<IWorkbenchFileIconTheme> {
	_applyRules(data.styleSheetContent!, iconThemeRulesClassName);
	return onApply(data);
}

function _applyRules(styleSheetContent: string, rulesClassName: string) {
	const themeStyles = document.head.getElementsByClassName(rulesClassName);
	if (themeStyles.length === 0) {
		const elStyle = document.createElement('style');
		elStyle.type = 'text/css';
		elStyle.className = rulesClassName;
		elStyle.innerHTML = styleSheetContent;
		document.head.appendChild(elStyle);
	} else {
		(<HTMLStyleElement>themeStyles[0]).innerHTML = styleSheetContent;
	}
}

registerColorThemeSchemas();
registerFileIconThemeSchemas();


registerSingleton(IWorkbenchThemeService, WorkbenchThemeService);
