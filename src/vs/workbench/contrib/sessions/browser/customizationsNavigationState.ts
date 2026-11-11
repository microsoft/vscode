/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IAICustomizationItemsModel } from '../../chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { CustomizationMigrationState } from '../../chat/browser/aiCustomization/customizationMigrationState.js';
import { IAgentHostToolSetEnablementService } from '../../chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IAICustomizationWorkspaceService } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../chat/common/customizationHarnessService.js';
import { ICustomizationMigrationService } from '../../chat/common/promptSyntax/service/customizationMigrationService.js';
import { ILanguageModelToolsService } from '../../chat/common/tools/languageModelToolsService.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { IAICustomizationMcpServerCountService } from './customizationMcpServerCount.js';
import { readTotalCustomizationCount } from './customizationItems.js';
import { IAgentsWindowExtensionSuggestionsService } from './agentsWindowExtensionSuggestions.js';

export class CustomizationsNavigationState extends Disposable {
	readonly totalCount: IObservable<number>;
	/** Whether the Customizations entry shows a badge for installed extensions that can be enabled in the Agents window. */
	readonly extensionSuggestionsAvailable: IObservable<boolean>;
	readonly migrationAvailable: IObservable<boolean>;

	constructor(
		enabled: IObservable<boolean>,
		@IFocusedSessionHostService focusedSessionHostService: IFocusedSessionHostService,
		@IAICustomizationItemsModel itemsModel: IAICustomizationItemsModel,
		@IAICustomizationMcpServerCountService mcpServerCountService: IAICustomizationMcpServerCountService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService toolEnablementService: IAgentHostToolSetEnablementService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@ICustomizationMigrationService migrationService: ICustomizationMigrationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IAgentsWindowExtensionSuggestionsService extensionSuggestionsService: IAgentsWindowExtensionSuggestionsService,
	) {
		super();

		this.totalCount = derived(this, reader => {
			if (!enabled.read(reader) || !focusedSessionHostService.focusedHost.read(reader).session.read(reader)) {
				return 0;
			}
			return readTotalCustomizationCount(
				reader,
				itemsModel,
				mcpServerCountService,
				toolsService,
				toolEnablementService,
				harnessService,
			);
		});
		this.extensionSuggestionsAvailable = derived(this, reader => enabled.read(reader) && extensionSuggestionsService.showBadge.read(reader));

		const context = derived(this, reader => {
			if (!enabled.read(reader)) {
				return undefined;
			}
			harnessService.availableHarnesses.read(reader);
			const session = focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			return session ? { sessionResource: session.resource, projectRoot: workspaceService.activeProjectRoot.read(reader) } : undefined;
		});
		this.migrationAvailable = this._register(new CustomizationMigrationState(context, migrationService, configurationService, storageService, logService)).available;
	}
}
