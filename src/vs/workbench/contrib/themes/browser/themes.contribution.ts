/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { MenuRegistry, MenuId, Action2, registerAction2, ISubmenuItem } from 'vs/platform/actions/common/actions';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { Registry } from 'vs/platform/registry/common/platform';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IWorkbenchThemeService, IWorkbenchTheme, ThemeSettingTarget, IWorkbenchColorTheme, IWorkbenchFileIconTheme, IWorkbenchProductIconTheme, ThemeSettings, ThemeSettingDefaults } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { VIEWLET_ID, IExtensionsViewPaneContainer } from 'vs/workbench/contrib/extensions/common/extensions';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IColorRegistry, Extensions as ColorRegistryExtensions } from 'vs/platform/theme/common/colorRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Color } from 'vs/base/common/color';
import { ColorScheme, isHighContrast } from 'vs/platform/theme/common/theme';
import { colorThemeSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { isCancellationError, onUnexpectedError } from 'vs/base/common/errors';
import { IQuickInputButton, IQuickInputService, IQuickInputToggle, IQuickPick, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { DEFAULT_PRODUCT_ICON_THEME_ID, ProductIconThemeData } from 'vs/workbench/services/themes/browser/productIconThemeData';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ThemeIcon } from 'vs/base/common/themables';
import { Emitter } from 'vs/base/common/event';
import { IExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { FileIconThemeData } from 'vs/workbench/services/themes/browser/fileIconThemeData';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { isWeb } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { mainWindow } from 'vs/base/browser/window';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';
import { DisposableStore } from 'vs/base/common/lifecycle';

export const manageExtensionIcon = registerIcon('theme-selection-manage-extension', Codicon.gear, localize('manageExtensionIcon', 'Icon for the \'Manage\' action in the theme selection quick pick.'));

type PickerResult = 'back' | 'selected' | 'cancelled';

enum ConfigureItem {
	BROWSE_GALLERY = 'marketplace',
	EXTENSIONS_VIEW = 'extensions',
	CUSTOM_TOP_ENTRY = 'customTopEntry'
}

class MarketplaceThemesPicker {
	private readonly _installedExtensions: Promise<Set<string>>;
	private readonly _marketplaceExtensions: Set<string> = new Set();
	private readonly _marketplaceThemes: ThemeItem[] = [];

	private _searchOngoing: boolean = false;
	private _searchError: string | undefined = undefined;
	private readonly _onDidChange = new Emitter<void>();

	private _tokenSource: CancellationTokenSource | undefined;
	private readonly _queryDelayer = new ThrottledDelayer<void>(200);

	constructor(
		private readonly getMarketplaceColorThemes: (publisher: string, name: string, version: string) => Promise<IWorkbenchTheme[]>,
		private readonly marketplaceQuery: string,

		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		this._installedExtensions = extensionManagementService.getInstalled().then(installed => {
			const result = new Set<string>();
			for (const ext of installed) {
				result.add(ext.identifier.id);
			}
			return result;
		});
	}

	public get themes(): ThemeItem[] {
		return this._marketplaceThemes;
	}

	public get onDidChange() {
		return this._onDidChange.event;
	}

	public trigger(value: string) {
		if (this._tokenSource) {
			this._tokenSource.cancel();
			this._tokenSource = undefined;
		}
		this._queryDelayer.trigger(() => {
			this._tokenSource = new CancellationTokenSource();
			return this.doSearch(value, this._tokenSource.token);
		});
	}

	private async doSearch(value: string, token: CancellationToken): Promise<void> {
		this._searchOngoing = true;
		this._onDidChange.fire();
		try {
			const installedExtensions = await this._installedExtensions;

			const options = { text: `${this.marketplaceQuery} ${value}`, pageSize: 20 };
			const pager = await this.extensionGalleryService.query(options, token);
			for (let i = 0; i < pager.total && i < 1; i++) { // loading multiple pages is turned of for now to avoid flickering
				if (token.isCancellationRequested) {
					break;
				}

				const nThemes = this._marketplaceThemes.length;
				const gallery = i === 0 ? pager.firstPage : await pager.getPage(i, token);

				const promises: Promise<IWorkbenchTheme[]>[] = [];
				const promisesGalleries = [];
				for (let i = 0; i < gallery.length; i++) {
					if (token.isCancellationRequested) {
						break;
					}
					const ext = gallery[i];
					if (!installedExtensions.has(ext.identifier.id) && !this._marketplaceExtensions.has(ext.identifier.id)) {
						this._marketplaceExtensions.add(ext.identifier.id);
						promises.push(this.getMarketplaceColorThemes(ext.publisher, ext.name, ext.version));
						promisesGalleries.push(ext);
					}
				}
				const allThemes = await Promise.all(promises);
				for (let i = 0; i < allThemes.length; i++) {
					const ext = promisesGalleries[i];
					for (const theme of allThemes[i]) {
						this._marketplaceThemes.push({ id: theme.id, theme: theme, label: theme.label, description: `${ext.displayName} · ${ext.publisherDisplayName}`, galleryExtension: ext, buttons: [configureButton] });
					}
				}

				if (nThemes !== this._marketplaceThemes.length) {
					this._marketplaceThemes.sort((t1, t2) => t1.label.localeCompare(t2.label));
					this._onDidChange.fire();
				}
			}
		} catch (e) {
			if (!isCancellationError(e)) {
				this.logService.error(`Error while searching for themes:`, e);
				this._searchError = 'message' in e ? e.message : String(e);
			}
		} finally {
			this._searchOngoing = false;
			this._onDidChange.fire();
		}

	}

	public openQuickPick(value: string, currentTheme: IWorkbenchTheme | undefined, selectTheme: (theme: IWorkbenchTheme | undefined, applyTheme: boolean) => void): Promise<PickerResult> {
		let result: PickerResult | undefined = undefined;
		const disposables = new DisposableStore();
		return new Promise<PickerResult>((s, _) => {
			const quickpick = disposables.add(this.quickInputService.createQuickPick<ThemeItem>());
			quickpick.items = [];
			quickpick.sortByLabel = false;
			quickpick.matchOnDescription = true;
			quickpick.buttons = [this.quickInputService.backButton];
			quickpick.title = 'Marketplace Themes';
			quickpick.placeholder = localize('themes.selectMarketplaceTheme', "Type to Search More. Select to Install. Up/Down Keys to Preview");
			quickpick.canSelectMany = false;
			disposables.add(quickpick.onDidChangeValue(() => this.trigger(quickpick.value)));
			disposables.add(quickpick.onDidAccept(async _ => {
				const themeItem = quickpick.selectedItems[0];
				if (themeItem?.galleryExtension) {
					result = 'selected';
					quickpick.hide();
					const success = await this.installExtension(themeItem.galleryExtension);
					if (success) {
						selectTheme(themeItem.theme, true);
					} else {
						selectTheme(currentTheme, true);
					}
				}
			}));

			disposables.add(quickpick.onDidTriggerItemButton(e => {
				if (isItem(e.item)) {
					const extensionId = e.item.theme?.extensionData?.extensionId;
					if (extensionId) {
						openExtensionViewlet(this.paneCompositeService, `@id:${extensionId}`);
					} else {
						openExtensionViewlet(this.paneCompositeService, `${this.marketplaceQuery} ${quickpick.value}`);
					}
				}
			}));
			disposables.add(quickpick.onDidChangeActive(themes => {
				if (result === undefined) {
					selectTheme(themes[0]?.theme, false);
				}
			}));

			disposables.add(quickpick.onDidHide(() => {
				if (result === undefined) {
					selectTheme(currentTheme, true);
					result = 'cancelled';

				}
				s(result);
			}));

			disposables.add(quickpick.onDidTriggerButton(e => {
				if (e === this.quickInputService.backButton) {
					result = 'back';
					quickpick.hide();
				}
			}));

			disposables.add(this.onDidChange(() => {
				let items = this.themes;
				if (this._searchOngoing) {
					items = items.concat({ label: '$(sync~spin) Searching for themes...', id: undefined, alwaysShow: true });
				} else if (items.length === 0 && this._searchError) {
					items = [{ label: `$(error) ${localize('search.error', 'Error while searching for themes: {0}', this._searchError)}`, id: undefined, alwaysShow: true }];
				}
				const activeItemId = quickpick.activeItems[0]?.id;
				const newActiveItem = activeItemId ? items.find(i => isItem(i) && i.id === activeItemId) : undefined;

				quickpick.items = items;
				if (newActiveItem) {
					quickpick.activeItems = [newActiveItem as ThemeItem];
				}
			}));
			this.trigger(value);
			quickpick.show();
		}).finally(() => {
			disposables.dispose();
		});
	}

	private async installExtension(galleryExtension: IGalleryExtension) {
		openExtensionViewlet(this.paneCompositeService, `@id:${galleryExtension.identifier.id}`);
		const result = await this.dialogService.confirm({
			message: localize('installExtension.confirm', "This will install extension '{0}' published by '{1}'. Do you want to continue?", galleryExtension.displayName, galleryExtension.publisherDisplayName),
			primaryButton: localize('installExtension.button.ok', "OK")
		});
		if (!result.confirmed) {
			return false;
		}
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('installing extensions', "Installing Extension {0}...", galleryExtension.displayName)
			}, async () => {
				await this.extensionManagementService.installFromGallery(galleryExtension, {
					// Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
					isMachineScoped: false,
				});
			});
			return true;
		} catch (e) {
			this.logService.error(`Problem installing extension ${galleryExtension.identifier.id}`, e);
			return false;
		}
	}


	public dispose() {
		if (this._tokenSource) {
			this._tokenSource.cancel();
			this._tokenSource = undefined;
		}
		this._queryDelayer.dispose();
		this._marketplaceExtensions.clear();
		this._marketplaceThemes.length = 0;
	}
}

interface InstalledThemesPickerOptions {
	readonly installMessage: string;
	readonly browseMessage?: string;
	readonly placeholderMessage: string;
	readonly marketplaceTag: string;
	readonly title?: string;
	readonly description?: string;
	readonly toggles?: IQuickInputToggle[];
	readonly onToggle?: (toggle: IQuickInputToggle, quickInput: IQuickPick<ThemeItem, { useSeparators: boolean }>) => Promise<void>;
}

class InstalledThemesPicker {
	constructor(
		private readonly options: InstalledThemesPickerOptions,
		private readonly setTheme: (theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget) => Promise<any>,
		private readonly getMarketplaceColorThemes: (publisher: string, name: string, version: string) => Promise<IWorkbenchTheme[]>,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	public async openQuickPick(picks: QuickPickInput<ThemeItem>[], currentTheme: IWorkbenchTheme) {

		let marketplaceThemePicker: MarketplaceThemesPicker | undefined;
		if (this.extensionGalleryService.isEnabled()) {
			if (this.extensionResourceLoaderService.supportsExtensionGalleryResources && this.options.browseMessage) {
				marketplaceThemePicker = this.instantiationService.createInstance(MarketplaceThemesPicker, this.getMarketplaceColorThemes.bind(this), this.options.marketplaceTag);
				picks = [configurationEntry(this.options.browseMessage, ConfigureItem.BROWSE_GALLERY), ...picks];
			} else {
				picks = [...picks, { type: 'separator' }, configurationEntry(this.options.installMessage, ConfigureItem.EXTENSIONS_VIEW)];
			}
		}

		let selectThemeTimeout: number | undefined;

		const selectTheme = (theme: IWorkbenchTheme | undefined, applyTheme: boolean) => {
			if (selectThemeTimeout) {
				clearTimeout(selectThemeTimeout);
			}
			selectThemeTimeout = mainWindow.setTimeout(() => {
				selectThemeTimeout = undefined;
				const newTheme = (theme ?? currentTheme) as IWorkbenchTheme;
				this.setTheme(newTheme, applyTheme ? 'auto' : 'preview').then(undefined,
					err => {
						onUnexpectedError(err);
						this.setTheme(currentTheme, undefined);
					}
				);
			}, applyTheme ? 0 : 200);
		};

		const pickInstalledThemes = (activeItemId: string | undefined) => {
			const disposables = new DisposableStore();
			return new Promise<void>((s, _) => {
				let isCompleted = false;
				const autoFocusIndex = picks.findIndex(p => isItem(p) && p.id === activeItemId);
				const quickpick = disposables.add(this.quickInputService.createQuickPick<ThemeItem>({ useSeparators: true }));
				quickpick.items = picks;
				quickpick.title = this.options.title;
				quickpick.description = this.options.description;
				quickpick.placeholder = this.options.placeholderMessage;
				quickpick.activeItems = [picks[autoFocusIndex] as ThemeItem];
				quickpick.canSelectMany = false;
				quickpick.toggles = this.options.toggles;
				quickpick.toggles?.forEach(toggle => {
					disposables.add(toggle.onChange(() => this.options.onToggle?.(toggle, quickpick)));
				});
				quickpick.matchOnDescription = true;
				disposables.add(quickpick.onDidAccept(async _ => {
					isCompleted = true;
					const theme = quickpick.selectedItems[0];
					if (!theme || theme.configureItem) { // 'pick in marketplace' entry
						if (!theme || theme.configureItem === ConfigureItem.EXTENSIONS_VIEW) {
							openExtensionViewlet(this.paneCompositeService, `${this.options.marketplaceTag} ${quickpick.value}`);
						} else if (theme.configureItem === ConfigureItem.BROWSE_GALLERY) {
							if (marketplaceThemePicker) {
								const res = await marketplaceThemePicker.openQuickPick(quickpick.value, currentTheme, selectTheme);
								if (res === 'back') {
									await pickInstalledThemes(undefined);
								}
							}
						}
					} else {
						selectTheme(theme.theme, true);
					}

					quickpick.hide();
					s();
				}));
				disposables.add(quickpick.onDidChangeActive(themes => selectTheme(themes[0]?.theme, false)));
				disposables.add(quickpick.onDidHide(() => {
					if (!isCompleted) {
						selectTheme(currentTheme, true);
						s();
					}
					quickpick.dispose();
				}));
				disposables.add(quickpick.onDidTriggerItemButton(e => {
					if (isItem(e.item)) {
						const extensionId = e.item.theme?.extensionData?.extensionId;
						if (extensionId) {
							openExtensionViewlet(this.paneCompositeService, `@id:${extensionId}`);
						} else {
							openExtensionViewlet(this.paneCompositeService, `${this.options.marketplaceTag} ${quickpick.value}`);
						}
					}
				}));
				quickpick.show();
			}).finally(() => {
				disposables.dispose();
			});
		};
		await pickInstalledThemes(currentTheme.id);

		marketplaceThemePicker?.dispose();

	}
}

const SelectColorThemeCommandId = 'workbench.action.selectTheme';

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: SelectColorThemeCommandId,
			title: localize2('selectTheme.label', 'Color Theme'),
			category: Categories.Preferences,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyT)
			}
		});
	}

	private getTitle(colorScheme: ColorScheme | undefined): string {
		switch (colorScheme) {
			case ColorScheme.DARK: return localize('themes.selectTheme.darkScheme', "Select Color Theme for System Dark Mode");
			case ColorScheme.LIGHT: return localize('themes.selectTheme.lightScheme', "Select Color Theme for System Light Mode");
			case ColorScheme.HIGH_CONTRAST_DARK: return localize('themes.selectTheme.darkHC', "Select Color Theme for High Contrast Dark Mode");
			case ColorScheme.HIGH_CONTRAST_LIGHT: return localize('themes.selectTheme.lightHC', "Select Color Theme for High Contrast Light Mode");
			default:
				return localize('themes.selectTheme.default', "Select Color Theme (detect system color mode disabled)");
		}
	}

	override async run(accessor: ServicesAccessor) {
		const themeService = accessor.get(IWorkbenchThemeService);
		const preferencesService = accessor.get(IPreferencesService);

		const preferredColorScheme = themeService.getPreferredColorScheme();

		let modeConfigureToggle;
		if (preferredColorScheme) {
			modeConfigureToggle = new Toggle({
				title: localize('themes.configure.switchingEnabled', 'Detect system color mode enabled. Click to configure.'),
				icon: Codicon.colorMode,
				isChecked: false,
				...defaultToggleStyles
			});
		} else {
			modeConfigureToggle = new Toggle({
				title: localize('themes.configure.switchingDisabled', 'Detect system color mode disabled. Click to configure.'),
				icon: Codicon.colorMode,
				isChecked: false,
				...defaultToggleStyles
			});
		}

		const options = {
			installMessage: localize('installColorThemes', "Install Additional Color Themes..."),
			browseMessage: '$(plus) ' + localize('browseColorThemes', "Browse Additional Color Themes..."),
			placeholderMessage: this.getTitle(preferredColorScheme),
			marketplaceTag: 'category:themes',
			toggles: [modeConfigureToggle],
			onToggle: async (toggle, picker) => {
				picker.hide();
				await preferencesService.openSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
			}
		} satisfies InstalledThemesPickerOptions;
		const setTheme = (theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget) => themeService.setColorTheme(theme as IWorkbenchColorTheme, settingsTarget);
		const getMarketplaceColorThemes = (publisher: string, name: string, version: string) => themeService.getMarketplaceColorThemes(publisher, name, version);

		const instantiationService = accessor.get(IInstantiationService);
		const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);

		const themes = await themeService.getColorThemes();
		const currentTheme = themeService.getColorTheme();

		const lightEntries = toEntries(themes.filter(t => t.type === ColorScheme.LIGHT), localize('themes.category.light', "light themes"));
		const darkEntries = toEntries(themes.filter(t => t.type === ColorScheme.DARK), localize('themes.category.dark', "dark themes"));
		const hcEntries = toEntries(themes.filter(t => isHighContrast(t.type)), localize('themes.category.hc', "high contrast themes"));

		let picks;
		switch (preferredColorScheme) {
			case ColorScheme.DARK:
				picks = [...darkEntries, ...lightEntries, ...hcEntries];
				break;
			case ColorScheme.HIGH_CONTRAST_DARK:
			case ColorScheme.HIGH_CONTRAST_LIGHT:
				picks = [...hcEntries, ...lightEntries, ...darkEntries];
				break;
			case ColorScheme.LIGHT:
			default:
				picks = [...lightEntries, ...darkEntries, ...hcEntries];
				break;
		}
		await picker.openQuickPick(picks, currentTheme);

	}
});

const SelectFileIconThemeCommandId = 'workbench.action.selectIconTheme';

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: SelectFileIconThemeCommandId,
			title: localize2('selectIconTheme.label', 'File Icon Theme'),
			category: Categories.Preferences,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor) {
		const themeService = accessor.get(IWorkbenchThemeService);

		const options = {
			installMessage: localize('installIconThemes', "Install Additional File Icon Themes..."),
			placeholderMessage: localize('themes.selectIconTheme', "Select File Icon Theme (Up/Down Keys to Preview)"),
			marketplaceTag: 'tag:icon-theme'
		};
		const setTheme = (theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget) => themeService.setFileIconTheme(theme as IWorkbenchFileIconTheme, settingsTarget);
		const getMarketplaceColorThemes = (publisher: string, name: string, version: string) => themeService.getMarketplaceFileIconThemes(publisher, name, version);

		const instantiationService = accessor.get(IInstantiationService);
		const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);

		const picks: QuickPickInput<ThemeItem>[] = [
			{ type: 'separator', label: localize('fileIconThemeCategory', 'file icon themes') },
			{ id: '', theme: FileIconThemeData.noIconTheme, label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable File Icons') },
			...toEntries(await themeService.getFileIconThemes()),
		];

		await picker.openQuickPick(picks, themeService.getFileIconTheme());
	}
});

const SelectProductIconThemeCommandId = 'workbench.action.selectProductIconTheme';

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: SelectProductIconThemeCommandId,
			title: localize2('selectProductIconTheme.label', 'Product Icon Theme'),
			category: Categories.Preferences,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor) {
		const themeService = accessor.get(IWorkbenchThemeService);

		const options = {
			installMessage: localize('installProductIconThemes', "Install Additional Product Icon Themes..."),
			browseMessage: '$(plus) ' + localize('browseProductIconThemes', "Browse Additional Product Icon Themes..."),
			placeholderMessage: localize('themes.selectProductIconTheme', "Select Product Icon Theme (Up/Down Keys to Preview)"),
			marketplaceTag: 'tag:product-icon-theme'
		};
		const setTheme = (theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget) => themeService.setProductIconTheme(theme as IWorkbenchProductIconTheme, settingsTarget);
		const getMarketplaceColorThemes = (publisher: string, name: string, version: string) => themeService.getMarketplaceProductIconThemes(publisher, name, version);

		const instantiationService = accessor.get(IInstantiationService);
		const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);

		const picks: QuickPickInput<ThemeItem>[] = [
			{ type: 'separator', label: localize('productIconThemeCategory', 'product icon themes') },
			{ id: DEFAULT_PRODUCT_ICON_THEME_ID, theme: ProductIconThemeData.defaultTheme, label: localize('defaultProductIconThemeLabel', 'Default') },
			...toEntries(await themeService.getProductIconThemes()),
		];

		await picker.openQuickPick(picks, themeService.getProductIconTheme());
	}
});

CommandsRegistry.registerCommand('workbench.action.previewColorTheme', async function (accessor: ServicesAccessor, extension: { publisher: string; name: string; version: string }, themeSettingsId?: string) {
	const themeService = accessor.get(IWorkbenchThemeService);

	let themes = findBuiltInThemes(await themeService.getColorThemes(), extension);
	if (themes.length === 0) {
		themes = await themeService.getMarketplaceColorThemes(extension.publisher, extension.name, extension.version);
	}
	for (const theme of themes) {
		if (!themeSettingsId || theme.settingsId === themeSettingsId) {
			await themeService.setColorTheme(theme, 'preview');
			return theme.settingsId;
		}
	}
	return undefined;
});

function findBuiltInThemes(themes: IWorkbenchColorTheme[], extension: { publisher: string; name: string }): IWorkbenchColorTheme[] {
	return themes.filter(({ extensionData }) => extensionData && extensionData.extensionIsBuiltin && equalsIgnoreCase(extensionData.extensionPublisher, extension.publisher) && equalsIgnoreCase(extensionData.extensionName, extension.name));
}

function configurationEntry(label: string, configureItem: ConfigureItem): QuickPickInput<ThemeItem> {
	return {
		id: undefined,
		label: label,
		alwaysShow: true,
		buttons: [configureButton],
		configureItem: configureItem
	};
}

function openExtensionViewlet(paneCompositeService: IPaneCompositePartService, query: string) {
	return paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true).then(viewlet => {
		if (viewlet) {
			(viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer).search(query);
			viewlet.focus();
		}
	});
}
interface ThemeItem extends IQuickPickItem {
	readonly id: string | undefined;
	readonly theme?: IWorkbenchTheme;
	readonly galleryExtension?: IGalleryExtension;
	readonly label: string;
	readonly description?: string;
	readonly alwaysShow?: boolean;
	readonly configureItem?: ConfigureItem;
}

function isItem(i: QuickPickInput<ThemeItem>): i is ThemeItem {
	return (<any>i)['type'] !== 'separator';
}

function toEntry(theme: IWorkbenchTheme): ThemeItem {
	const settingId = theme.settingsId ?? undefined;
	const item: ThemeItem = {
		id: theme.id,
		theme: theme,
		label: theme.label,
		description: theme.description || (theme.label === settingId ? undefined : settingId),
	};
	if (theme.extensionData) {
		item.buttons = [configureButton];
	}
	return item;
}

function toEntries(themes: Array<IWorkbenchTheme>, label?: string): QuickPickInput<ThemeItem>[] {
	const sorter = (t1: ThemeItem, t2: ThemeItem) => t1.label.localeCompare(t2.label);
	const entries: QuickPickInput<ThemeItem>[] = themes.map(toEntry).sort(sorter);
	if (entries.length > 0 && label) {
		entries.unshift({ type: 'separator', label });
	}
	return entries;
}

const configureButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(manageExtensionIcon),
	tooltip: localize('manage extension', "Manage Extension"),
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.generateColorTheme',
			title: localize2('generateColorTheme.label', 'Generate Color Theme From Current Settings'),
			category: Categories.Developer,
			f1: true
		});
	}

	override run(accessor: ServicesAccessor) {
		const themeService = accessor.get(IWorkbenchThemeService);

		const theme = themeService.getColorTheme();
		const colors = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution).getColors();
		const colorIds = colors.map(c => c.id).sort();
		const resultingColors: { [key: string]: string | null } = {};
		const inherited: string[] = [];
		for (const colorId of colorIds) {
			const color = theme.getColor(colorId, false);
			if (color) {
				resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
			} else {
				inherited.push(colorId);
			}
		}
		const nullDefaults = [];
		for (const id of inherited) {
			const color = theme.getColor(id);
			if (color) {
				resultingColors['__' + id] = Color.Format.CSS.formatHexA(color, true);
			} else {
				nullDefaults.push(id);
			}
		}
		for (const id of nullDefaults) {
			resultingColors['__' + id] = null;
		}
		let contents = JSON.stringify({
			'$schema': colorThemeSchemaId,
			type: theme.type,
			colors: resultingColors,
			tokenColors: theme.tokenColors.filter(t => !!t.scope)
		}, null, '\t');
		contents = contents.replace(/\"__/g, '//"');

		const editorService = accessor.get(IEditorService);
		return editorService.openEditor({ resource: undefined, contents, languageId: 'jsonc', options: { pinned: true } });
	}
});

const toggleLightDarkThemesCommandId = 'workbench.action.toggleLightDarkThemes';

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: toggleLightDarkThemesCommandId,
			title: localize2('toggleLightDarkThemes.label', 'Toggle between Light/Dark Themes'),
			category: Categories.Preferences,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor) {
		const themeService = accessor.get(IWorkbenchThemeService);
		const configurationService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);
		const preferencesService = accessor.get(IPreferencesService);

		if (configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			const message = localize({ key: 'cannotToggle', comment: ['{0} is a setting name'] }, "Cannot toggle between light and dark themes when `{0}` is enabled in settings.", ThemeSettings.DETECT_COLOR_SCHEME);
			notificationService.prompt(Severity.Info, message, [
				{
					label: localize('goToSetting', "Open Settings"),
					run: () => {
						return preferencesService.openUserSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
					}
				}
			]);
			return;
		}

		const currentTheme = themeService.getColorTheme();
		let newSettingsId: string = ThemeSettings.PREFERRED_DARK_THEME;
		switch (currentTheme.type) {
			case ColorScheme.LIGHT:
				newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
				break;
			case ColorScheme.DARK:
				newSettingsId = ThemeSettings.PREFERRED_LIGHT_THEME;
				break;
			case ColorScheme.HIGH_CONTRAST_LIGHT:
				newSettingsId = ThemeSettings.PREFERRED_HC_DARK_THEME;
				break;
			case ColorScheme.HIGH_CONTRAST_DARK:
				newSettingsId = ThemeSettings.PREFERRED_HC_LIGHT_THEME;
				break;
		}

		const themeSettingId: string = configurationService.getValue(newSettingsId);

		if (themeSettingId && typeof themeSettingId === 'string') {
			const theme = (await themeService.getColorThemes()).find(t => t.settingsId === themeSettingId);
			if (theme) {
				themeService.setColorTheme(theme.id, 'auto');
			}
		}
	}
});

const browseColorThemesInMarketplaceCommandId = 'workbench.action.browseColorThemesInMarketplace';

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: browseColorThemesInMarketplaceCommandId,
			title: localize2('browseColorThemeInMarketPlace.label', 'Browse Color Themes in Marketplace'),
			category: Categories.Preferences,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor) {
		const marketplaceTag = 'category:themes';
		const themeService = accessor.get(IWorkbenchThemeService);
		const extensionGalleryService = accessor.get(IExtensionGalleryService);
		const extensionResourceLoaderService = accessor.get(IExtensionResourceLoaderService);
		const instantiationService = accessor.get(IInstantiationService);

		if (!extensionGalleryService.isEnabled() || !extensionResourceLoaderService.supportsExtensionGalleryResources) {
			return;
		}
		const currentTheme = themeService.getColorTheme();
		const getMarketplaceColorThemes = (publisher: string, name: string, version: string) => themeService.getMarketplaceColorThemes(publisher, name, version);

		let selectThemeTimeout: number | undefined;

		const selectTheme = (theme: IWorkbenchTheme | undefined, applyTheme: boolean) => {
			if (selectThemeTimeout) {
				clearTimeout(selectThemeTimeout);
			}
			selectThemeTimeout = mainWindow.setTimeout(() => {
				selectThemeTimeout = undefined;
				const newTheme = (theme ?? currentTheme) as IWorkbenchTheme;
				themeService.setColorTheme(newTheme as IWorkbenchColorTheme, applyTheme ? 'auto' : 'preview').then(undefined,
					err => {
						onUnexpectedError(err);
						themeService.setColorTheme(currentTheme, undefined);
					}
				);
			}, applyTheme ? 0 : 200);
		};

		const marketplaceThemePicker = instantiationService.createInstance(MarketplaceThemesPicker, getMarketplaceColorThemes, marketplaceTag);
		await marketplaceThemePicker.openQuickPick('', themeService.getColorTheme(), selectTheme).then(undefined, onUnexpectedError);
	}
});

const ThemesSubMenu = new MenuId('ThemesSubMenu');
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	title: localize('themes', "Themes"),
	submenu: ThemesSubMenu,
	group: '2_configuration',
	order: 7
} satisfies ISubmenuItem);
MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	title: localize({ key: 'miSelectTheme', comment: ['&& denotes a mnemonic'] }, "&&Theme"),
	submenu: ThemesSubMenu,
	group: '2_configuration',
	order: 7
} satisfies ISubmenuItem);

MenuRegistry.appendMenuItem(ThemesSubMenu, {
	command: {
		id: SelectColorThemeCommandId,
		title: localize('selectTheme.label', 'Color Theme')
	},
	order: 1
});

MenuRegistry.appendMenuItem(ThemesSubMenu, {
	command: {
		id: SelectFileIconThemeCommandId,
		title: localize('themes.selectIconTheme.label', "File Icon Theme")
	},
	order: 2
});

MenuRegistry.appendMenuItem(ThemesSubMenu, {
	command: {
		id: SelectProductIconThemeCommandId,
		title: localize('themes.selectProductIconTheme.label', "Product Icon Theme")
	},
	order: 3
});

type DefaultThemeUpdatedNotificationReaction = 'keepNew' | 'keepOld' | 'tryNew' | 'cancel' | 'browse';

class DefaultThemeUpdatedNotificationContribution implements IWorkbenchContribution {

	static STORAGE_KEY = 'themeUpdatedNotificationShown';

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkbenchThemeService private readonly _workbenchThemeService: IWorkbenchThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IHostService private readonly _hostService: IHostService,
	) {
		if (_storageService.getBoolean(DefaultThemeUpdatedNotificationContribution.STORAGE_KEY, StorageScope.APPLICATION)) {
			return;
		}
		setTimeout(async () => {
			if (_storageService.getBoolean(DefaultThemeUpdatedNotificationContribution.STORAGE_KEY, StorageScope.APPLICATION)) {
				return;
			}
			if (await this._hostService.hadLastFocus()) {
				this._storageService.store(DefaultThemeUpdatedNotificationContribution.STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
				if (this._workbenchThemeService.hasUpdatedDefaultThemes()) {
					this._showYouGotMigratedNotification();
				} else {
					const currentTheme = this._workbenchThemeService.getColorTheme().settingsId;
					if (currentTheme === ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD || currentTheme === ThemeSettingDefaults.COLOR_THEME_DARK_OLD) {
						this._tryNewThemeNotification();
					}
				}
			}
		}, 3000);
	}

	private async _showYouGotMigratedNotification(): Promise<void> {
		const usingLight = this._workbenchThemeService.getColorTheme().type === ColorScheme.LIGHT;
		const newThemeSettingsId = usingLight ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
		const newTheme = (await this._workbenchThemeService.getColorThemes()).find(theme => theme.settingsId === newThemeSettingsId);
		if (newTheme) {
			const choices = [
				{
					label: localize('button.keep', "Keep New Theme"),
					run: () => {
						this._writeTelemetry('keepNew');
					}
				},
				{
					label: localize('button.browse', "Browse Themes"),
					run: () => {
						this._writeTelemetry('browse');
						this._commandService.executeCommand(SelectColorThemeCommandId);
					}
				},
				{
					label: localize('button.revert', "Revert"),
					run: async () => {
						this._writeTelemetry('keepOld');
						const oldSettingsId = usingLight ? ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD : ThemeSettingDefaults.COLOR_THEME_DARK_OLD;
						const oldTheme = (await this._workbenchThemeService.getColorThemes()).find(theme => theme.settingsId === oldSettingsId);
						if (oldTheme) {
							this._workbenchThemeService.setColorTheme(oldTheme, 'auto');
						}
					}
				}
			];
			await this._notificationService.prompt(
				Severity.Info,
				localize({ key: 'themeUpdatedNotification', comment: ['{0} is the name of the new default theme'] }, "Visual Studio Code now ships with a new default theme '{0}'. If you prefer, you can switch back to the old theme or try one of the many other color themes available.", newTheme.label),
				choices,
				{
					onCancel: () => this._writeTelemetry('cancel')
				}
			);
		}
	}

	private async _tryNewThemeNotification(): Promise<void> {
		const newThemeSettingsId = this._workbenchThemeService.getColorTheme().type === ColorScheme.LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
		const theme = (await this._workbenchThemeService.getColorThemes()).find(theme => theme.settingsId === newThemeSettingsId);
		if (theme) {
			const choices: IPromptChoice[] = [{
				label: localize('button.tryTheme', "Try New Theme"),
				run: () => {
					this._writeTelemetry('tryNew');
					this._workbenchThemeService.setColorTheme(theme, 'auto');
				}
			},
			{
				label: localize('button.cancel', "Cancel"),
				run: () => {
					this._writeTelemetry('cancel');
				}
			}];
			await this._notificationService.prompt(
				Severity.Info,
				localize({ key: 'newThemeNotification', comment: ['{0} is the name of the new default theme'] }, "Visual Studio Code now ships with a new default theme '{0}'. Do you want to give it a try?", theme.label),
				choices,
				{ onCancel: () => this._writeTelemetry('cancel') }
			);
		}
	}

	private _writeTelemetry(outcome: DefaultThemeUpdatedNotificationReaction): void {
		type ThemeUpdatedNoticationClassification = {
			owner: 'aeschli';
			comment: 'Reaction to the notification that theme has updated to a new default theme';
			web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this is running on web' };
			reaction: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Outcome of the notification' };
		};
		type ThemeUpdatedNoticationEvent = {
			web: boolean;
			reaction: DefaultThemeUpdatedNotificationReaction;
		};

		this._telemetryService.publicLog2<ThemeUpdatedNoticationEvent, ThemeUpdatedNoticationClassification>('themeUpdatedNotication', {
			web: isWeb,
			reaction: outcome
		});
	}
}
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(DefaultThemeUpdatedNotificationContribution, LifecyclePhase.Eventually);
