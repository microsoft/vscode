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
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { getCustomizationMigrationCategory, homepageMigrationCategories } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { IAgentHostToolSetEnablementService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ICustomizationMigrationService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
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
		this._register(autorun(reader => {
			if (!enabled.read(reader)) {
				this.migrationAvailableValue.set(false, undefined);
				return;
			}

			configurationChanged.read(reader);
			customizationsChanged.read(reader);
			harnessService.availableHarnesses.read(reader);
			const session = sessionsService.activeSession.read(reader);
			session?.workspace.read(reader);
			this.migrationAvailableValue.set(false, undefined);
			if (!session) {
				return;
			}

			void this.refreshMigrationAvailability(session.resource, migrationService, cancelOnDispose(reader.store));
		}));
	}

	private async refreshMigrationAvailability(sessionResource: URI, migrationService: ICustomizationMigrationService, token: CancellationToken): Promise<void> {
		try {
			const hint = await migrationService.computeMigrationHint(sessionResource, token);
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
