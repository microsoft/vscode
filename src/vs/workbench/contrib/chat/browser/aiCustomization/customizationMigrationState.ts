/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { ICustomizationMigrationService } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { getCustomizationMigrationCategory, homepageMigrationCategories } from './customizationMigrationCategories.js';
import { CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY, getIgnoredCustomizationMigrationGroups } from './customizationMigrationIgnoredGroups.js';

interface ICustomizationMigrationContext {
	readonly sessionResource: URI;
	readonly projectRoot: URI | undefined;
}

export class CustomizationMigrationState extends Disposable {
	private readonly availableValue = observableValue(this, false);
	readonly available: IObservable<boolean> = this.availableValue;

	constructor(
		context: IObservable<ICustomizationMigrationContext | undefined>,
		@ICustomizationMigrationService migrationService: ICustomizationMigrationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		const categories = homepageMigrationCategories.map(getCustomizationMigrationCategory);
		const configurationChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, event =>
			categories.some(category => event.affectsConfiguration(category.enablementSetting))));
		const customizationsChanged = observableSignalFromEvent(this, migrationService.onDidChangeCustomizations);
		const ignoredGroupsChanged = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key === CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY,
		));
		this._register(autorun(reader => {
			const current = context.read(reader);
			configurationChanged.read(reader);
			customizationsChanged.read(reader);
			ignoredGroupsChanged.read(reader);
			if (!current) {
				this.availableValue.set(false, undefined);
				return;
			}
			const ignored = getIgnoredCustomizationMigrationGroups(storageService, getChatSessionType(current.sessionResource), current.projectRoot);
			const token = cancelOnDispose(reader.store);
			void migrationService.computeMigrationHint(current.sessionResource, token, ignored).then(hint => {
				if (!token.isCancellationRequested) {
					this.availableValue.set(hint !== undefined, undefined);
				}
			}, error => {
				if (!isCancellationError(error)) {
					logService.error('Failed to check customization migrations', error);
				}
				if (!token.isCancellationRequested) {
					this.availableValue.set(false, undefined);
				}
			});
		}));
	}
}
