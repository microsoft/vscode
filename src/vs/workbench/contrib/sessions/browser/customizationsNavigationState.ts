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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observeVisibleSectionBadges } from '../../chat/browser/aiCustomization/aiCustomizationSectionBadges.js';

export class CustomizationsNavigationState extends Disposable {
	readonly totalCount: IObservable<number>;
	/** Describes why the Customizations entry shows a badge, if it does: the badge of the first visible section that has one. */
	readonly badge: IObservable<string | undefined>;
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
		@IInstantiationService instantiationService: IInstantiationService,
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
		const sectionBadges = observeVisibleSectionBadges({ instantiationService, harnessService, workspaceService, configurationService });
		// Only read the badges while the entry renders, as reading a badge may log an experiment trigger.
		this.badge = derived(this, reader => enabled.read(reader) ? sectionBadges.read(reader)[0]?.badge : undefined);

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
