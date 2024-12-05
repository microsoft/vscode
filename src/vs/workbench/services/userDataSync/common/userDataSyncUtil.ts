/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IUserDataSyncUtilService, getDefaultIgnoredSettings } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourcePropertiesService, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';

class UserDataSyncUtilService implements IUserDataSyncUtilService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IKeybindingService private readonly keybindingsService: IKeybindingService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
	) { }

	async resolveDefaultCoreIgnoredSettings(): Promise<string[]> {
		return getDefaultIgnoredSettings(true);
	}

	async resolveUserBindings(userBindings: string[]): Promise<IStringDictionary<string>> {
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
			insertSpaces: !!this.textResourceConfigurationService.getValue(resource, 'editor.insertSpaces'),
			tabSize: this.textResourceConfigurationService.getValue(resource, 'editor.tabSize')
		};
	}

}

registerSingleton(IUserDataSyncUtilService, UserDataSyncUtilService, InstantiationType.Delayed);
