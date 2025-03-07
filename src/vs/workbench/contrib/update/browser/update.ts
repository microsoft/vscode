/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import severity from '../../../../base/common/severity.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IActivityService, NumberBadge, IBadge, ProgressBadge } from '../../../services/activity/common/activity.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUpdateService, State as UpdateState, StateType, IUpdate, DisablementReason } from '../../../../platform/update/common/update.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ReleaseNotesManager } from './releaseNotesEditor.js';
import { isMacintosh, isWeb, isWindows } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuRegistry, MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, SyncStatus, UserDataSyncStoreType } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { Promises } from '../../../../base/common/async.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';
import { Event } from '../../../../base/common/event.js';
import { toAction } from '../../../../base/common/actions.js';

export const CONTEXT_UPDATE_STATE = new RawContextKey<string>('updateState', StateType.Uninitialized);
export const MAJOR_MINOR_UPDATE_AVAILABLE = new RawContextKey<boolean>('majorMinorUpdateAvailable', false);
export const RELEASE_NOTES_URL = new RawContextKey<string>('releaseNotesUrl', '');
export const DOWNLOAD_URL = new RawContextKey<string>('downloadUrl', '');

let releaseNotesManager: ReleaseNotesManager | undefined = undefined;

export function showReleaseNotesInEditor(instantiationService: IInstantiationService, version: string, useCurrentFile: boolean) {
	if (!releaseNotesManager) {
		releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
	}

	return releaseNotesManager.show(version, useCurrentFile);
}

async function openLatestReleaseNotesInBrowser(accessor: ServicesAccessor) {
	const openerService = accessor.get(IOpenerService);
	const productService = accessor.get(IProductService);

	if (productService.releaseNotesUrl) {
		const uri = URI.parse(productService.releaseNotesUrl);
		await openerService.open(uri);
	} else {
		throw new Error(nls.localize('update.noReleaseNotesOnline', "This version of {0} does not have release notes online", productService.nameLong));
	}
}

async function showReleaseNotes(accessor: ServicesAccessor, version: string) {
	const instantiationService = accessor.get(IInstantiationService);
	try {
		await showReleaseNotesInEditor(instantiationService, version, false);
	} catch (err) {
		try {
			await instantiationService.invokeFunction(openLatestReleaseNotesInBrowser);
		} catch (err2) {
			throw new Error(`${err.message} and ${err2.message}`);
		}
	}
}

interface IVersion {
	major: number;
	minor: number;
	patch: number;
}

function parseVersion(version: string): IVersion | undefined {
	const match = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(version);

	if (!match) {
		return undefined;
	}

	return {
		major: parseInt(match[1]),
		minor: parseInt(match[2]),
		patch: parseInt(match[3])
	};
}

function isMajorMinorUpdate(before: IVersion, after: IVersion): boolean {
	return before.major < after.major || before.minor < after.minor;
}

export class ProductContribution implements IWorkbenchContribution {

	private static readonly KEY = 'releaseNotes/lastVersion';

	constructor(
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@IProductService productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		if (productService.releaseNotesUrl) {
			const releaseNotesUrlKey = RELEASE_NOTES_URL.bindTo(contextKeyService);
			releaseNotesUrlKey.set(productService.releaseNotesUrl);
		}
		if (productService.downloadUrl) {
			const downloadUrlKey = DOWNLOAD_URL.bindTo(contextKeyService);
			downloadUrlKey.set(productService.downloadUrl);
		}

		if (isWeb) {
			return;
		}

		hostService.hadLastFocus().then(async hadLastFocus => {
			if (!hadLastFocus) {
				return;
			}

			const lastVersion = parseVersion(storageService.get(ProductContribution.KEY, StorageScope.APPLICATION, ''));
			const currentVersion = parseVersion(productService.version);
			const shouldShowReleaseNotes = configurationService.getValue<boolean>('update.showReleaseNotes');
			const releaseNotesUrl = productService.releaseNotesUrl;

			// was there a major/minor update? if so, open release notes
			if (shouldShowReleaseNotes && !environmentService.skipReleaseNotes && releaseNotesUrl && lastVersion && currentVersion && isMajorMinorUpdate(lastVersion, currentVersion)) {
				showReleaseNotesInEditor(instantiationService, productService.version, false)
					.then(undefined, () => {
						notificationService.prompt(
							severity.Info,
							nls.localize('read the release notes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", productService.nameLong, productService.version),
							[{
								label: nls.localize('releaseNotes', "Release Notes"),
								run: () => {
									const uri = URI.parse(releaseNotesUrl);
									openerService.open(uri);
								}
							}]
						);
					});
			}

			storageService.store(ProductContribution.KEY, productService.version, StorageScope.APPLICATION, StorageTarget.MACHINE);
		});
	}
}

export class UpdateContribution extends Disposable implements IWorkbenchContribution {

	private state: UpdateState;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private updateStateContextKey: IContextKey<string>;
	private majorMinorUpdateAvailableContextKey: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IActivityService private readonly activityService: IActivityService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService private readonly hostService: IHostService
	) {
		super();
		this.state = updateService.state;
		this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(this.contextKeyService);
		this.majorMinorUpdateAvailableContextKey = MAJOR_MINOR_UPDATE_AVAILABLE.bindTo(this.contextKeyService);

		this._register(updateService.onStateChange(this.onUpdateStateChange, this));
		this.onUpdateStateChange(this.updateService.state);

		/*
		The `update/lastKnownVersion` and `update/updateNotificationTime` storage keys are used in
		combination to figure out when to show a message to the user that he should update.

		This message should appear if the user has received an update notification but hasn't
		updated since 5 days.
		*/

		const currentVersion = this.productService.commit;
		const lastKnownVersion = this.storageService.get('update/lastKnownVersion', StorageScope.APPLICATION);

		// if current version != stored version, clear both fields
		if (currentVersion !== lastKnownVersion) {
			this.storageService.remove('update/lastKnownVersion', StorageScope.APPLICATION);
			this.storageService.remove('update/updateNotificationTime', StorageScope.APPLICATION);
		}

		this.registerGlobalActivityActions();
	}

	private async onUpdateStateChange(state: UpdateState): Promise<void> {
		this.updateStateContextKey.set(state.type);

		switch (state.type) {
			case StateType.Disabled:
				if (state.reason === DisablementReason.RunningAsAdmin) {
					this.notificationService.notify({
						severity: Severity.Info,
						message: nls.localize('update service disabled', "Updates are disabled because you are running the user-scope installation of {0} as Administrator.", this.productService.nameLong),
						actions: {
							primary: [
								toAction({
									id: '',
									label: nls.localize('learn more', "Learn More"),
									run: () => this.openerService.open('https://aka.ms/vscode-windows-setup')
								})
							]
						},
						neverShowAgain: { id: 'no-updates-running-as-admin', }
					});
				}
				break;

			case StateType.Idle:
				if (state.error) {
					this.onError(state.error);
				} else if (this.state.type === StateType.CheckingForUpdates && this.state.explicit && await this.hostService.hadLastFocus()) {
					this.onUpdateNotAvailable();
				}
				break;

			case StateType.AvailableForDownload:
				this.onUpdateAvailable(state.update);
				break;

			case StateType.Downloaded:
				this.onUpdateDownloaded(state.update);
				break;

			case StateType.Ready: {
				const productVersion = state.update.productVersion;
				if (productVersion) {
					const currentVersion = parseVersion(this.productService.version);
					const nextVersion = parseVersion(productVersion);
					this.majorMinorUpdateAvailableContextKey.set(Boolean(currentVersion && nextVersion && isMajorMinorUpdate(currentVersion, nextVersion)));
					this.onUpdateReady(state.update);
				}
				break;
			}
		}

		let badge: IBadge | undefined = undefined;

		if (state.type === StateType.AvailableForDownload || state.type === StateType.Downloaded || state.type === StateType.Ready) {
			badge = new NumberBadge(1, () => nls.localize('updateIsReady', "New {0} update available.", this.productService.nameShort));
		} else if (state.type === StateType.CheckingForUpdates) {
			badge = new ProgressBadge(() => nls.localize('checkingForUpdates', "Checking for {0} updates...", this.productService.nameShort));
		} else if (state.type === StateType.Downloading) {
			badge = new ProgressBadge(() => nls.localize('downloading', "Downloading {0} update...", this.productService.nameShort));
		} else if (state.type === StateType.Updating) {
			badge = new ProgressBadge(() => nls.localize('updating', "Updating {0}...", this.productService.nameShort));
		}

		this.badgeDisposable.clear();

		if (badge) {
			this.badgeDisposable.value = this.activityService.showGlobalActivity({ badge });
		}

		this.state = state;
	}

	private onError(error: string): void {
		if (/The request timed out|The network connection was lost/i.test(error)) {
			return;
		}

		error = error.replace(/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/, 'This might mean the application was put on quarantine by macOS. See [this link](https://github.com/microsoft/vscode/issues/7426#issuecomment-425093469) for more information');

		this.notificationService.notify({
			severity: Severity.Error,
			message: error,
			source: nls.localize('update service', "Update Service"),
		});
	}

	private onUpdateNotAvailable(): void {
		this.dialogService.info(nls.localize('noUpdatesAvailable', "There are currently no updates available."));
	}

	// linux
	private onUpdateAvailable(update: IUpdate): void {
		if (!this.shouldShowNotification()) {
			return;
		}

		const productVersion = update.productVersion;
		if (!productVersion) {
			return;
		}

		this.notificationService.prompt(
			severity.Info,
			nls.localize('thereIsUpdateAvailable', "There is an available update."),
			[{
				label: nls.localize('download update', "Download Update"),
				run: () => this.updateService.downloadUpdate()
			}, {
				label: nls.localize('later', "Later"),
				run: () => { }
			}, {
				label: nls.localize('releaseNotes', "Release Notes"),
				run: () => {
					this.instantiationService.invokeFunction(accessor => showReleaseNotes(accessor, productVersion));
				}
			}]
		);
	}

	// windows fast updates
	private onUpdateDownloaded(update: IUpdate): void {
		if (isMacintosh) {
			return;
		}
		if (this.configurationService.getValue('update.enableWindowsBackgroundUpdates') && this.productService.target === 'user') {
			return;
		}

		if (!this.shouldShowNotification()) {
			return;
		}

		const productVersion = update.productVersion;
		if (!productVersion) {
			return;
		}

		this.notificationService.prompt(
			severity.Info,
			nls.localize('updateAvailable', "There's an update available: {0} {1}", this.productService.nameLong, productVersion),
			[{
				label: nls.localize('installUpdate', "Install Update"),
				run: () => this.updateService.applyUpdate()
			}, {
				label: nls.localize('later', "Later"),
				run: () => { }
			}, {
				label: nls.localize('releaseNotes', "Release Notes"),
				run: () => {
					this.instantiationService.invokeFunction(accessor => showReleaseNotes(accessor, productVersion));
				}
			}]
		);
	}

	// windows and mac
	private onUpdateReady(update: IUpdate): void {
		if (!(isWindows && this.productService.target !== 'user') && !this.shouldShowNotification()) {
			return;
		}

		const actions = [{
			label: nls.localize('updateNow', "Update Now"),
			run: () => this.updateService.quitAndInstall()
		}, {
			label: nls.localize('later', "Later"),
			run: () => { }
		}];

		const productVersion = update.productVersion;
		if (productVersion) {
			actions.push({
				label: nls.localize('releaseNotes', "Release Notes"),
				run: () => {
					this.instantiationService.invokeFunction(accessor => showReleaseNotes(accessor, productVersion));
				}
			});
		}

		// windows user fast updates and mac
		this.notificationService.prompt(
			severity.Info,
			nls.localize('updateAvailableAfterRestart', "Restart {0} to apply the latest update.", this.productService.nameLong),
			actions,
			{ sticky: true }
		);
	}

	private shouldShowNotification(): boolean {
		const currentVersion = this.productService.commit;
		const currentMillis = new Date().getTime();
		const lastKnownVersion = this.storageService.get('update/lastKnownVersion', StorageScope.APPLICATION);

		// if version != stored version, save version and date
		if (currentVersion !== lastKnownVersion) {
			this.storageService.store('update/lastKnownVersion', currentVersion, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.storageService.store('update/updateNotificationTime', currentMillis, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		const updateNotificationMillis = this.storageService.getNumber('update/updateNotificationTime', StorageScope.APPLICATION, currentMillis);
		const diffDays = (currentMillis - updateNotificationMillis) / (1000 * 60 * 60 * 24);

		return diffDays > 5;
	}

	private registerGlobalActivityActions(): void {
		CommandsRegistry.registerCommand('update.check', () => this.updateService.checkForUpdates(true));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.check',
				title: nls.localize('checkForUpdates', "Check for Updates...")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle)
		});

		CommandsRegistry.registerCommand('update.checking', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.checking',
				title: nls.localize('checkingForUpdates2', "Checking for Updates..."),
				precondition: ContextKeyExpr.false()
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.CheckingForUpdates)
		});

		CommandsRegistry.registerCommand('update.downloadNow', () => this.updateService.downloadUpdate());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.downloadNow',
				title: nls.localize('download update_1', "Download Update (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload)
		});

		CommandsRegistry.registerCommand('update.downloading', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.downloading',
				title: nls.localize('DownloadingUpdate', "Downloading Update..."),
				precondition: ContextKeyExpr.false()
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloading)
		});

		CommandsRegistry.registerCommand('update.install', () => this.updateService.applyUpdate());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.install',
				title: nls.localize('installUpdate...', "Install Update... (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded)
		});

		CommandsRegistry.registerCommand('update.updating', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			command: {
				id: 'update.updating',
				title: nls.localize('installingUpdate', "Installing Update..."),
				precondition: ContextKeyExpr.false()
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Updating)
		});

		if (this.productService.quality === 'stable') {
			CommandsRegistry.registerCommand('update.showUpdateReleaseNotes', () => {
				if (this.updateService.state.type !== StateType.Ready) {
					return;
				}

				const productVersion = this.updateService.state.update.productVersion;
				if (productVersion) {
					this.instantiationService.invokeFunction(accessor => showReleaseNotes(accessor, productVersion));
				}

			});
			MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
				group: '7_update',
				order: 1,
				command: {
					id: 'update.showUpdateReleaseNotes',
					title: nls.localize('showUpdateReleaseNotes', "Show Update Release Notes")
				},
				when: ContextKeyExpr.and(CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready), MAJOR_MINOR_UPDATE_AVAILABLE)
			});
		}

		CommandsRegistry.registerCommand('update.restart', () => this.updateService.quitAndInstall());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '7_update',
			order: 2,
			command: {
				id: 'update.restart',
				title: nls.localize('restartToUpdate', "Restart to Update (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
		});

		CommandsRegistry.registerCommand('_update.state', () => {
			return this.state;
		});
	}
}

export class SwitchProductQualityContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IProductService private readonly productService: IProductService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService
	) {
		super();

		this.registerGlobalActivityActions();
	}

	private registerGlobalActivityActions(): void {
		const quality = this.productService.quality;
		const productQualityChangeHandler = this.environmentService.options?.productQualityChangeHandler;
		if (productQualityChangeHandler && (quality === 'stable' || quality === 'insider')) {
			const newQuality = quality === 'stable' ? 'insider' : 'stable';
			const commandId = `update.switchQuality.${newQuality}`;
			const isSwitchingToInsiders = newQuality === 'insider';
			this._register(registerAction2(class SwitchQuality extends Action2 {
				constructor() {
					super({
						id: commandId,
						title: isSwitchingToInsiders ? nls.localize('switchToInsiders', "Switch to Insiders Version...") : nls.localize('switchToStable', "Switch to Stable Version..."),
						precondition: IsWebContext,
						menu: {
							id: MenuId.GlobalActivity,
							when: IsWebContext,
							group: '7_update',
						}
					});
				}

				async run(accessor: ServicesAccessor): Promise<void> {
					const dialogService = accessor.get(IDialogService);
					const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
					const userDataSyncStoreManagementService = accessor.get(IUserDataSyncStoreManagementService);
					const storageService = accessor.get(IStorageService);
					const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
					const userDataSyncService = accessor.get(IUserDataSyncService);
					const notificationService = accessor.get(INotificationService);

					try {
						const selectSettingsSyncServiceDialogShownKey = 'switchQuality.selectSettingsSyncServiceDialogShown';
						const userDataSyncStore = userDataSyncStoreManagementService.userDataSyncStore;
						let userDataSyncStoreType: UserDataSyncStoreType | undefined;
						if (userDataSyncStore && isSwitchingToInsiders && userDataSyncEnablementService.isEnabled()
							&& !storageService.getBoolean(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION, false)) {
							userDataSyncStoreType = await this.selectSettingsSyncService(dialogService);
							if (!userDataSyncStoreType) {
								return;
							}
							storageService.store(selectSettingsSyncServiceDialogShownKey, true, StorageScope.APPLICATION, StorageTarget.USER);
							if (userDataSyncStoreType === 'stable') {
								// Update the stable service type in the current window, so that it uses stable service after switched to insiders version (after reload).
								await userDataSyncStoreManagementService.switch(userDataSyncStoreType);
							}
						}

						const res = await dialogService.confirm({
							type: 'info',
							message: nls.localize('relaunchMessage', "Changing the version requires a reload to take effect"),
							detail: newQuality === 'insider' ?
								nls.localize('relaunchDetailInsiders', "Press the reload button to switch to the Insiders version of VS Code.") :
								nls.localize('relaunchDetailStable', "Press the reload button to switch to the Stable version of VS Code."),
							primaryButton: nls.localize({ key: 'reload', comment: ['&& denotes a mnemonic'] }, "&&Reload")
						});

						if (res.confirmed) {
							const promises: Promise<any>[] = [];

							// If sync is happening wait until it is finished before reload
							if (userDataSyncService.status === SyncStatus.Syncing) {
								promises.push(Event.toPromise(Event.filter(userDataSyncService.onDidChangeStatus, status => status !== SyncStatus.Syncing)));
							}

							// If user chose the sync service then synchronise the store type option in insiders service, so that other clients using insiders service are also updated.
							if (isSwitchingToInsiders && userDataSyncStoreType) {
								promises.push(userDataSyncWorkbenchService.synchroniseUserDataSyncStoreType());
							}

							await Promises.settled(promises);

							productQualityChangeHandler(newQuality);
						} else {
							// Reset
							if (userDataSyncStoreType) {
								storageService.remove(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION);
							}
						}
					} catch (error) {
						notificationService.error(error);
					}
				}

				private async selectSettingsSyncService(dialogService: IDialogService): Promise<UserDataSyncStoreType | undefined> {
					const { result } = await dialogService.prompt<UserDataSyncStoreType>({
						type: Severity.Info,
						message: nls.localize('selectSyncService.message', "Choose the settings sync service to use after changing the version"),
						detail: nls.localize('selectSyncService.detail', "The Insiders version of VS Code will synchronize your settings, keybindings, extensions, snippets and UI State using separate insiders settings sync service by default."),
						buttons: [
							{
								label: nls.localize({ key: 'use insiders', comment: ['&& denotes a mnemonic'] }, "&&Insiders"),
								run: () => 'insiders'
							},
							{
								label: nls.localize({ key: 'use stable', comment: ['&& denotes a mnemonic'] }, "&&Stable (current)"),
								run: () => 'stable'
							}
						],
						cancelButton: true
					});
					return result;
				}
			}));
		}
	}
}
