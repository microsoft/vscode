/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { SearchExtensionsAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { EnablementState, IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionIgnoredRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';

interface IExtensionsConfiguration {
	autoUpdate: boolean;
	autoCheckUpdates: boolean;
	ignoreRecommendations: boolean;
	showRecommendationsOnlyOnDemand: boolean;
	closeExtensionDetailsOnViewChange: boolean;
}

type ExtensionRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	extensionId?: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type ExtensionWorkspaceRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

const ignoreImportantExtensionRecommendation = 'extensionsAssistant/importantRecommendationsIgnore';
const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
const choiceNever = localize('neverShowAgain', "Don't Show Again");

export class ExtensionRecommendationNotificationService extends Disposable implements IExtensionRecommendationNotificationService {

	declare readonly _serviceBrand: undefined;

	// Ignored Important Recommendations
	get ignoredRecommendations(): string[] {
		return [...(<string[]>JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendation, StorageScope.GLOBAL, '[]')))].map(i => i.toLowerCase());
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionIgnoredRecommendationsService private readonly extensionIgnoredRecommendationsService: IExtensionIgnoredRecommendationsService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super();
		storageKeysSyncRegistryService.registerStorageKey({ key: ignoreImportantExtensionRecommendation, version: 1 });
	}

	hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<IExtensionsConfiguration>('extensions');
		return config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand;
	}

	async promptImportantExtensionsInstallNotification(extensionIds: string[], message: string, searchValue: string): Promise<boolean> {
		if (this.hasToIgnoreRecommendationNotifications()) {
			return false;
		}

		extensionIds = this.filterIgnoredOrNotAllowed(extensionIds);
		if (!extensionIds.length) {
			return false;
		}

		const extensions = await this.getInstallableExtensions(extensionIds);
		if (!extensions.length) {
			return false;
		}

		this.notificationService.prompt(Severity.Info, message,
			[{
				label: localize('install', "Install"),
				run: async () => {
					this.runAction(this.instantiationService.createInstance(SearchExtensionsAction, searchValue));
					await Promise.all(extensions.map(async extension => {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'install', extensionId: extension.identifier.id });
						this.extensionsWorkbenchService.open(extension, { pinned: true });
						await this.extensionManagementService.installFromGallery(extension.gallery!);
					}));
				}
			}, {
				label: localize('show recommendations', "Show Recommendations"),
				run: async () => {
					for (const extension of extensions) {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'show', extensionId: extension.identifier.id });
						this.extensionsWorkbenchService.open(extension, { pinned: true });
					}
					this.runAction(this.instantiationService.createInstance(SearchExtensionsAction, searchValue));
				}
			}, {
				label: choiceNever,
				isSecondary: true,
				run: () => {
					for (const extension of extensions) {
						this.addToImportantRecommendationsIgnore(extension.identifier.id);
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId: extension.identifier.id });
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
					for (const extension of extensions) {
						this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: extension.identifier.id });
					}
				}
			}
		);

		return true;
	}

	async promptWorkspaceRecommendations(recommendations: string[]): Promise<boolean> {
		if (this.hasToIgnoreWorkspaceRecommendationNotifications()) {
			return false;
		}

		let installed = await this.extensionManagementService.getInstalled();
		installed = installed.filter(l => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind); // Filter extensions disabled by kind
		recommendations = recommendations.filter(extensionId => installed.every(local => !areSameExtensions({ id: extensionId }, local.identifier)));

		if (!recommendations.length) {
			return false;
		}

		const extensions = await this.getInstallableExtensions(recommendations);
		if (!extensions.length) {
			return false;
		}

		const searchValue = '@recommended ';
		this.notificationService.prompt(
			Severity.Info,
			localize('workspaceRecommended', "Do you want to install the recommended extensions for this repository?"),
			[{
				label: localize('install', "Install"),
				run: async () => {
					this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'install' });
					await Promise.all(extensions.map(async extension => {
						this.extensionsWorkbenchService.open(extension, { pinned: true });
						await this.extensionManagementService.installFromGallery(extension.gallery!);
					}));
				}
			}, {
				label: localize('showRecommendations', "Show Recommendations"),
				run: async () => {
					this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });
					this.runAction(this.instantiationService.createInstance(SearchExtensionsAction, searchValue));
				}
			}, {
				label: localize('neverShowAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
					this.storageService.store(ignoreWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
				}
			}],
			{
				sticky: true,
				onCancel: () => {
					this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });
				}
			}
		);

		return true;
	}

	private hasToIgnoreWorkspaceRecommendationNotifications(): boolean {
		return this.hasToIgnoreRecommendationNotifications() || this.storageService.getBoolean(ignoreWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false);
	}

	private async getInstallableExtensions(extensionIds: string[]): Promise<IExtension[]> {
		const extensions: IExtension[] = [];
		if (extensionIds.length) {
			const pager = await this.extensionsWorkbenchService.queryGallery({ names: extensionIds, pageSize: extensionIds.length, source: 'install-recommendations' }, CancellationToken.None);
			for (const extension of pager.firstPage) {
				if (extension.gallery && (await this.extensionManagementService.canInstall(extension.gallery))) {
					extensions.push(extension);
				}
			}
		}
		return extensions;
	}

	private filterIgnoredOrNotAllowed(recommendationsToSuggest: string[]): string[] {
		const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
		return recommendationsToSuggest.filter(id => !ignoredRecommendations.includes(id));
	}

	private async runAction(action: IAction): Promise<void> {
		try {
			await action.run();
		} finally {
			action.dispose();
		}
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
