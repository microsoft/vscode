/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { SearchExtensionsAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { EnablementState, ExtensionRecommendationSource, IExtensionRecommendationReson, IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionsConfiguration, ConfigurationKey, IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { IAction } from 'vs/base/common/actions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

type ExtensionRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	extensionId?: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type ExtensionWorkspaceRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
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
		protected readonly promptedExtensionRecommendations: PromptedExtensionRecommendations,
	) {
		super();
	}

	private _activationPromise: Promise<void> | null = null;
	get activated(): boolean { return this._activationPromise !== null; }
	activate(): Promise<void> {
		if (!this._activationPromise) {
			this._activationPromise = this.doActivate();
		}
		return this._activationPromise;
	}

}

export class PromptedExtensionRecommendations extends Disposable {

	constructor(
		private readonly isExtensionAllowedToBeRecommended: (extensionId: string) => boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super();
		storageKeysSyncRegistryService.registerStorageKey({ key: ignoreImportantExtensionRecommendation, version: 1 });
	}

	async promptImportantExtensionsInstallNotification(extensionIds: string[], message: string, searchValue: string): Promise<void> {
		if (this.hasToIgnoreRecommendationNotifications()) {
			return;
		}

		const extensions = await this.getInstallableExtensions(extensionIds);
		if (!extensions.length) {
			return;
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
	}

	async promptWorkspaceRecommendations(recommendations: string[]): Promise<void> {
		if (this.hasToIgnoreWorkspaceRecommendationNotifications()) {
			return;
		}

		let installed = await this.extensionManagementService.getInstalled();
		installed = installed.filter(l => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind); // Filter extensions disabled by kind
		recommendations = recommendations.filter(extensionId => installed.every(local => !areSameExtensions({ id: extensionId }, local.identifier)));

		if (!recommendations.length) {
			return;
		}

		const extensions = await this.getInstallableExtensions(recommendations);
		if (!extensions.length) {
			return;
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
	}

	hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
		return config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand;
	}

	hasToIgnoreWorkspaceRecommendationNotifications(): boolean {
		return this.hasToIgnoreRecommendationNotifications() || this.storageService.getBoolean(ignoreWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false);
	}

	filterIgnoredOrNotAllowed(recommendationsToSuggest: string[]): string[] {
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

