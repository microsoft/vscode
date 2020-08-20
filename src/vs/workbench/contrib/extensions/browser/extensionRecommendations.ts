/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { InstallRecommendedExtensionAction, ShowRecommendedExtensionAction, ShowRecommendedExtensionsAction, InstallRecommendedExtensionsAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { ExtensionRecommendationSource, IExtensionRecommendationReson } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionsConfiguration, ConfigurationKey } from 'vs/workbench/contrib/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { IAction } from 'vs/base/common/actions';

type ExtensionRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

const ignoreImportantExtensionRecommendation = 'extensionsAssistant/importantRecommendationsIgnore';
const choiceNever = localize('neverShowAgain', "Don't Show Again");

export type ExtensionRecommendation = {
	readonly extensionId: string,
	readonly source: ExtensionRecommendationSource;
	readonly reason: IExtensionRecommendationReson;
};

export abstract class ExtensionRecommendations extends Disposable {

	readonly abstract recommendations: ReadonlyArray<ExtensionRecommendation>;
	protected abstract doActivate(): Promise<void>;

	constructor(
		protected readonly isExtensionAllowedToBeRecommended: (extensionId: string) => boolean,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@INotificationService protected readonly notificationService: INotificationService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IStorageService protected readonly storageService: IStorageService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super();
		storageKeysSyncRegistryService.registerStorageKey({ key: ignoreImportantExtensionRecommendation, version: 1 });
	}

	private _activationPromise: Promise<void> | null = null;
	get activated(): boolean { return this._activationPromise !== null; }
	activate(): Promise<void> {
		if (!this._activationPromise) {
			this._activationPromise = this.doActivate();
		}
		return this._activationPromise;
	}

	private runAction(action: IAction) {
		try {
			action.run();
		} finally {
			action.dispose();
		}
	}

	protected promptImportantExtensionsInstallNotification(extensionIds: string[], message: string): void {
		this.notificationService.prompt(Severity.Info, message,
			[{
				label: extensionIds.length === 1 ? localize('install', 'Install') : localize('installAll', "Install All"),
				run: async () => {
					for (const extensionId of extensionIds) {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'install', extensionId });
					}
					if (extensionIds.length === 1) {
						this.runAction(this.instantiationService.createInstance(InstallRecommendedExtensionAction, extensionIds[0]));
					} else {
						this.runAction(this.instantiationService.createInstance(InstallRecommendedExtensionsAction, InstallRecommendedExtensionsAction.ID, InstallRecommendedExtensionsAction.LABEL, extensionIds, 'install-recommendations'));
					}
				}
			}, {
				label: extensionIds.length === 1 ? localize('moreInformation', "More Information") : localize('showRecommendations', "Show Recommendations"),
				run: () => {
					for (const extensionId of extensionIds) {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'show', extensionId });
					}
					if (extensionIds.length === 1) {
						this.runAction(this.instantiationService.createInstance(ShowRecommendedExtensionAction, extensionIds[0]));
					} else {
						this.runAction(this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, ShowRecommendedExtensionsAction.LABEL));
					}
				}
			}, {
				label: choiceNever,
				isSecondary: true,
				run: () => {
					for (const extensionId of extensionIds) {
						this.addToImportantRecommendationsIgnore(extensionId);
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId });
					}
					this.notificationService.prompt(
						Severity.Info,
						localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations?"),
						[{
							label: localize('ignoreAll', "Yes, Ignore All"),
							run: () => this.setIgnoreRecommendationsConfig(true)
						}, {
							label: localize('no', "No"),
							run: () => this.setIgnoreRecommendationsConfig(false)
						}]
					);
				}
			}],
			{
				sticky: true,
				onCancel: () => {
					for (const extensionId of extensionIds) {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId });
					}
				}
			}
		);
	}

	protected hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
		return config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand;
	}

	protected filterIgnoredOrNotAllowed(recommendationsToSuggest: string[]): string[] {
		const importantRecommendationsIgnoreList = (<string[]>JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendation, StorageScope.GLOBAL, '[]'))).map(e => e.toLowerCase());
		return recommendationsToSuggest.filter(id => {
			if (importantRecommendationsIgnoreList.indexOf(id) !== -1) {
				return false;
			}
			if (!this.isExtensionAllowedToBeRecommended(id)) {
				return false;
			}
			return true;
		});
	}

	private addToImportantRecommendationsIgnore(id: string) {
		const importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendation, StorageScope.GLOBAL, '[]'));
		importantRecommendationsIgnoreList.push(id.toLowerCase());
		this.storageService.store(ignoreImportantExtensionRecommendation, JSON.stringify(importantRecommendationsIgnoreList), StorageScope.GLOBAL);
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
	}

}

