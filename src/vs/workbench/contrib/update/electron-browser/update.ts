/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import severity from 'vs/base/common/severity';
import { Action } from 'vs/base/common/actions';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import pkg from 'vs/platform/product/node/package';
import product from 'vs/platform/product/node/product';
import { URI } from 'vs/base/common/uri';
import { IActivityService, NumberBadge, IBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUpdateService, State as UpdateState, StateType, IUpdate } from 'vs/platform/update/common/update';
import * as semver from 'semver-umd';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ReleaseNotesManager } from './releaseNotesEditor';
import { isWindows } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { FalseContext } from 'vs/platform/contextkey/common/contextkeys';
import { ShowCurrentReleaseNotesActionId } from 'vs/workbench/contrib/update/common/update';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';

const CONTEXT_UPDATE_STATE = new RawContextKey<string>('updateState', StateType.Uninitialized);

let releaseNotesManager: ReleaseNotesManager | undefined = undefined;

function showReleaseNotes(instantiationService: IInstantiationService, version: string) {
	if (!releaseNotesManager) {
		releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
	}

	return instantiationService.invokeFunction(accessor => releaseNotesManager!.show(accessor, version));
}

export class OpenLatestReleaseNotesInBrowserAction extends Action {

	constructor(
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super('update.openLatestReleaseNotes', nls.localize('releaseNotes', "Release Notes"), undefined, true);
	}

	run(): Promise<any> {
		if (product.releaseNotesUrl) {
			const uri = URI.parse(product.releaseNotesUrl);
			return this.openerService.open(uri);
		}
		return Promise.resolve(false);
	}
}

export abstract class AbstractShowReleaseNotesAction extends Action {

	constructor(
		id: string,
		label: string,
		private version: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(id, label, undefined, true);
	}

	run(): Promise<boolean> {
		if (!this.enabled) {
			return Promise.resolve(false);
		}

		this.enabled = false;

		return showReleaseNotes(this.instantiationService, this.version)
			.then(undefined, () => {
				const action = this.instantiationService.createInstance(OpenLatestReleaseNotesInBrowserAction);
				return action.run().then(() => false);
			});
	}
}

export class ShowReleaseNotesAction extends AbstractShowReleaseNotesAction {

	constructor(
		version: string,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('update.showReleaseNotes', nls.localize('releaseNotes', "Release Notes"), version, instantiationService);
	}
}

export class ShowCurrentReleaseNotesAction extends AbstractShowReleaseNotesAction {

	static readonly ID = ShowCurrentReleaseNotesActionId;
	static LABEL = nls.localize('showReleaseNotes', "Show Release Notes");

	constructor(
		id = ShowCurrentReleaseNotesAction.ID,
		label = ShowCurrentReleaseNotesAction.LABEL,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, pkg.version, instantiationService);
	}
}

export class ProductContribution implements IWorkbenchContribution {

	private static readonly KEY = 'releaseNotes/lastVersion';

	constructor(
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWindowService windowService: IWindowService,
		@IWindowsService windowsService: IWindowsService
	) {
		windowsService.getActiveWindowId().then(async windowId => {
			if (windowId !== windowService.windowId) {
				return;
			}

			const lastVersion = storageService.get(ProductContribution.KEY, StorageScope.GLOBAL, '');
			const shouldShowReleaseNotes = configurationService.getValue<boolean>('update.showReleaseNotes');

			// was there an update? if so, open release notes
			if (shouldShowReleaseNotes && !environmentService.skipReleaseNotes && product.releaseNotesUrl && lastVersion && pkg.version !== lastVersion) {
				showReleaseNotes(instantiationService, pkg.version)
					.then(undefined, () => {
						notificationService.prompt(
							severity.Info,
							nls.localize('read the release notes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", product.nameLong, pkg.version),
							[{
								label: nls.localize('releaseNotes', "Release Notes"),
								run: () => {
									const uri = URI.parse(product.releaseNotesUrl);
									openerService.open(uri);
								}
							}],
							{ sticky: true }
						);
					});
			}

			// should we show the new license?
			if (product.licenseUrl && lastVersion && semver.satisfies(lastVersion, '<1.0.0') && semver.satisfies(pkg.version, '>=1.0.0')) {
				notificationService.info(nls.localize('licenseChanged', "Our license terms have changed, please click [here]({0}) to go through them.", product.licenseUrl));
			}

			storageService.store(ProductContribution.KEY, pkg.version, StorageScope.GLOBAL);
		});
	}
}

export class Win3264BitContribution implements IWorkbenchContribution {

	private static readonly URL = 'https://code.visualstudio.com/updates/v1_15#_windows-64-bit';
	private static readonly INSIDER_URL = 'https://github.com/Microsoft/vscode-docs/blob/vnext/release-notes/v1_15.md#windows-64-bit';

	constructor(
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		if (environmentService.disableUpdates) {
			return;
		}

		const url = product.quality === 'insider'
			? Win3264BitContribution.INSIDER_URL
			: Win3264BitContribution.URL;

		notificationService.prompt(
			severity.Info,
			nls.localize('64bitisavailable', "{0} for 64-bit Windows is now available! Click [here]({1}) to learn more.", product.nameShort, url),
			[],
			{
				sticky: true,
				neverShowAgain: { id: 'neverShowAgain:update/win32-64bits', isSecondary: true }
			}
		);
	}
}

export class UpdateContribution extends Disposable implements IWorkbenchContribution {

	private state: UpdateState;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private updateStateContextKey: IContextKey<string>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IActivityService private readonly activityService: IActivityService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.state = updateService.state;
		this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(this.contextKeyService);

		this._register(updateService.onStateChange(this.onUpdateStateChange, this));
		this.onUpdateStateChange(this.updateService.state);

		/*
		The `update/lastKnownVersion` and `update/updateNotificationTime` storage keys are used in
		combination to figure out when to show a message to the user that he should update.

		This message should appear if the user has received an update notification but hasn't
		updated since 5 days.
		*/

		const currentVersion = product.commit;
		const lastKnownVersion = this.storageService.get('update/lastKnownVersion', StorageScope.GLOBAL);

		// if current version != stored version, clear both fields
		if (currentVersion !== lastKnownVersion) {
			this.storageService.remove('update/lastKnownVersion', StorageScope.GLOBAL);
			this.storageService.remove('update/updateNotificationTime', StorageScope.GLOBAL);
		}

		this.registerGlobalActivityActions();
	}

	private onUpdateStateChange(state: UpdateState): void {
		this.updateStateContextKey.set(state.type);

		switch (state.type) {
			case StateType.Idle:
				if (state.error) {
					this.onError(state.error);
				} else if (this.state.type === StateType.CheckingForUpdates && this.state.context && this.state.context.windowId === this.environmentService.configuration.windowId) {
					this.onUpdateNotAvailable();
				}
				break;

			case StateType.AvailableForDownload:
				this.onUpdateAvailable(state.update);
				break;

			case StateType.Downloaded:
				this.onUpdateDownloaded(state.update);
				break;

			case StateType.Updating:
				this.onUpdateUpdating(state.update);
				break;

			case StateType.Ready:
				this.onUpdateReady(state.update);
				break;
		}

		let badge: IBadge | undefined = undefined;
		let clazz: string | undefined;

		if (state.type === StateType.AvailableForDownload || state.type === StateType.Downloaded || state.type === StateType.Ready) {
			badge = new NumberBadge(1, () => nls.localize('updateIsReady', "New {0} update available.", product.nameShort));
		} else if (state.type === StateType.CheckingForUpdates || state.type === StateType.Downloading || state.type === StateType.Updating) {
			badge = new ProgressBadge(() => nls.localize('updateIsReady', "New {0} update available.", product.nameShort));
			clazz = 'progress-badge';
		}

		this.badgeDisposable.clear();

		if (badge) {
			this.badgeDisposable.value = this.activityService.showActivity(GLOBAL_ACTIVITY_ID, badge, clazz);
		}

		this.state = state;
	}

	private onError(error: string): void {
		error = error.replace(/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/, 'See [this link](https://github.com/Microsoft/vscode/issues/7426#issuecomment-425093469) for more information');

		this.notificationService.notify({
			severity: Severity.Error,
			message: error,
			source: nls.localize('update service', "Update Service"),
		});
	}

	private onUpdateNotAvailable(): void {
		this.dialogService.show(
			severity.Info,
			nls.localize('noUpdatesAvailable', "There are currently no updates available."),
			[nls.localize('ok', "OK")]
		);
	}

	// linux
	private onUpdateAvailable(update: IUpdate): void {
		if (!this.shouldShowNotification()) {
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
					const action = this.instantiationService.createInstance(ShowReleaseNotesAction, update.productVersion);
					action.run();
					action.dispose();
				}
			}],
			{ sticky: true }
		);
	}

	// windows fast updates (target === system)
	private onUpdateDownloaded(update: IUpdate): void {
		if (!this.shouldShowNotification()) {
			return;
		}

		this.notificationService.prompt(
			severity.Info,
			nls.localize('updateAvailable', "There's an update available: {0} {1}", product.nameLong, update.productVersion),
			[{
				label: nls.localize('installUpdate', "Install Update"),
				run: () => this.updateService.applyUpdate()
			}, {
				label: nls.localize('later', "Later"),
				run: () => { }
			}, {
				label: nls.localize('releaseNotes', "Release Notes"),
				run: () => {
					const action = this.instantiationService.createInstance(ShowReleaseNotesAction, update.productVersion);
					action.run();
					action.dispose();
				}
			}],
			{ sticky: true }
		);
	}

	// windows fast updates
	private onUpdateUpdating(update: IUpdate): void {
		if (isWindows && product.target === 'user') {
			return;
		}

		// windows fast updates (target === system)
		this.notificationService.prompt(
			severity.Info,
			nls.localize('updateInstalling', "{0} {1} is being installed in the background; we'll let you know when it's done.", product.nameLong, update.productVersion),
			[],
			{
				neverShowAgain: { id: 'neverShowAgain:update/win32-fast-updates', isSecondary: true }
			}
		);
	}

	// windows and mac
	private onUpdateReady(update: IUpdate): void {
		if (!(isWindows && product.target !== 'user') && !this.shouldShowNotification()) {
			return;
		}

		const actions = [{
			label: nls.localize('updateNow', "Update Now"),
			run: () => this.updateService.quitAndInstall()
		}, {
			label: nls.localize('later', "Later"),
			run: () => { }
		}];

		// TODO@joao check why snap updates send `update` as falsy
		if (update.productVersion) {
			actions.push({
				label: nls.localize('releaseNotes', "Release Notes"),
				run: () => {
					const action = this.instantiationService.createInstance(ShowReleaseNotesAction, update.productVersion);
					action.run();
					action.dispose();
				}
			});
		}

		// windows user fast updates and mac
		this.notificationService.prompt(
			severity.Info,
			nls.localize('updateAvailableAfterRestart', "Restart {0} to apply the latest update.", product.nameLong),
			actions,
			{ sticky: true }
		);
	}

	private shouldShowNotification(): boolean {
		const currentVersion = product.commit;
		const currentMillis = new Date().getTime();
		const lastKnownVersion = this.storageService.get('update/lastKnownVersion', StorageScope.GLOBAL);

		// if version != stored version, save version and date
		if (currentVersion !== lastKnownVersion) {
			this.storageService.store('update/lastKnownVersion', currentVersion!, StorageScope.GLOBAL);
			this.storageService.store('update/updateNotificationTime', currentMillis, StorageScope.GLOBAL);
		}

		const updateNotificationMillis = this.storageService.getNumber('update/updateNotificationTime', StorageScope.GLOBAL, currentMillis);
		const diffDays = (currentMillis - updateNotificationMillis) / (1000 * 60 * 60 * 24);

		return diffDays > 5;
	}

	private registerGlobalActivityActions(): void {
		CommandsRegistry.registerCommand('update.check', () => this.updateService.checkForUpdates({ windowId: this.environmentService.configuration.windowId }));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.check',
				title: nls.localize('checkForUpdates', "Check for Updates...")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle)
		});

		CommandsRegistry.registerCommand('update.checking', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.checking',
				title: nls.localize('checkingForUpdates', "Checking for Updates..."),
				precondition: FalseContext
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.CheckingForUpdates)
		});

		CommandsRegistry.registerCommand('update.downloadNow', () => this.updateService.downloadUpdate());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.downloadNow',
				title: nls.localize('download update', "Download Update")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload)
		});

		CommandsRegistry.registerCommand('update.downloading', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.downloading',
				title: nls.localize('DownloadingUpdate', "Downloading Update..."),
				precondition: FalseContext
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloading)
		});

		CommandsRegistry.registerCommand('update.install', () => this.updateService.applyUpdate());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.install',
				title: nls.localize('installUpdate...', "Install Update...")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded)
		});

		CommandsRegistry.registerCommand('update.updating', () => { });
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.updating',
				title: nls.localize('installingUpdate', "Installing Update..."),
				precondition: FalseContext
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Updating)
		});

		CommandsRegistry.registerCommand('update.restart', () => this.updateService.quitAndInstall());
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			group: '5_update',
			command: {
				id: 'update.restart',
				title: nls.localize('restartToUpdate', "Restart to Update")
			},
			when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
		});
	}
}
