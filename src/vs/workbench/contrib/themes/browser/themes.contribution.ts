/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions, CATEGORIES } from 'vs/workbench/common/actions';
import { IWorkbenchThemeService, IWorkbenchTheme, ThemeSettingTarget, IWorkbenchColorTheme, IWorkbenchFileIconTheme, IWorkbenchProductIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { VIEWLET_ID, IExtensionsViewPaneContainer } from 'vs/workbench/contrib/extensions/common/extensions';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IColorRegistry, Extensions as ColorRegistryExtensions } from 'vs/platform/theme/common/colorRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Color } from 'vs/base/common/color';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { colorThemeSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { isPromiseCanceledError, onUnexpectedError } from 'vs/base/common/errors';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { DEFAULT_PRODUCT_ICON_THEME_ID } from 'vs/workbench/services/themes/browser/productIconThemeData';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Emitter } from 'vs/base/common/event';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export const manageExtensionIcon = registerIcon('theme-selection-manage-extension', Codicon.gear, localize('manageExtensionIcon', 'Icon for the \'Manage\' action in the theme selection quick pick.'));

type PickerResult = 'back' | 'selected' | 'cancelled';

class MarketplaceThemes {
	private readonly _installedExtensions: Promise<Set<string>>;
	private readonly _marketplaceExtensions: Set<string> = new Set();
	private readonly _marketplaceThemes: ThemeItem[] = [];

	private _searchOngoing: boolean = false;
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
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService
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

	public get isSearching(): boolean {
		return this._searchOngoing;
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
			for (let i = 0; i < pager.total && i < 2; i++) {
				if (token.isCancellationRequested) {
					break;
				}

				const nThemes = this._marketplaceThemes.length;

				const gallery = await pager.getPage(i, token);
				for (let i = 0; i < gallery.length; i++) {
					if (token.isCancellationRequested) {
						break;
					}
					const ext = gallery[i];
					if (!installedExtensions.has(ext.identifier.id) && !this._marketplaceExtensions.has(ext.identifier.id)) {
						this._marketplaceExtensions.add(ext.identifier.id);
						const themes = await this.getMarketplaceColorThemes(ext.publisher, ext.name, ext.version);
						for (const theme of themes) {
							this._marketplaceThemes.push({ id: theme.id, theme: theme, label: theme.label, description: `${ext.displayName} · ${ext.publisherDisplayName}`, galleryExtension: ext, buttons: [configureButton] });
						}
					}
				}
				if (nThemes !== this._marketplaceThemes.length) {
					this._marketplaceThemes.sort((t1, t2) => t1.label.localeCompare(t2.label));
					this._onDidChange.fire();
				}
			}
		} catch (e) {
			if (!isPromiseCanceledError(e)) {
				this.logService.error(`Error while searching for themes:`, e);
			}
		}
		this._searchOngoing = false;
		this._onDidChange.fire();
	}

	public openQuickPick(value: string, currentTheme: IWorkbenchTheme | undefined, selectTheme: (theme: IWorkbenchTheme | undefined, applyTheme: boolean) => void): Promise<PickerResult> {
		let result: PickerResult | undefined = undefined;
		return new Promise<PickerResult>((s, _) => {
			const quickpick = this.quickInputService.createQuickPick<ThemeItem>();
			quickpick.items = [];
			quickpick.sortByLabel = false;
			quickpick.matchOnDescription = true;
			quickpick.buttons = [this.quickInputService.backButton];
			quickpick.title = 'Marketplace Themes';
			quickpick.placeholder = localize('themes.selectMarketplaceTheme', "Type to Search More. Select to Install. Up/Down Keys to Preview");
			quickpick.canSelectMany = false;
			quickpick.onDidChangeValue(() => this.trigger(quickpick.value));
			quickpick.onDidAccept(async _ => {
				let themeItem = quickpick.selectedItems[0];
				if (themeItem?.galleryExtension) {
					result = 'selected';
					quickpick.hide();
					const success = await this.installExtension(themeItem.galleryExtension);
					if (success) {
						selectTheme(themeItem.theme, true);
					}
				}
			});

			quickpick.onDidTriggerItemButton(e => {
				if (isItem(e.item)) {
					const extensionId = e.item.theme?.extensionData?.extensionId;
					if (extensionId) {
						openExtensionViewlet(this.paneCompositeService, `@id:${extensionId}`);
					} else {
						openExtensionViewlet(this.paneCompositeService, `${this.marketplaceQuery} ${quickpick.value}`);
					}
				}
			});
			quickpick.onDidChangeActive(themes => selectTheme(themes[0]?.theme, false));

			quickpick.onDidHide(() => {
				if (result === undefined) {
					selectTheme(currentTheme, true);
					result = 'cancelled';

				}
				quickpick.dispose();
				s(result);
			});

			quickpick.onDidTriggerButton(e => {
				if (e === this.quickInputService.backButton) {
					result = 'back';
					quickpick.hide();
				}
			});

			this.onDidChange(() => {
				let items = this.themes;
				if (this.isSearching) {
					items = items.concat({ label: '$(sync~spin) Searching for themes...', id: undefined, alwaysShow: true });
				}
				const activeItemId = quickpick.activeItems[0]?.id;
				const newActiveItem = activeItemId ? items.find(i => isItem(i) && i.id === activeItemId) : undefined;

				quickpick.items = items;
				if (newActiveItem) {
					quickpick.activeItems = [newActiveItem as ThemeItem];
				}
			});
			this.trigger(value);
			quickpick.show();
		});
	}

	private async installExtension(galleryExtension: IGalleryExtension) {
		try {
			openExtensionViewlet(this.paneCompositeService, `@id:${galleryExtension.identifier.id}`);
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('installing extensions', "Installing Extension {0}...", galleryExtension.displayName)
			}, async () => {
				await this.extensionManagementService.installFromGallery(galleryExtension);
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

abstract class AbstractSelectThemeAction extends Action {
	constructor(
		id: string,
		label: string,
		private readonly quickInputService: IQuickInputService,
		private readonly extensionGalleryService: IExtensionGalleryService,
		private readonly paneCompositeService: IPaneCompositePartService,
		private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		private readonly instantiationService: IInstantiationService

	) {
		super(id, label);
	}

	protected abstract get installMessage(): string;
	protected abstract get browseMessage(): string;
	protected abstract get placeholderMessage(): string;
	protected abstract get marketplaceTag(): string;

	protected abstract setTheme(theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget): Promise<any>;
	protected abstract getMarketplaceColorThemes(publisher: string, name: string, version: string): Promise<IWorkbenchTheme[]>;

	protected async pick(picks: QuickPickInput<ThemeItem>[], currentTheme: IWorkbenchTheme) {
		let marketplaceThemes: MarketplaceThemes | undefined;
		if (this.extensionGalleryService.isEnabled()) {
			if (this.extensionResourceLoaderService.supportsExtensionGalleryResources) {
				marketplaceThemes = this.instantiationService.createInstance(MarketplaceThemes, this.getMarketplaceColorThemes.bind(this), this.marketplaceTag);
				picks = [...configurationEntries(this.browseMessage), ...picks];
			} else {
				picks = [...picks, ...configurationEntries(this.installMessage)];
			}
		}

		let selectThemeTimeout: number | undefined;

		const selectTheme = (theme: ThemeItem | undefined, applyTheme: boolean) => {
			if (selectThemeTimeout) {
				clearTimeout(selectThemeTimeout);
			}
			selectThemeTimeout = window.setTimeout(() => {
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
			return new Promise<void>((s, _) => {
				let isCompleted = false;

				const autoFocusIndex = picks.findIndex(p => isItem(p) && p.id === activeItemId);
				const quickpick = this.quickInputService.createQuickPick<ThemeItem>();
				quickpick.items = picks;
				quickpick.placeholder = this.placeholderMessage;
				quickpick.activeItems = [picks[autoFocusIndex] as ThemeItem];
				quickpick.canSelectMany = false;
				quickpick.onDidAccept(async _ => {
					isCompleted = true;
					const theme = quickpick.selectedItems[0];
					if (!theme || typeof theme.id === 'undefined') { // 'pick in marketplace' entry
						if (marketplaceThemes) {
							const res = await marketplaceThemes.openQuickPick(quickpick.value, currentTheme, selectTheme);
							if (res === 'back') {
								await pickInstalledThemes(undefined);
							}
						} else {
							openExtensionViewlet(this.paneCompositeService, `${this.marketplaceTag} ${quickpick.value}`);
						}
					} else {
						selectTheme(theme, true);
					}

					quickpick.hide();
					s();
				});
				quickpick.onDidChangeActive(themes => selectTheme(themes[0], false));
				quickpick.onDidHide(() => {
					if (!isCompleted) {
						selectTheme(currentTheme, true);
						s();
					}
					quickpick.dispose();
				});
				quickpick.onDidTriggerItemButton(e => {
					if (isItem(e.item)) {
						const extensionId = e.item.theme?.extensionData?.extensionId;
						if (extensionId) {
							openExtensionViewlet(this.paneCompositeService, `@id:${extensionId}`);
						} else {
							openExtensionViewlet(this.paneCompositeService, `${this.marketplaceTag} ${quickpick.value}`);
						}
					}
				});
				quickpick.show();
			});
		};
		await pickInstalledThemes(currentTheme.id);

		marketplaceThemes?.dispose();

	}
}

export class SelectColorThemeAction extends AbstractSelectThemeAction {

	static readonly ID = 'workbench.action.selectTheme';
	static readonly LABEL = localize('selectTheme.label', "Color Theme");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IExtensionResourceLoaderService extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IInstantiationService instantiationService: IInstantiationService

	) {
		super(id, label, quickInputService, extensionGalleryService, paneCompositeService, extensionResourceLoaderService, instantiationService);
	}

	protected override readonly installMessage = localize('installColorThemes', "Install Additional Color Themes...");
	protected override readonly browseMessage = '$(plus) ' + localize('browseColorThemes', "Browse Additional Color Themes...");
	protected override readonly placeholderMessage = localize('themes.selectTheme', "Select Color Theme (Up/Down Keys to Preview)");
	protected override readonly marketplaceTag = 'category:themes';
	protected override setTheme(theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget): Promise<any> {
		return this.themeService.setColorTheme(theme as IWorkbenchColorTheme, settingsTarget);
	}
	protected override getMarketplaceColorThemes(publisher: string, name: string, version: string): Promise<IWorkbenchTheme[]> {
		return this.themeService.getMarketplaceColorThemes(publisher, name, version);
	}

	override async run(): Promise<void> {
		const themes = await this.themeService.getColorThemes();
		const currentTheme = this.themeService.getColorTheme();

		const picks: QuickPickInput<ThemeItem>[] = [
			...toEntries(themes.filter(t => t.type === ColorScheme.LIGHT), localize('themes.category.light', "light themes")),
			...toEntries(themes.filter(t => t.type === ColorScheme.DARK), localize('themes.category.dark', "dark themes")),
			...toEntries(themes.filter(t => t.type === ColorScheme.HIGH_CONTRAST), localize('themes.category.hc', "high contrast themes")),
		];
		this.pick(picks, currentTheme);
	}
}

class SelectFileIconThemeAction extends AbstractSelectThemeAction {

	static readonly ID = 'workbench.action.selectIconTheme';
	static readonly LABEL = localize('selectIconTheme.label', "File Icon Theme");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IExtensionResourceLoaderService extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, quickInputService, extensionGalleryService, paneCompositeService, extensionResourceLoaderService, instantiationService);
	}

	protected override readonly installMessage = localize('installIconThemes', "Install Additional File Icon Themes...");
	protected override readonly browseMessage = localize('browseIconThemes', "$(plus) Browse Additional File Icon Themes...");
	protected override readonly placeholderMessage = localize('themes.selectIconTheme', "Select File Icon Theme");
	protected override readonly marketplaceTag = 'tag:icon-theme';
	protected override setTheme(theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget) {
		return this.themeService.setFileIconTheme(theme as IWorkbenchFileIconTheme, settingsTarget);
	}
	protected override getMarketplaceColorThemes(publisher: string, name: string, version: string) {
		return this.themeService.getMarketplaceFileIconThemes(publisher, name, version);
	}

	override async run(): Promise<void> {
		const picks: QuickPickInput<ThemeItem>[] = [
			{ type: 'separator', label: localize('fileIconThemeCategory', 'file icon themes') },
			{ id: '', label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable File Icons') },
			...toEntries(await this.themeService.getFileIconThemes()),
		];

		await this.pick(picks, this.themeService.getFileIconTheme());
	}
}


class SelectProductIconThemeAction extends AbstractSelectThemeAction {

	static readonly ID = 'workbench.action.selectProductIconTheme';
	static readonly LABEL = localize('selectProductIconTheme.label', "Product Icon Theme");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IExtensionResourceLoaderService extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IInstantiationService instantiationService: IInstantiationService

	) {
		super(id, label, quickInputService, extensionGalleryService, paneCompositeService, extensionResourceLoaderService, instantiationService);
	}

	protected override readonly installMessage = localize('installProductIconThemes', "Install Additional Product Icon Themes...");
	protected override readonly browseMessage = localize('browseProductIconThemes', "$(plus) Browse Additional Product Icon Themes...");
	protected override readonly placeholderMessage = localize('themes.selectProductIconTheme', "Select Product Icon Theme");
	protected override readonly marketplaceTag = 'tag:product-icon-theme';
	protected override setTheme(theme: IWorkbenchTheme | undefined, settingsTarget: ThemeSettingTarget): Promise<any> {
		return this.themeService.setProductIconTheme(theme as IWorkbenchProductIconTheme, settingsTarget);
	}
	protected override getMarketplaceColorThemes(publisher: string, name: string, version: string): Promise<IWorkbenchTheme[]> {
		return this.themeService.getMarketplaceProductIconThemes(publisher, name, version);
	}
	override async run(): Promise<void> {
		const picks: QuickPickInput<ThemeItem>[] = [
			{ type: 'separator', label: localize('productIconThemeCategory', 'product icon themes') },
			{ id: DEFAULT_PRODUCT_ICON_THEME_ID, label: localize('defaultProductIconThemeLabel', 'Default') },
			...toEntries(await this.themeService.getProductIconThemes()),
		];

		await this.pick(picks, this.themeService.getProductIconTheme());
	}
}

function configurationEntries(label: string): QuickPickInput<ThemeItem>[] {
	return [
		{
			type: 'separator'
		},
		{
			id: undefined,
			label: label,
			alwaysShow: true,
			buttons: [configureButton]
		}
	];

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
}

function isItem(i: QuickPickInput<ThemeItem>): i is ThemeItem {
	return (<any>i)['type'] !== 'separator';
}

function toEntry(theme: IWorkbenchTheme): ThemeItem {
	const item: ThemeItem = { id: theme.id, theme: theme, label: theme.label, description: theme.description };
	if (theme.extensionData) {
		item.buttons = [configureButton];
	}
	return item;
}

function toEntries(themes: Array<IWorkbenchTheme>, label?: string): QuickPickInput<ThemeItem>[] {
	const sorter = (t1: ThemeItem, t2: ThemeItem) => t1.label.localeCompare(t2.label);
	let entries: QuickPickInput<ThemeItem>[] = themes.map(toEntry).sort(sorter);
	if (entries.length > 0 && label) {
		entries.unshift({ type: 'separator', label });
	}
	return entries;
}

const configureButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(manageExtensionIcon),
	tooltip: localize('manage extension', "Manage Extension"),
};
class GenerateColorThemeAction extends Action {

	static readonly ID = 'workbench.action.generateColorTheme';
	static readonly LABEL = localize('generateColorTheme.label', "Generate Color Theme From Current Settings");

	constructor(
		id: string,
		label: string,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(id, label);
	}

	override run(): Promise<any> {
		let theme = this.themeService.getColorTheme();
		let colors = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution).getColors();
		let colorIds = colors.map(c => c.id).sort();
		let resultingColors: { [key: string]: string | null } = {};
		let inherited: string[] = [];
		for (let colorId of colorIds) {
			const color = theme.getColor(colorId, false);
			if (color) {
				resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
			} else {
				inherited.push(colorId);
			}
		}
		const nullDefaults = [];
		for (let id of inherited) {
			const color = theme.getColor(id);
			if (color) {
				resultingColors['__' + id] = Color.Format.CSS.formatHexA(color, true);
			} else {
				nullDefaults.push(id);
			}
		}
		for (let id of nullDefaults) {
			resultingColors['__' + id] = null;
		}
		let contents = JSON.stringify({
			'$schema': colorThemeSchemaId,
			type: theme.type,
			colors: resultingColors,
			tokenColors: theme.tokenColors.filter(t => !!t.scope)
		}, null, '\t');
		contents = contents.replace(/\"__/g, '//"');

		return this.editorService.openEditor({ resource: undefined, contents, mode: 'jsonc', options: { pinned: true } });
	}
}

const category = localize('preferences', "Preferences");

const colorThemeDescriptor = SyncActionDescriptor.from(SelectColorThemeAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyT) });
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(colorThemeDescriptor, 'Preferences: Color Theme', category);

const fileIconThemeDescriptor = SyncActionDescriptor.from(SelectFileIconThemeAction);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(fileIconThemeDescriptor, 'Preferences: File Icon Theme', category);

const productIconThemeDescriptor = SyncActionDescriptor.from(SelectProductIconThemeAction);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(productIconThemeDescriptor, 'Preferences: Product Icon Theme', category);


const generateColorThemeDescriptor = SyncActionDescriptor.from(GenerateColorThemeAction);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(generateColorThemeDescriptor, 'Developer: Generate Color Theme From Current Settings', CATEGORIES.Developer.value);

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '4_themes',
	command: {
		id: SelectColorThemeAction.ID,
		title: localize({ key: 'miSelectColorTheme', comment: ['&& denotes a mnemonic'] }, "&&Color Theme")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '4_themes',
	command: {
		id: SelectFileIconThemeAction.ID,
		title: localize({ key: 'miSelectIconTheme', comment: ['&& denotes a mnemonic'] }, "File &&Icon Theme")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '4_themes',
	command: {
		id: SelectProductIconThemeAction.ID,
		title: localize({ key: 'miSelectProductIconTheme', comment: ['&& denotes a mnemonic'] }, "&&Product Icon Theme")
	},
	order: 3
});


MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '4_themes',
	command: {
		id: SelectColorThemeAction.ID,
		title: localize('selectTheme.label', "Color Theme")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '4_themes',
	command: {
		id: SelectFileIconThemeAction.ID,
		title: localize('themes.selectIconTheme.label', "File Icon Theme")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '4_themes',
	command: {
		id: SelectProductIconThemeAction.ID,
		title: localize('themes.selectProductIconTheme.label', "Product Icon Theme")
	},
	order: 3
});
