/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { SetChatBackgroundTool } from '../browser/chatBackgroundTool.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../common/constants.js';

/**
 * Registers the tool on desktop only: chat backgrounds display local files, and imported images
 * need a local folder that the window may load images of every supported format from.
 */
export class SetChatBackgroundToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.setChatBackgroundTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		// The window loads any file below the default profile's global storage. One folder per profile keeps
		// pruning from deleting images that another profile's settings refer to. The name has no dot, so it
		// cannot collide with the storage folder of an extension, which is removed when the extension is.
		const importRoot = joinPath(userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }), 'agentsChatBackgrounds');
		const tool = instantiationService.createInstance(SetChatBackgroundTool, () => joinPath(importRoot, userDataProfileService.currentProfile.id));
		const enabled = observableConfigValue(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, true, configurationService);
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(toolsService.registerTool(tool.getToolData(), tool));
			}
		}));
	}
}

registerWorkbenchContribution2(SetChatBackgroundToolContribution.ID, SetChatBackgroundToolContribution, WorkbenchPhase.Eventually);
