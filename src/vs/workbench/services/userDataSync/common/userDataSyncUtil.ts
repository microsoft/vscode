/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync';
import { IStringDictionary } from 'vs/base/common/collections';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourcePropertiesService, ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import type { IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

class UserDataSyncUtilService implements IUserDataSyncUtilService {

	_serviceBrand: undefined;

	constructor(
		@IKeybindingService private readonly keybindingsService: IKeybindingService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService
	) { }

	public async updateConfigurationValue(key: string, value: any): Promise<void> {
		await this.configurationService.updateValue(key, value, ConfigurationTarget.USER);
	}

	public async resolveUserBindings(userBindings: string[]): Promise<IStringDictionary<string>> {
		const keys: IStringDictionary<string> = {};
		for (const userbinding of userBindings) {
			keys[userbinding] = this.keybindingsService.resolveUserBinding(userbinding).map(part => part.getUserSettingsLabel()).join(' ');
		}
		return keys;
	}

	async resolveFormattingOptions(resource: URI): Promise<FormattingOptions> {
		try {
			const modelReference = await this.textModelService.createModelReference(resource);
			const { insertSpaces, tabSize } = modelReference.object.textEditorModel.getOptions();
			const eol = modelReference.object.textEditorModel.getEOL();
			modelReference.dispose();
			return { eol, insertSpaces, tabSize };
		} catch (e) {
		}
		return {
			eol: this.textResourcePropertiesService.getEOL(resource),
			insertSpaces: this.textResourceConfigurationService.getValue<boolean>(resource, 'editor.insertSpaces'),
			tabSize: this.textResourceConfigurationService.getValue(resource, 'editor.tabSize')
		};
	}

	async ignoreExtensionsToSync(extensionIdentifiers: IExtensionIdentifier[]): Promise<void> {
		return new Promise(async (c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<{ identifier: IExtensionIdentifier, label: string, description: string }>();
			disposables.add(quickPick);
			quickPick.title = localize('select extensions', "Sync: Select Extensions to Sync");
			quickPick.placeholder = localize('choose extensions to sync', "Choose extensions to sync");
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			quickPick.busy = true;
			quickPick.show();
			const queryResult = await this.extensionGalleryService.query({ names: extensionIdentifiers.map(e => e.id), pageSize: extensionIdentifiers.length }, CancellationToken.None);
			const items = queryResult.firstPage.map(e => ({
				identifier: e.identifier,
				label: e.identifier.id,
				description: e.displayName
			}));
			quickPick.busy = false;
			quickPick.items = items;
			quickPick.selectedItems = items;
			disposables.add(quickPick.onDidAccept(async () => {
				const ignoredExtensions: string[] = this.configurationService.getValue<string[]>('sync.ignoredExtensions').filter(id => quickPick.selectedItems.every(({ identifier }) => !areSameExtensions(identifier, { id })));
				ignoredExtensions.push(...items.filter(item => quickPick.selectedItems.indexOf(item) === -1).map(({ identifier }) => identifier.id));
				await this.configurationService.updateValue('sync.ignoredExtensions', ignoredExtensions);
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c();
			}));
		});
	}
}

registerSingleton(IUserDataSyncUtilService, UserDataSyncUtilService);
