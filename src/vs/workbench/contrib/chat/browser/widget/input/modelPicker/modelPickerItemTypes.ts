/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';

export interface IBuildModelPickerItemsOptions {
	readonly models: ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	readonly recentModelIds: string[];
	readonly pinnedModelIds: string[];
	readonly controlModels: IStringDictionary<IModelControlEntry>;
	readonly currentVSCodeVersion: string;
	readonly updateStateType: StateType;
	readonly manageSettingsUrl: string | undefined;
	readonly manageModelsAction: IActionWidgetDropdownAction | undefined;
	readonly chatEntitlementService: IChatEntitlementService;
	readonly languageModelsService: ILanguageModelsService;
	readonly openerService: IOpenerService | undefined;
	readonly presentation: {
		readonly useGroupedModelPicker: boolean;
		readonly showUnavailableFeatured: boolean;
		readonly showFeatured: boolean;
		readonly showAutoModel: boolean;
		readonly restrictedMode: boolean;
		readonly setupRequired: boolean;
		readonly isUBB: boolean;
	};
	readonly actions: {
		readonly onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void;
		readonly onTogglePin: ((modelIdentifier: string, pinned: boolean) => void) | undefined;
		readonly onConfigure: ((model: ILanguageModelChatMetadataAndIdentifier, group: string) => void) | undefined;
		readonly onRequestTrust: (() => void) | undefined;
		readonly onRequestSetup: (() => void) | undefined;
	};
}
