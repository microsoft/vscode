/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { CancelablePromise, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionRecommendationNotificationService, RecommendationsNotificationResult, RecommendationSource } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { INotificationHandle, INotificationService, IPromptChoice, IPromptOptions, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { SearchExtensionsAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
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

const ignoreImportantExtensionRecommendationStorageKey = 'extensionsAssistant/importantRecommendationsIgnore';
const donotShowWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
const choiceNever = localize('neverShowAgain', "Don't Show Again");

type RecommendationNotification = {
	severity: Severity,
	message: string,
	choices: IPromptChoice[],
	options?: IPromptOptions,
	priority: RecommendationSource,
};
type VisibleRecommendationNotification = RecommendationNotification & { notificationHandle: INotificationHandle, from: number };
type PendingRecommendationNotification = RecommendationNotification & { onDidShow: (notificationHandle: INotificationHandle) => void };

export class ExtensionRecommendationNotificationService implements IExtensionRecommendationNotificationService {

	declare readonly _serviceBrand: undefined;

	private readonly tasExperimentService: ITASExperimentService | undefined;

	// Ignored Important Recommendations
	get ignoredRecommendations(): string[] {
		return distinct([...(<string[]>JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendationStorageKey, StorageScope.GLOBAL, '[]')))].map(i => i.toLowerCase()));
	}

	private notificationsCount: number = 0;
	private hideVisibleNotificationPromise: CancelablePromise<void> | undefined;
	private visibleNotification: VisibleRecommendationNotification | undefined;
	private pendingNotificaitons: PendingRecommendationNotification[] = [];

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
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
	) {
		storageKeysSyncRegistryService.registerStorageKey({ key: ignoreImportantExtensionRecommendationStorageKey, version: 1 });
		this.tasExperimentService = tasExperimentService;
	}

	hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<IExtensionsConfiguration>('extensions');
		return config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand;
	}

	async promptImportantExtensionsInstallNotification(extensionIds: string[], message: string, searchValue: string, source: RecommendationSource): Promise<RecommendationsNotificationResult> {
		if (this.hasToIgnoreRecommendationNotifications()) {
			return RecommendationsNotificationResult.Ignored;
		}

		const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
		extensionIds = extensionIds.filter(id => !ignoredRecommendations.includes(id));
		if (!extensionIds.length) {
			return RecommendationsNotificationResult.Ignored;
		}

		const extensions = await this.getInstallableExtensions(extensionIds);
		if (!extensions.length) {
			return RecommendationsNotificationResult.Ignored;
		}

		// Do not show exe recommendation if the window has shown two recommendations already
		if (this.notificationsCount >= 2 && source === RecommendationSource.EXE) {
			return RecommendationsNotificationResult.TooMany;
		}

		if (this.tasExperimentService && extensionIds.indexOf('ms-vscode-remote.remote-wsl') !== -1) {
			await this.tasExperimentService.getTreatment<boolean>('wslpopupaa');
		}

		return new Promise<RecommendationsNotificationResult>(async (c, e) => {
			let result = RecommendationsNotificationResult.Accepted;
			const handle = await this.showNotification({
				severity: Severity.Info,
				message,
				priority: source,
				choices: [{
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
				options: {
					sticky: true,
					onCancel: () => {
						result = RecommendationsNotificationResult.Cancelled;
						for (const extension of extensions) {
							this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: extension.identifier.id });
						}
					}
				}
			}
			);
			const disposable = handle.onDidClose(() => {
				disposable.dispose();
				c(result);
			});
		});
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
		let cancelled = false;
		const handle = await this.showNotification({
			severity: Severity.Info,
			message: localize('workspaceRecommended', "Do you want to install the recommended extensions for this repository?"),
			choices: [{
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
				}
			}],
			options: {
				sticky: true,
				onCancel: () => {
					cancelled = true;
					this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });
				}
			},
			priority: RecommendationSource.WORKSPACE
		});

		const disposable = handle.onDidClose(() => {
			disposable.dispose();
			if (!cancelled) {
				this.storageService.store(donotShowWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
			}
		});

	}

	/**
	 * Show recommendations in Queue
	 * At any time only one recommendation is shown
	 * If a new recommendation comes in
	 * 		=> If no recommendation is visible, show it immediately
	 *		=> Otherwise, add to the pending queue
	 * 			=> If it is higher or same priority, hide the current notification after showing it for 3s.
	 * 			=> Otherwise wait until the current notification is hidden.
	 */
	private async showNotification(recommendationNotification: RecommendationNotification): Promise<INotificationHandle> {
		this.notificationsCount++;
		if (this.visibleNotification) {
			return new Promise<INotificationHandle>((onDidShow, e) => {
				this.pendingNotificaitons.push({ ...recommendationNotification, onDidShow });
				if (recommendationNotification.priority <= this.visibleNotification!.priority) {
					this.hideVisibleNotification(3000);
				}
			});
		} else {
			const notificationHandle = this.notificationService.prompt(recommendationNotification.severity, recommendationNotification.message, recommendationNotification.choices, recommendationNotification.options);
			this.visibleNotification = { ...recommendationNotification, notificationHandle, from: Date.now() };
			const disposable = Event.once(Event.filter(notificationHandle.onDidChangeVisibility, e => !e))(() => {
				disposable.dispose();
				this.showNextNotification();
			});
			return notificationHandle;
		}
	}

	private showNextNotification(): void {
		const index = this.getNextPendingNotificationIndex();
		const [nextNotificaiton] = index > -1 ? this.pendingNotificaitons.splice(index, 1) : [];

		// Show the next notification after a delay of 500ms (after the current notification is dismissed)
		timeout(nextNotificaiton ? 500 : 0)
			.then(() => {
				this.unsetVisibileNotification();
				if (nextNotificaiton) {
					this.showNotification(nextNotificaiton).then(nextNotificaiton.onDidShow);
				}
			});
	}

	/**
	 * Return the recent high priroity pending notification
	 */
	private getNextPendingNotificationIndex(): number {
		let index = this.pendingNotificaitons.length - 1;
		if (this.pendingNotificaitons.length) {
			for (let i = 0; i < this.pendingNotificaitons.length; i++) {
				if (this.pendingNotificaitons[i].priority <= this.pendingNotificaitons[index].priority) {
					index = i;
				}
			}
		}
		return index;
	}

	private hideVisibleNotification(timeInMillis: number): void {
		if (this.visibleNotification && !this.hideVisibleNotificationPromise) {
			const visibleRecommendationNotification = this.visibleNotification;
			this.hideVisibleNotificationPromise = timeout(Math.max(timeInMillis - (Date.now() - visibleRecommendationNotification.from), 0));
			this.hideVisibleNotificationPromise.then(() => {
				visibleRecommendationNotification.notificationHandle.close();
				this.notificationService.prompt(visibleRecommendationNotification.severity, visibleRecommendationNotification.message, visibleRecommendationNotification.choices, { ...visibleRecommendationNotification.options, silent: true, sticky: false });
			});
		}
	}

	private unsetVisibileNotification(): void {
		this.hideVisibleNotificationPromise?.cancel();
		this.hideVisibleNotificationPromise = undefined;
		this.visibleNotification = undefined;
	}

	private hasToIgnoreWorkspaceRecommendationNotifications(): boolean {
		return this.hasToIgnoreRecommendationNotifications() || this.storageService.getBoolean(donotShowWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false);
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
		const importantRecommendationsIgnoreList = [...this.ignoredRecommendations];
		if (!importantRecommendationsIgnoreList.includes(id.toLowerCase())) {
			importantRecommendationsIgnoreList.push(id.toLowerCase());
			this.storageService.store(ignoreImportantExtensionRecommendationStorageKey, JSON.stringify(importantRecommendationsIgnoreList), StorageScope.GLOBAL);
		}
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
	}
}
