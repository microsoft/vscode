/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { getCustomizationMigrationCategory, homepageMigrationCategories } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY, getIgnoredCustomizationMigrationGroups } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationIgnoredGroups.js';
import { IAgentHostToolSetEnablementService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { ICustomizationMigrationIgnoredGroup, ICustomizationMigrationService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IAICustomizationMcpServerCountService } from './customizationMcpServerCount.js';
import { readTotalCustomizationCount } from './customizationsToolbar.contribution.js';

export class CustomizationsNavigationState extends Disposable {
	readonly totalCount: IObservable<number>;
	private readonly migrationAvailableValue = observableValue(this, false);
	readonly migrationAvailable: IObservable<boolean> = this.migrationAvailableValue;

	constructor(
		enabled: IObservable<boolean>,
		@ISessionsService sessionsService: ISessionsService,
		@IAICustomizationItemsModel itemsModel: IAICustomizationItemsModel,
		@IAICustomizationMcpServerCountService mcpServerCountService: IAICustomizationMcpServerCountService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService toolEnablementService: IAgentHostToolSetEnablementService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@ICustomizationMigrationService migrationService: ICustomizationMigrationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.totalCount = derived(this, reader => {
			if (!enabled.read(reader) || !sessionsService.activeSession.read(reader)) {
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

		const migrationCategories = homepageMigrationCategories.map(getCustomizationMigrationCategory);
		const configurationChanged = observableSignalFromEvent(this, Event.filter(
			configurationService.onDidChangeConfiguration,
			event => migrationCategories.some(category => event.affectsConfiguration(category.enablementSetting)),
		));
		const customizationsChanged = observableSignalFromEvent(this, migrationService.onDidChangeCustomizations);
		const ignoredGroupsChanged = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key === CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY,
		));
		this._register(autorun(reader => {
			if (!enabled.read(reader)) {
				this.migrationAvailableValue.set(false, undefined);
				return;
			}

			configurationChanged.read(reader);
			customizationsChanged.read(reader);
			ignoredGroupsChanged.read(reader);
			harnessService.availableHarnesses.read(reader);
			const session = sessionsService.activeSession.read(reader);
			if (!session) {
				this.migrationAvailableValue.set(false, undefined);
				return;
			}

			this.migrationAvailableValue.set(false, undefined);
			const ignoredGroups = getIgnoredCustomizationMigrationGroups(
				storageService,
				getChatSessionType(session.resource),
				workspaceService.activeProjectRoot.read(reader),
			);
			void this.refreshMigrationAvailability(session.resource, migrationService, ignoredGroups, cancelOnDispose(reader.store));
		}));
	}

	private async refreshMigrationAvailability(
		sessionResource: URI,
		migrationService: ICustomizationMigrationService,
		ignoredGroups: readonly ICustomizationMigrationIgnoredGroup[],
		token: CancellationToken,
	): Promise<void> {
		try {
			const hint = await migrationService.computeMigrationHint(sessionResource, token, ignoredGroups);
			if (!token.isCancellationRequested) {
				this.migrationAvailableValue.set(hint !== undefined, undefined);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('Failed to check customization migrations for the Sessions navigation', error);
			}
			if (!token.isCancellationRequested) {
				this.migrationAvailableValue.set(false, undefined);
			}
		}
	}
}
