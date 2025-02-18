/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language, LANGUAGE_DEFAULT } from '../../../../base/common/platform.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { IActiveLanguagePackService, ILocaleService } from '../common/locale.js';
import { ILanguagePackItem, ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { IViewPaneContainer, ViewContainerLocation } from '../../../common/views.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { localize } from '../../../../nls.js';
import { toAction } from '../../../../base/common/actions.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { parse } from '../../../../base/common/jsonc.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IHostService } from '../../host/browser/host.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// duplicate of IExtensionsViewPaneContainer in contrib
interface IExtensionsViewPaneContainer extends IViewPaneContainer {
	readonly searchValue: string | undefined;
	search(text: string): void;
	refresh(): Promise<void>;
}

// duplicate of VIEWLET_ID in contrib/extensions
const EXTENSIONS_VIEWLET_ID = 'workbench.view.extensions';

class NativeLocaleService implements ILocaleService {
	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IProgressService private readonly progressService: IProgressService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService
	) { }

	private async validateLocaleFile(): Promise<boolean> {
		try {
			const content = await this.textFileService.read(this.environmentService.argvResource, { encoding: 'utf8' });

			// This is the same logic that we do where argv.json is parsed so mirror that:
			// https://github.com/microsoft/vscode/blob/32d40cf44e893e87ac33ac4f08de1e5f7fe077fc/src/main.js#L238-L246
			parse(content.value);
		} catch (error) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('argvInvalid', 'Unable to write display language. Please open the runtime settings, correct errors/warnings in it and try again.'),
				actions: {
					primary: [
						toAction({
							id: 'openArgv',
							label: localize('openArgv', "Open Runtime Settings"),
							run: () => this.editorService.openEditor({ resource: this.environmentService.argvResource })
						})
					]
				}
			});
			return false;
		}
		return true;
	}

	private async writeLocaleValue(locale: string | undefined): Promise<boolean> {
		if (!(await this.validateLocaleFile())) {
			return false;
		}
		await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: locale }], true);
		return true;
	}

	async setLocale(languagePackItem: ILanguagePackItem, skipDialog = false): Promise<void> {
		const locale = languagePackItem.id;
		if (locale === Language.value() || (!locale && Language.isDefaultVariant())) {
			return;
		}
		const installedLanguages = await this.languagePackService.getInstalledLanguages();
		try {

			// Only Desktop has the concept of installing language packs so we only do this for Desktop
			// and only if the language pack is not installed
			if (!installedLanguages.some(installedLanguage => installedLanguage.id === languagePackItem.id)) {

				// Only actually install a language pack from Microsoft
				if (languagePackItem.galleryExtension?.publisher.toLowerCase() !== 'ms-ceintl') {
					// Show the view so the user can see the language pack that they should install
					// as of now, there are no 3rd party language packs available on the Marketplace.
					const viewlet = await this.paneCompositePartService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar);
					(viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer).search(`@id:${languagePackItem.extensionId}`);
					return;
				}

				await this.progressService.withProgress(
					{
						location: ProgressLocation.Notification,
						title: localize('installing', "Installing {0} language support...", languagePackItem.label),
					},
					progress => this.extensionManagementService.installFromGallery(languagePackItem.galleryExtension!, {
						// Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
						isMachineScoped: false,
					})
				);
			}

			if (!skipDialog && !await this.showRestartDialog(languagePackItem.label)) {
				return;
			}
			await this.writeLocaleValue(locale);
			await this.hostService.restart();
		} catch (err) {
			this.notificationService.error(err);
		}
	}

	async clearLocalePreference(): Promise<void> {
		try {
			await this.writeLocaleValue(undefined);
			if (!Language.isDefaultVariant()) {
				await this.showRestartDialog('English');
			}
		} catch (err) {
			this.notificationService.error(err);
		}
	}

	private async showRestartDialog(languageName: string): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			message: localize('restartDisplayLanguageMessage1', "Restart {0} to switch to {1}?", this.productService.nameLong, languageName),
			detail: localize(
				'restartDisplayLanguageDetail1',
				"To change the display language to {0}, {1} needs to restart.",
				languageName,
				this.productService.nameLong
			),
			primaryButton: localize({ key: 'restart', comment: ['&& denotes a mnemonic character'] }, "&&Restart"),
		});

		return confirmed;
	}
}

// This is its own service because the localeService depends on IJSONEditingService which causes a circular dependency
// Once that's ironed out, we can fold this into the localeService.
class NativeActiveLanguagePackService implements IActiveLanguagePackService {
	_serviceBrand: undefined;

	constructor(
		@ILanguagePackService private readonly languagePackService: ILanguagePackService
	) { }

	async getExtensionIdProvidingCurrentLocale(): Promise<string | undefined> {
		const language = Language.value();
		if (language === LANGUAGE_DEFAULT) {
			return undefined;
		}
		const languages = await this.languagePackService.getInstalledLanguages();
		const languagePack = languages.find(l => l.id === language);
		return languagePack?.extensionId;
	}
}

registerSingleton(ILocaleService, NativeLocaleService, InstantiationType.Delayed);
registerSingleton(IActiveLanguagePackService, NativeActiveLanguagePackService, InstantiationType.Delayed);
