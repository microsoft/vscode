/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { CancelablePromise, createCancelablePromise, Promises, raceCancellablePromises, raceCancellation, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IGalleryExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IExtensionRecommendationNotificationService, IExtensionRecommendations, RecommendationsNotificationResult, RecommendationSource, RecommendationSourceToString } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { INotificationHandle, INotificationService, IPromptChoice, IPromptChoiceWithMenu, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';

type ExtensionRecommendationsNotificationClassification = {
	owner: 'sandy081';
	comment: 'Response information when an extension is recommended';
	userReaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'User reaction after showing the recommendation prompt. Eg., install, cancel, show, neverShowAgain' };
	extensionId?: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Id of the extension that is recommended' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source from which this recommendation is coming from. Eg., file, exe.,' };
};

type ExtensionWorkspaceRecommendationsNotificationClassification = {
	owner: 'sandy081';
	comment: 'Response information when a recommendation from workspace is recommended';
	userReaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'User reaction after showing the recommendation prompt. Eg., install, cancel, show, neverShowAgain' };
};

const ignoreImportantExtensionRecommendationStorageKey = 'extensionsAssistant/importantRecommendationsIgnore';
const donotShowWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';

type RecommendationsNotificationActions = {
	onDidInstallRecommendedExtensions(extensions: IExtension[]): void;
	onDidShowRecommendedExtensions(extensions: IExtension[]): void;
	onDidCancelRecommendedExtensions(extensions: IExtension[]): void;
	onDidNeverShowRecommendedExtensionsAgain(extensions: IExtension[]): void;
};

type ExtensionRecommendations = Omit<IExtensionRecommendations, 'extensions'> & { extensions: Array<string | URI> };

class RecommendationsNotification extends Disposable {

	private _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private notificationHandle: INotificationHandle | undefined;
	private cancelled: boolean = false;

	constructor(
		private readonly severity: Severity,
		private readonly message: string,
		private readonly choices: IPromptChoice[],
		private readonly notificationService: INotificationService
	) {
		super();
	}

	show(): void {
		if (!this.notificationHandle) {
			this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { sticky: true, priority: NotificationPriority.OPTIONAL, onCancel: () => this.cancelled = true }));
		}
	}

	hide(): void {
		if (this.notificationHandle) {
			this.onDidCloseDisposable.clear();
			this.notificationHandle.close();
			this.cancelled = false;
			this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { priority: NotificationPriority.SILENT, onCancel: () => this.cancelled = true }));
		}
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	private readonly onDidCloseDisposable = this._register(new MutableDisposable());
	private readonly onDidChangeVisibilityDisposable = this._register(new MutableDisposable());
	private updateNotificationHandle(notificationHandle: INotificationHandle) {
		this.onDidCloseDisposable.clear();
		this.onDidChangeVisibilityDisposable.clear();
		this.notificationHandle = notificationHandle;

		this.onDidCloseDisposable.value = this.notificationHandle.onDidClose(() => {
			this.onDidCloseDisposable.dispose();
			this.onDidChangeVisibilityDisposable.dispose();

			this._onDidClose.fire();

			this._onDidClose.dispose();
			this._onDidChangeVisibility.dispose();
		});
		this.onDidChangeVisibilityDisposable.value = this.notificationHandle.onDidChangeVisibility((e) => this._onDidChangeVisibility.fire(e));
	}
}

type PendingRecommendationsNotification = { recommendationsNotification: RecommendationsNotification; source: RecommendationSource; token: CancellationToken };
type VisibleRecommendationsNotification = { recommendationsNotification: RecommendationsNotification; source: RecommendationSource; from: number };

export class ExtensionRecommendationNotificationService extends Disposable implements IExtensionRecommendationNotificationService {

	declare readonly _serviceBrand: undefined;

	// Ignored Important Recommendations
	get ignoredRecommendations(): string[] {
		return distinct([...(<string[]>JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendationStorageKey, StorageScope.PROFILE, '[]')))].map(i => i.toLowerCase()));
	}

	private recommendedExtensions: string[] = [];
	private recommendationSources: RecommendationSource[] = [];

	private hideVisibleNotificationPromise: CancelablePromise<void> | undefined;
	private visibleNotification: VisibleRecommendationsNotification | undefined;
	private pendingNotificaitons: PendingRecommendationsNotification[] = [];

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionIgnoredRecommendationsService private readonly extensionIgnoredRecommendationsService: IExtensionIgnoredRecommendationsService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<{ ignoreRecommendations: boolean; showRecommendationsOnlyOnDemand?: boolean }>('extensions');
		return config.ignoreRecommendations || !!config.showRecommendationsOnlyOnDemand;
	}

	async promptImportantExtensionsInstallNotification(extensionRecommendations: IExtensionRecommendations): Promise<RecommendationsNotificationResult> {
		const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
		const extensions = extensionRecommendations.extensions.filter(id => !ignoredRecommendations.includes(id));
		if (!extensions.length) {
			return RecommendationsNotificationResult.Ignored;
		}

		return this.promptRecommendationsNotification({ ...extensionRecommendations, extensions }, {
			onDidInstallRecommendedExtensions: (extensions: IExtension[]) => extensions.forEach(extension => this.telemetryService.publicLog2<{ userReaction: string; extensionId: string; source: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'install', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
			onDidShowRecommendedExtensions: (extensions: IExtension[]) => extensions.forEach(extension => this.telemetryService.publicLog2<{ userReaction: string; extensionId: string; source: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'show', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
			onDidCancelRecommendedExtensions: (extensions: IExtension[]) => extensions.forEach(extension => this.telemetryService.publicLog2<{ userReaction: string; extensionId: string; source: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
			onDidNeverShowRecommendedExtensionsAgain: (extensions: IExtension[]) => {
				for (const extension of extensions) {
					this.addToImportantRecommendationsIgnore(extension.identifier.id);
					this.telemetryService.publicLog2<{ userReaction: string; extensionId: string; source: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) });
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
			},
		});
	}

	async promptWorkspaceRecommendations(recommendations: Array<string | URI>): Promise<void> {
		if (this.storageService.getBoolean(donotShowWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false)) {
			return;
		}

		let installed = await this.extensionManagementService.getInstalled();
		installed = installed.filter(l => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind); // Filter extensions disabled by kind
		recommendations = recommendations.filter(recommendation => installed.every(local =>
			isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.location)
		));
		if (!recommendations.length) {
			return;
		}

		await this.promptRecommendationsNotification({ extensions: recommendations, source: RecommendationSource.WORKSPACE, name: localize({ key: 'this repository', comment: ['this repository means the current repository that is opened'] }, "this repository") }, {
			onDidInstallRecommendedExtensions: () => this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'install' }),
			onDidShowRecommendedExtensions: () => this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'show' }),
			onDidCancelRecommendedExtensions: () => this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' }),
			onDidNeverShowRecommendedExtensionsAgain: () => {
				this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
				this.storageService.store(donotShowWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			},
		});

	}

	private async promptRecommendationsNotification({ extensions: extensionIds, source, name, searchValue }: ExtensionRecommendations, recommendationsNotificationActions: RecommendationsNotificationActions): Promise<RecommendationsNotificationResult> {

		if (this.hasToIgnoreRecommendationNotifications()) {
			return RecommendationsNotificationResult.Ignored;
		}

		// Do not show exe based recommendations in remote window
		if (source === RecommendationSource.EXE && this.workbenchEnvironmentService.remoteAuthority) {
			return RecommendationsNotificationResult.IncompatibleWindow;
		}

		// Ignore exe recommendation if the window
		// 		=> has shown an exe based recommendation already
		// 		=> or has shown any two recommendations already
		if (source === RecommendationSource.EXE && (this.recommendationSources.includes(RecommendationSource.EXE) || this.recommendationSources.length >= 2)) {
			return RecommendationsNotificationResult.TooMany;
		}

		this.recommendationSources.push(source);

		// Ignore exe recommendation if recommendations are already shown
		if (source === RecommendationSource.EXE && extensionIds.every(id => isString(id) && this.recommendedExtensions.includes(id))) {
			return RecommendationsNotificationResult.Ignored;
		}

		const extensions = await this.getInstallableExtensions(extensionIds);
		if (!extensions.length) {
			return RecommendationsNotificationResult.Ignored;
		}

		this.recommendedExtensions = distinct([...this.recommendedExtensions, ...extensionIds.filter(isString)]);

		let extensionsMessage = '';
		if (extensions.length === 1) {
			extensionsMessage = localize('extensionFromPublisher', "'{0}' extension from {1}", extensions[0].displayName, extensions[0].publisherDisplayName);
		} else {
			const publishers = [...extensions.reduce((result, extension) => result.add(extension.publisherDisplayName), new Set<string>())];
			if (publishers.length > 2) {
				extensionsMessage = localize('extensionsFromMultiplePublishers', "extensions from {0}, {1} and others", publishers[0], publishers[1]);
			} else if (publishers.length === 2) {
				extensionsMessage = localize('extensionsFromPublishers', "extensions from {0} and {1}", publishers[0], publishers[1]);
			} else {
				extensionsMessage = localize('extensionsFromPublisher', "extensions from {0}", publishers[0]);
			}
		}

		let message = localize('recommended', "Do you want to install the recommended {0} for {1}?", extensionsMessage, name);
		if (source === RecommendationSource.EXE) {
			message = localize({ key: 'exeRecommended', comment: ['Placeholder string is the name of the software that is installed.'] }, "You have {0} installed on your system. Do you want to install the recommended {1} for it?", name, extensionsMessage);
		}
		if (!searchValue) {
			searchValue = source === RecommendationSource.WORKSPACE ? '@recommended' : extensions.map(extensionId => `@id:${extensionId.identifier.id}`).join(' ');
		}

		const donotShowAgainLabel = source === RecommendationSource.WORKSPACE ? localize('donotShowAgain', "Don't Show Again for this Repository")
			: extensions.length > 1 ? localize('donotShowAgainExtension', "Don't Show Again for these Extensions") : localize('donotShowAgainExtensionSingle', "Don't Show Again for this Extension");

		return raceCancellablePromises([
			this._registerP(this.showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, recommendationsNotificationActions)),
			this._registerP(this.waitUntilRecommendationsAreInstalled(extensions))
		]);

	}

	private showRecommendationsNotification(extensions: IExtension[], message: string, searchValue: string, donotShowAgainLabel: string, source: RecommendationSource,
		{ onDidInstallRecommendedExtensions, onDidShowRecommendedExtensions, onDidCancelRecommendedExtensions, onDidNeverShowRecommendedExtensionsAgain }: RecommendationsNotificationActions): CancelablePromise<RecommendationsNotificationResult> {
		return createCancelablePromise<RecommendationsNotificationResult>(async token => {
			let accepted = false;
			const choices: (IPromptChoice | IPromptChoiceWithMenu)[] = [];
			const installExtensions = async (isMachineScoped: boolean) => {
				this.extensionsWorkbenchService.openSearch(searchValue);
				onDidInstallRecommendedExtensions(extensions);
				const galleryExtensions: IGalleryExtension[] = [], resourceExtensions: IExtension[] = [];
				for (const extension of extensions) {
					if (extension.gallery) {
						galleryExtensions.push(extension.gallery);
					} else if (extension.resourceExtension) {
						resourceExtensions.push(extension);
					}
				}
				await Promises.settled<any>([
					Promises.settled(extensions.map(extension => this.extensionsWorkbenchService.open(extension, { pinned: true }))),
					galleryExtensions.length ? this.extensionManagementService.installGalleryExtensions(galleryExtensions.map(e => ({ extension: e, options: { isMachineScoped } }))) : Promise.resolve(),
					resourceExtensions.length ? Promise.allSettled(resourceExtensions.map(r => this.extensionsWorkbenchService.install(r))) : Promise.resolve()
				]);
			};
			choices.push({
				label: localize('install', "Install"),
				run: () => installExtensions(false),
				menu: this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions) ? [{
					label: localize('install and do no sync', "Install (Do not sync)"),
					run: () => installExtensions(true)
				}] : undefined,
			});
			choices.push(...[{
				label: localize('show recommendations', "Show Recommendations"),
				run: async () => {
					onDidShowRecommendedExtensions(extensions);
					for (const extension of extensions) {
						this.extensionsWorkbenchService.open(extension, { pinned: true });
					}
					this.extensionsWorkbenchService.openSearch(searchValue);
				}
			}, {
				label: donotShowAgainLabel,
				isSecondary: true,
				run: () => {
					onDidNeverShowRecommendedExtensionsAgain(extensions);
				}
			}]);
			try {
				accepted = await this.doShowRecommendationsNotification(Severity.Info, message, choices, source, token);
			} catch (error) {
				if (!isCancellationError(error)) {
					throw error;
				}
			}

			if (accepted) {
				return RecommendationsNotificationResult.Accepted;
			} else {
				onDidCancelRecommendedExtensions(extensions);
				return RecommendationsNotificationResult.Cancelled;
			}

		});
	}

	private waitUntilRecommendationsAreInstalled(extensions: IExtension[]): CancelablePromise<RecommendationsNotificationResult.Accepted> {
		const installedExtensions: string[] = [];
		const disposables = new DisposableStore();
		return createCancelablePromise(async token => {
			disposables.add(token.onCancellationRequested(e => disposables.dispose()));
			return new Promise<RecommendationsNotificationResult.Accepted>((c, e) => {
				disposables.add(this.extensionManagementService.onInstallExtension(e => {
					installedExtensions.push(e.identifier.id.toLowerCase());
					if (extensions.every(e => installedExtensions.includes(e.identifier.id.toLowerCase()))) {
						c(RecommendationsNotificationResult.Accepted);
					}
				}));
			});
		});
	}

	/**
	 * Show recommendations in Queue
	 * At any time only one recommendation is shown
	 * If a new recommendation comes in
	 * 		=> If no recommendation is visible, show it immediately
	 *		=> Otherwise, add to the pending queue
	 * 			=> If it is not exe based and has higher or same priority as current, hide the current notification after showing it for 3s.
	 * 			=> Otherwise wait until the current notification is hidden.
	 */
	private async doShowRecommendationsNotification(severity: Severity, message: string, choices: IPromptChoice[], source: RecommendationSource, token: CancellationToken): Promise<boolean> {
		const disposables = new DisposableStore();
		try {
			const recommendationsNotification = disposables.add(new RecommendationsNotification(severity, message, choices, this.notificationService));
			disposables.add(Event.once(Event.filter(recommendationsNotification.onDidChangeVisibility, e => !e))(() => this.showNextNotification()));
			if (this.visibleNotification) {
				const index = this.pendingNotificaitons.length;
				disposables.add(token.onCancellationRequested(() => this.pendingNotificaitons.splice(index, 1)));
				this.pendingNotificaitons.push({ recommendationsNotification, source, token });
				if (source !== RecommendationSource.EXE && source <= this.visibleNotification.source) {
					this.hideVisibleNotification(3000);
				}
			} else {
				this.visibleNotification = { recommendationsNotification, source, from: Date.now() };
				recommendationsNotification.show();
			}
			await raceCancellation(new Promise(c => disposables.add(Event.once(recommendationsNotification.onDidClose)(c))), token);
			return !recommendationsNotification.isCancelled();
		} finally {
			disposables.dispose();
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
					this.visibleNotification = { recommendationsNotification: nextNotificaiton.recommendationsNotification, source: nextNotificaiton.source, from: Date.now() };
					nextNotificaiton.recommendationsNotification.show();
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
				if (this.pendingNotificaitons[i].source <= this.pendingNotificaitons[index].source) {
					index = i;
				}
			}
		}
		return index;
	}

	private hideVisibleNotification(timeInMillis: number): void {
		if (this.visibleNotification && !this.hideVisibleNotificationPromise) {
			const visibleNotification = this.visibleNotification;
			this.hideVisibleNotificationPromise = timeout(Math.max(timeInMillis - (Date.now() - visibleNotification.from), 0));
			this.hideVisibleNotificationPromise.then(() => visibleNotification.recommendationsNotification.hide());
		}
	}

	private unsetVisibileNotification(): void {
		this.hideVisibleNotificationPromise?.cancel();
		this.hideVisibleNotificationPromise = undefined;
		this.visibleNotification = undefined;
	}

	private async getInstallableExtensions(recommendations: Array<string | URI>): Promise<IExtension[]> {
		const result: IExtension[] = [];
		if (recommendations.length) {
			const galleryExtensions: string[] = [];
			const resourceExtensions: URI[] = [];
			for (const recommendation of recommendations) {
				if (typeof recommendation === 'string') {
					galleryExtensions.push(recommendation);
				} else {
					resourceExtensions.push(recommendation);
				}
			}
			if (galleryExtensions.length) {
				const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map(id => ({ id })), { source: 'install-recommendations' }, CancellationToken.None);
				for (const extension of extensions) {
					if (extension.gallery && await this.extensionManagementService.canInstall(extension.gallery) === true) {
						result.push(extension);
					}
				}
			}
			if (resourceExtensions.length) {
				const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
				for (const extension of extensions) {
					if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
						result.push(extension);
					}
				}
			}
		}
		return result;
	}

	private addToImportantRecommendationsIgnore(id: string) {
		const importantRecommendationsIgnoreList = [...this.ignoredRecommendations];
		if (!importantRecommendationsIgnoreList.includes(id.toLowerCase())) {
			importantRecommendationsIgnoreList.push(id.toLowerCase());
			this.storageService.store(ignoreImportantExtensionRecommendationStorageKey, JSON.stringify(importantRecommendationsIgnoreList), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal);
	}

	private _registerP<T>(o: CancelablePromise<T>): CancelablePromise<T> {
		this._register(toDisposable(() => o.cancel()));
		return o;
	}
}
