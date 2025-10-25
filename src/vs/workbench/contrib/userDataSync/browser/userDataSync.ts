/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import type { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyTrueExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { QuickPickItem, IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import {
	IUserDataAutoSyncService, IUserDataSyncService, registerConfiguration,
	SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, IUserDataSyncEnablementService,
	IResourcePreview, IUserDataSyncStoreManagementService, UserDataSyncStoreType, IUserDataSyncStore, IUserDataSyncResourceConflicts, IUserDataSyncResource, IUserDataSyncResourceError, USER_DATA_SYNC_LOG_ID
} from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IActivityService, IBadge, NumberBadge, ProgressBadge } from '../../../services/activity/common/activity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { fromNow } from '../../../../base/common/date.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewContainerLocation, IViewContainersRegistry, Extensions, ViewContainer } from '../../../common/views.js';
import { UserDataSyncDataViews } from './userDataSyncViews.js';
import { IUserDataSyncWorkbenchService, getSyncAreaLabel, AccountStatus, CONTEXT_SYNC_STATE, CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE, CONFIGURE_SYNC_COMMAND_ID, SHOW_SYNC_LOG_COMMAND_ID, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_VIEW_ICON, CONTEXT_HAS_CONFLICTS, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR } from '../../../services/userDataSync/common/userDataSync.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ctxIsMergeResultEditor, ctxMergeBaseUri } from '../../mergeEditor/common/mergeEditor.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { isWeb } from '../../../../base/common/platform.js';

type ConfigureSyncQuickPickItem = { id: SyncResource; label: string; description?: string };

type SyncConflictsClassification = {
	owner: 'sandy081';
	comment: 'Response information when conflict happens during settings sync';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'settings sync resource. eg., settings, keybindings...' };
	action?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'action taken while resolving conflicts. Eg: acceptLocal, acceptRemote' };
};

const turnOffSyncCommand = { id: 'workbench.userDataSync.actions.turnOff', title: localize2('stop sync', 'Turn Off') };
const configureSyncCommand = { id: CONFIGURE_SYNC_COMMAND_ID, title: localize2('configure sync', 'Configure...') };
const showConflictsCommandId = 'workbench.userDataSync.actions.showConflicts';
const syncNowCommand = {
	id: 'workbench.userDataSync.actions.syncNow',
	title: localize2('sync now', 'Sync Now'),
	description(userDataSyncService: IUserDataSyncService): string | undefined {
		if (userDataSyncService.status === SyncStatus.Syncing) {
			return localize('syncing', "syncing");
		}
		if (userDataSyncService.lastSyncTime) {
			return localize('synced with time', "synced {0}", fromNow(userDataSyncService.lastSyncTime, true));
		}
		return undefined;
	}
};
const showSyncSettingsCommand = { id: 'workbench.userDataSync.actions.settings', title: localize2('sync settings', 'Show Settings'), };
const showSyncedDataCommand = { id: 'workbench.userDataSync.actions.showSyncedData', title: localize2('show synced data', 'Show Synced Data'), };

const CONTEXT_TURNING_ON_STATE = new RawContextKey<false>('userDataSyncTurningOn', false);

export class UserDataSyncWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly turningOnSyncContext: IContextKey<boolean>;

	private readonly globalActivityBadgeDisposable = this._register(new MutableDisposable());
	private readonly accountBadgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncWorkbenchService private readonly userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOutputService private readonly outputService: IOutputService,
		@IUserDataAutoSyncService userDataAutoSyncService: IUserDataAutoSyncService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IHostService private readonly hostService: IHostService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchIssueService private readonly workbenchIssueService: IWorkbenchIssueService
	) {
		super();

		this.turningOnSyncContext = CONTEXT_TURNING_ON_STATE.bindTo(contextKeyService);

		if (userDataSyncWorkbenchService.enabled) {
			registerConfiguration();

			this.updateAccountBadge();
			this.updateGlobalActivityBadge();
			this.onDidChangeConflicts(this.userDataSyncService.conflicts);

			this._register(Event.any(
				Event.debounce(userDataSyncService.onDidChangeStatus, () => undefined, 500),
				this.userDataSyncEnablementService.onDidChangeEnablement,
				this.userDataSyncWorkbenchService.onDidChangeAccountStatus
			)(() => {
				this.updateAccountBadge();
				this.updateGlobalActivityBadge();
			}));
			this._register(userDataSyncService.onDidChangeConflicts(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
			this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
			this._register(userDataSyncService.onSyncErrors(errors => this.onSynchronizerErrors(errors)));
			this._register(userDataAutoSyncService.onError(error => this.onAutoSyncError(error)));

			this.registerActions();
			this.registerViews();

			textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));

			this._register(Event.any(userDataSyncService.onDidChangeStatus, userDataSyncEnablementService.onDidChangeEnablement)
				(() => this.turningOnSync = !userDataSyncEnablementService.isEnabled() && userDataSyncService.status !== SyncStatus.Idle));
		}
	}

	private get turningOnSync(): boolean {
		return !!this.turningOnSyncContext.get();
	}

	private set turningOnSync(turningOn: boolean) {
		this.turningOnSyncContext.set(turningOn);
		this.updateGlobalActivityBadge();
	}

	private toKey({ syncResource: resource, profile }: IUserDataSyncResource): string {
		return `${profile.id}:${resource}`;
	}

	private readonly conflictsDisposables = new Map<string, IDisposable>();
	private onDidChangeConflicts(conflicts: IUserDataSyncResourceConflicts[]) {
		this.updateGlobalActivityBadge();
		this.registerShowConflictsAction();
		if (!this.userDataSyncEnablementService.isEnabled()) {
			return;
		}
		if (conflicts.length) {
			// Clear and dispose conflicts those were cleared
			for (const [key, disposable] of this.conflictsDisposables.entries()) {
				if (!conflicts.some(conflict => this.toKey(conflict) === key)) {
					disposable.dispose();
					this.conflictsDisposables.delete(key);
				}
			}

			for (const conflict of this.userDataSyncService.conflicts) {
				const key = this.toKey(conflict);
				// Show conflicts notification if not shown before
				if (!this.conflictsDisposables.has(key)) {
					const conflictsArea = getSyncAreaLabel(conflict.syncResource);
					const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea.toLowerCase()),
						[
							{
								label: localize('replace remote', "Replace Remote"),
								run: () => {
									this.acceptLocal(conflict, conflict.conflicts[0]);
								}
							},
							{
								label: localize('replace local', "Replace Local"),
								run: () => {
									this.acceptRemote(conflict, conflict.conflicts[0]);
								}
							},
							{
								label: localize('show conflicts', "Show Conflicts"),
								run: () => {
									this.telemetryService.publicLog2<{ source: string; action?: string }, SyncConflictsClassification>('sync/showConflicts', { source: conflict.syncResource });
									this.userDataSyncWorkbenchService.showConflicts(conflict.conflicts[0]);
								}
							}
						],
						{
							sticky: true
						}
					);
					this.conflictsDisposables.set(key, toDisposable(() => {
						// close the conflicts warning notification
						handle.close();
						this.conflictsDisposables.delete(key);
					}));
				}
			}
		} else {
			this.conflictsDisposables.forEach(disposable => disposable.dispose());
			this.conflictsDisposables.clear();
		}
	}

	private async acceptRemote(syncResource: IUserDataSyncResource, conflict: IResourcePreview) {
		try {
			await this.userDataSyncService.accept(syncResource, conflict.remoteResource, undefined, this.userDataSyncEnablementService.isEnabled());
		} catch (e) {
			this.notificationService.error(localize('accept failed', "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
		}
	}

	private async acceptLocal(syncResource: IUserDataSyncResource, conflict: IResourcePreview): Promise<void> {
		try {
			await this.userDataSyncService.accept(syncResource, conflict.localResource, undefined, this.userDataSyncEnablementService.isEnabled());
		} catch (e) {
			this.notificationService.error(localize('accept failed', "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
		}
	}

	private onAutoSyncError(error: UserDataSyncError): void {
		switch (error.code) {
			case UserDataSyncErrorCode.SessionExpired:
				this.notificationService.notify({
					severity: Severity.Info,
					message: localize('session expired', "Settings sync was turned off because current session is expired, please sign in again to turn on sync."),
					actions: {
						primary: [toAction({
							id: 'turn on sync',
							label: localize('turn on sync', "Turn on Settings Sync..."),
							run: () => this.turnOn()
						})]
					}
				});
				break;
			case UserDataSyncErrorCode.TurnedOff:
				this.notificationService.notify({
					severity: Severity.Info,
					message: localize('turned off', "Settings sync was turned off from another device, please turn on sync again."),
					actions: {
						primary: [toAction({
							id: 'turn on sync',
							label: localize('turn on sync', "Turn on Settings Sync..."),
							run: () => this.turnOn()
						})]
					}
				});
				break;
			case UserDataSyncErrorCode.TooLarge:
				if (error.resource === SyncResource.Keybindings || error.resource === SyncResource.Settings || error.resource === SyncResource.Tasks) {
					this.disableSync(error.resource);
					const sourceArea = getSyncAreaLabel(error.resource);
					this.handleTooLargeError(error.resource, localize('too large', "Disabled syncing {0} because size of the {1} file to sync is larger than {2}. Please open the file and reduce the size and enable sync", sourceArea.toLowerCase(), sourceArea.toLowerCase(), '100kb'), error);
				}
				break;
			case UserDataSyncErrorCode.LocalTooManyProfiles:
				this.disableSync(SyncResource.Profiles);
				this.notificationService.error(localize('too many profiles', "Disabled syncing profiles because there are too many profiles to sync. Settings Sync supports syncing maximum 20 profiles. Please reduce the number of profiles and enable sync"));
				break;
			case UserDataSyncErrorCode.IncompatibleLocalContent:
			case UserDataSyncErrorCode.Gone:
			case UserDataSyncErrorCode.UpgradeRequired: {
				const message = localize('error upgrade required', "Settings sync is disabled because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
				const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
				this.notificationService.notify({
					severity: Severity.Error,
					message: operationId ? `${message} ${operationId}` : message,
				});
				break;
			}
			case UserDataSyncErrorCode.MethodNotFound: {
				const message = localize('method not found', "Settings sync is disabled because the client is making invalid requests. Please report an issue with the logs.");
				const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
				this.notificationService.notify({
					severity: Severity.Error,
					message: operationId ? `${message} ${operationId}` : message,
					actions: {
						primary: [
							toAction({
								id: 'Show Sync Logs',
								label: localize('show sync logs', "Show Log"),
								run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
							}),
							toAction({
								id: 'Report Issue',
								label: localize('report issue', "Report Issue"),
								run: () => this.workbenchIssueService.openReporter()
							})
						]
					}
				});
				break;
			}
			case UserDataSyncErrorCode.IncompatibleRemoteContent:
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('error reset required', "Settings sync is disabled because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
					actions: {
						primary: [
							toAction({
								id: 'reset',
								label: localize('reset', "Clear Data in Cloud..."),
								run: () => this.userDataSyncWorkbenchService.resetSyncedData()
							}),
							toAction({
								id: 'show synced data',
								label: localize('show synced data action', "Show Synced Data"),
								run: () => this.userDataSyncWorkbenchService.showSyncActivity()
							})
						]
					}
				});
				return;

			case UserDataSyncErrorCode.ServiceChanged:
				this.notificationService.notify({
					severity: Severity.Info,
					message: this.userDataSyncStoreManagementService.userDataSyncStore?.type === 'insiders' ?
						localize('service switched to insiders', "Settings Sync has been switched to insiders service") :
						localize('service switched to stable', "Settings Sync has been switched to stable service"),
				});

				return;

			case UserDataSyncErrorCode.DefaultServiceChanged:
				// Settings sync is using separate service
				if (this.userDataSyncEnablementService.isEnabled()) {
					this.notificationService.notify({
						severity: Severity.Info,
						message: localize('using separate service', "Settings sync now uses a separate service, more information is available in the [Settings Sync Documentation](https://aka.ms/vscode-settings-sync-help#_syncing-stable-versus-insiders)."),
					});
				}

				// If settings sync got turned off then ask user to turn on sync again.
				else {
					this.notificationService.notify({
						severity: Severity.Info,
						message: localize('service changed and turned off', "Settings sync was turned off because {0} now uses a separate service. Please turn on sync again.", this.productService.nameLong),
						actions: {
							primary: [toAction({
								id: 'turn on sync',
								label: localize('turn on sync', "Turn on Settings Sync..."),
								run: () => this.turnOn()
							})]
						}
					});
				}
				return;
		}
	}

	private handleTooLargeError(resource: SyncResource, message: string, error: UserDataSyncError): void {
		const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
		this.notificationService.notify({
			severity: Severity.Error,
			message: operationId ? `${message} ${operationId}` : message,
			actions: {
				primary: [toAction({
					id: 'open sync file',
					label: localize('open file', "Open {0} File", getSyncAreaLabel(resource)),
					run: () => resource === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
				})]
			}
		});
	}

	private readonly invalidContentErrorDisposables = new Map<string, IDisposable>();
	private onSynchronizerErrors(errors: IUserDataSyncResourceError[]): void {
		if (errors.length) {
			for (const { profile, syncResource: resource, error } of errors) {
				switch (error.code) {
					case UserDataSyncErrorCode.LocalInvalidContent:
						this.handleInvalidContentError({ profile, syncResource: resource });
						break;
					default: {
						const key = `${profile.id}:${resource}`;
						const disposable = this.invalidContentErrorDisposables.get(key);
						if (disposable) {
							disposable.dispose();
							this.invalidContentErrorDisposables.delete(key);
						}
					}
				}
			}
		} else {
			this.invalidContentErrorDisposables.forEach(disposable => disposable.dispose());
			this.invalidContentErrorDisposables.clear();
		}
	}

	private handleInvalidContentError({ profile, syncResource: source }: IUserDataSyncResource): void {
		if (this.userDataProfileService.currentProfile.id !== profile.id) {
			return;
		}
		const key = `${profile.id}:${source}`;
		if (this.invalidContentErrorDisposables.has(key)) {
			return;
		}
		if (source !== SyncResource.Settings && source !== SyncResource.Keybindings && source !== SyncResource.Tasks) {
			return;
		}
		if (!this.hostService.hasFocus) {
			return;
		}
		const resource = source === SyncResource.Settings ? this.userDataProfileService.currentProfile.settingsResource
			: source === SyncResource.Keybindings ? this.userDataProfileService.currentProfile.keybindingsResource
				: this.userDataProfileService.currentProfile.tasksResource;
		const editorUri = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (isEqual(resource, editorUri)) {
			// Do not show notification if the file in error is active
			return;
		}
		const errorArea = getSyncAreaLabel(source);
		const handle = this.notificationService.notify({
			severity: Severity.Error,
			message: localize('errorInvalidConfiguration', "Unable to sync {0} because the content in the file is not valid. Please open the file and correct it.", errorArea.toLowerCase()),
			actions: {
				primary: [toAction({
					id: 'open sync file',
					label: localize('open file', "Open {0} File", errorArea),
					run: () => source === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
				})]
			}
		});
		this.invalidContentErrorDisposables.set(key, toDisposable(() => {
			// close the error warning notification
			handle.close();
			this.invalidContentErrorDisposables.delete(key);
		}));
	}

	private getConflictsCount(): number {
		return this.userDataSyncService.conflicts.reduce((result, { conflicts }) => { return result + conflicts.length; }, 0);
	}

	private async updateGlobalActivityBadge(): Promise<void> {
		this.globalActivityBadgeDisposable.clear();

		let badge: IBadge | undefined = undefined;
		if (this.userDataSyncService.conflicts.length && this.userDataSyncEnablementService.isEnabled()) {
			badge = new NumberBadge(this.getConflictsCount(), () => localize('has conflicts', "{0}: Conflicts Detected", SYNC_TITLE.value));
		} else if (this.turningOnSync) {
			badge = new ProgressBadge(() => localize('turning on syncing', "Turning on Settings Sync..."));
		}

		if (badge) {
			this.globalActivityBadgeDisposable.value = this.activityService.showGlobalActivity({ badge });
		}
	}

	private async updateAccountBadge(): Promise<void> {
		this.accountBadgeDisposable.clear();

		let badge: IBadge | undefined = undefined;

		if (this.userDataSyncService.status !== SyncStatus.Uninitialized && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Unavailable) {
			badge = new NumberBadge(1, () => localize('sign in to sync', "Sign in to Sync Settings"));
		}

		if (badge) {
			this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
		}
	}

	private async turnOn(): Promise<void> {
		try {
			if (!this.userDataSyncWorkbenchService.authenticationProviders.length) {
				throw new Error(localize('no authentication providers', "No authentication providers are available."));
			}
			const turnOn = await this.askToConfigure();
			if (!turnOn) {
				return;
			}
			if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
				await this.selectSettingsSyncService(this.userDataSyncStoreManagementService.userDataSyncStore);
			}
			await this.userDataSyncWorkbenchService.turnOn();
		} catch (e) {
			if (isCancellationError(e)) {
				return;
			}
			if (e instanceof UserDataSyncError) {
				switch (e.code) {
					case UserDataSyncErrorCode.TooLarge:
						if (e.resource === SyncResource.Keybindings || e.resource === SyncResource.Settings || e.resource === SyncResource.Tasks) {
							this.handleTooLargeError(e.resource, localize('too large while starting sync', "Settings sync cannot be turned on because size of the {0} file to sync is larger than {1}. Please open the file and reduce the size and turn on sync", getSyncAreaLabel(e.resource).toLowerCase(), '100kb'), e);
							return;
						}
						break;
					case UserDataSyncErrorCode.IncompatibleLocalContent:
					case UserDataSyncErrorCode.Gone:
					case UserDataSyncErrorCode.UpgradeRequired: {
						const message = localize('error upgrade required while starting sync', "Settings sync cannot be turned on because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
						const operationId = e.operationId ? localize('operationId', "Operation Id: {0}", e.operationId) : undefined;
						this.notificationService.notify({
							severity: Severity.Error,
							message: operationId ? `${message} ${operationId}` : message,
						});
						return;
					}
					case UserDataSyncErrorCode.IncompatibleRemoteContent:
						this.notificationService.notify({
							severity: Severity.Error,
							message: localize('error reset required while starting sync', "Settings sync cannot be turned on because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
							actions: {
								primary: [
									toAction({
										id: 'reset',
										label: localize('reset', "Clear Data in Cloud..."),
										run: () => this.userDataSyncWorkbenchService.resetSyncedData()
									}),
									toAction({
										id: 'show synced data',
										label: localize('show synced data action', "Show Synced Data"),
										run: () => this.userDataSyncWorkbenchService.showSyncActivity()
									})
								]
							}
						});
						return;
					case UserDataSyncErrorCode.Unauthorized:
					case UserDataSyncErrorCode.Forbidden:
						this.notificationService.error(localize('auth failed', "Error while turning on Settings Sync: Authentication failed."));
						return;
				}
				this.notificationService.error(localize('turn on failed with user data sync error', "Error while turning on Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
			} else {
				this.notificationService.error(localize({ key: 'turn on failed', comment: ['Substitution is for error reason'] }, "Error while turning on Settings Sync. {0}", getErrorMessage(e)));
			}
		}
	}

	private async askToConfigure(): Promise<boolean> {
		return new Promise<boolean>((c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<ConfigureSyncQuickPickItem>();
			disposables.add(quickPick);
			quickPick.title = SYNC_TITLE.value;
			quickPick.ok = false;
			quickPick.customButton = true;
			quickPick.customLabel = localize('sign in and turn on', "Sign in");
			quickPick.description = localize('configure and turn on sync detail', "Please sign in to backup and sync your data across devices.");
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			quickPick.hideInput = true;
			quickPick.hideCheckAll = true;

			const items = this.getConfigureSyncQuickPickItems();
			quickPick.items = items;
			quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id, true));
			let accepted: boolean = false;
			disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
				accepted = true;
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				try {
					if (accepted) {
						this.updateConfiguration(items, quickPick.selectedItems);
					}
					c(accepted);
				} catch (error) {
					e(error);
				} finally {
					disposables.dispose();
				}
			}));
			quickPick.show();
		});
	}

	private getConfigureSyncQuickPickItems(): ConfigureSyncQuickPickItem[] {
		const result = [{
			id: SyncResource.Settings,
			label: getSyncAreaLabel(SyncResource.Settings)
		}, {
			id: SyncResource.Keybindings,
			label: getSyncAreaLabel(SyncResource.Keybindings),
		}, {
			id: SyncResource.Snippets,
			label: getSyncAreaLabel(SyncResource.Snippets)
		}, {
			id: SyncResource.Tasks,
			label: getSyncAreaLabel(SyncResource.Tasks)
		}, {
			id: SyncResource.Mcp,
			label: getSyncAreaLabel(SyncResource.Mcp)
		}, {
			id: SyncResource.GlobalState,
			label: getSyncAreaLabel(SyncResource.GlobalState),
		}, {
			id: SyncResource.Extensions,
			label: getSyncAreaLabel(SyncResource.Extensions)
		}, {
			id: SyncResource.Profiles,
			label: getSyncAreaLabel(SyncResource.Profiles),
		}, {
			id: SyncResource.Prompts,
			label: getSyncAreaLabel(SyncResource.Prompts)
		}];


		return result;
	}

	private updateConfiguration(items: ConfigureSyncQuickPickItem[], selectedItems: ReadonlyArray<ConfigureSyncQuickPickItem>): void {
		for (const item of items) {
			const wasEnabled = this.userDataSyncEnablementService.isResourceEnabled(item.id);
			const isEnabled = !!selectedItems.filter(selected => selected.id === item.id)[0];
			if (wasEnabled !== isEnabled) {
				this.userDataSyncEnablementService.setResourceEnablement(item.id, isEnabled);
			}
		}
	}

	private async configureSyncOptions(): Promise<void> {
		return new Promise((c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<ConfigureSyncQuickPickItem>();
			disposables.add(quickPick);
			quickPick.title = localize('configure sync title', "{0}: Configure...", SYNC_TITLE.value);
			quickPick.placeholder = localize('configure sync placeholder', "Choose what to sync");
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			quickPick.ok = true;
			const items = this.getConfigureSyncQuickPickItems();
			quickPick.items = items;
			quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id));
			disposables.add(quickPick.onDidAccept(async () => {
				if (quickPick.selectedItems.length) {
					this.updateConfiguration(items, quickPick.selectedItems);
					quickPick.hide();
				}
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c();
			}));
			quickPick.show();
		});
	}

	private async turnOff(): Promise<void> {
		const result = await this.dialogService.confirm({
			message: localize('turn off sync confirmation', "Do you want to turn off sync?"),
			detail: localize('turn off sync detail', "Your settings, keybindings, extensions, snippets and UI State will no longer be synced."),
			primaryButton: localize({ key: 'turn off', comment: ['&& denotes a mnemonic'] }, "&&Turn off"),
			checkbox: this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Available ? {
				label: localize('turn off sync everywhere', "Turn off sync on all your devices and clear the data from the cloud.")
			} : undefined
		});
		if (result.confirmed) {
			return this.userDataSyncWorkbenchService.turnoff(!!result.checkboxChecked);
		}
	}

	private disableSync(source: SyncResource): void {
		switch (source) {
			case SyncResource.Settings: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Settings, false);
			case SyncResource.Keybindings: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Keybindings, false);
			case SyncResource.Snippets: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Snippets, false);
			case SyncResource.Tasks: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Tasks, false);
			case SyncResource.Extensions: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Extensions, false);
			case SyncResource.GlobalState: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.GlobalState, false);
			case SyncResource.Profiles: return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Profiles, false);
		}
	}

	private showSyncActivity(): Promise<void> {
		return this.outputService.showChannel(USER_DATA_SYNC_LOG_ID);
	}

	private async selectSettingsSyncService(userDataSyncStore: IUserDataSyncStore): Promise<void> {
		return new Promise<void>((c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = disposables.add(this.quickInputService.createQuickPick<{ id: UserDataSyncStoreType; label: string; description?: string }>());
			quickPick.title = localize('switchSyncService.title', "{0}: Select Service", SYNC_TITLE.value);
			quickPick.description = localize('switchSyncService.description', "Ensure you are using the same settings sync service when syncing with multiple environments");
			quickPick.hideInput = true;
			quickPick.ignoreFocusOut = true;
			const getDescription = (url: URI): string | undefined => {
				const isDefault = isEqual(url, userDataSyncStore.defaultUrl);
				if (isDefault) {
					return localize('default', "Default");
				}
				return undefined;
			};
			quickPick.items = [
				{
					id: 'insiders',
					label: localize('insiders', "Insiders"),
					description: getDescription(userDataSyncStore.insidersUrl)
				},
				{
					id: 'stable',
					label: localize('stable', "Stable"),
					description: getDescription(userDataSyncStore.stableUrl)
				}
			];
			disposables.add(quickPick.onDidAccept(async () => {
				try {
					await this.userDataSyncStoreManagementService.switch(quickPick.selectedItems[0].id);
					c();
				} catch (error) {
					e(error);
				} finally {
					quickPick.hide();
				}
			}));
			disposables.add(quickPick.onDidHide(() => disposables.dispose()));
			quickPick.show();
		});
	}

	private registerActions(): void {
		if (this.userDataSyncEnablementService.canToggleEnablement()) {
			this.registerTurnOnSyncAction();
			this.registerTurnOffSyncAction();
		}
		this.registerTurningOnSyncAction();
		this.registerCancelTurnOnSyncAction();
		this.registerSignInAction(); // When Sync is turned on from CLI
		this.registerShowConflictsAction();

		this.registerEnableSyncViewsAction();
		this.registerManageSyncAction();
		this.registerSyncNowAction();
		this.registerConfigureSyncAction();
		this.registerShowSettingsAction();
		this.registerHelpAction();
		this.registerShowLogAction();
		this.registerResetSyncDataAction();
		this.registerAcceptMergesAction();

		if (isWeb) {
			this.registerDownloadSyncActivityAction();
		}
	}

	private registerTurnOnSyncAction(): void {
		const that = this;
		const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE.negate());
		this._register(registerAction2(class TurningOnSyncAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userDataSync.actions.turnOn',
					title: localize2('global activity turn on sync', 'Backup and Sync Settings...'),
					category: SYNC_TITLE,
					f1: true,
					precondition: when,
					menu: [{
						group: '3_configuration',
						id: MenuId.GlobalActivity,
						when,
						order: 2
					}, {
						group: '3_configuration',
						id: MenuId.MenubarPreferencesMenu,
						when,
						order: 2
					}, {
						group: '1_settings',
						id: MenuId.AccountsContext,
						when,
						order: 2
					}]
				});
			}
			async run(): Promise<any> {
				return that.turnOn();
			}
		}));
	}

	private registerTurningOnSyncAction(): void {
		const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE);
		this._register(registerAction2(class TurningOnSyncAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userData.actions.turningOn',
					title: localize('turning on sync', "Turning on Settings Sync..."),
					precondition: ContextKeyExpr.false(),
					menu: [{
						group: '3_configuration',
						id: MenuId.GlobalActivity,
						when,
						order: 2
					}, {
						group: '1_settings',
						id: MenuId.AccountsContext,
						when,
					}]
				});
			}
			async run(): Promise<any> { }
		}));
	}

	private registerCancelTurnOnSyncAction(): void {
		const that = this;
		this._register(registerAction2(class TurningOnSyncAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userData.actions.cancelTurnOn',
					title: localize('cancel turning on sync', "Cancel"),
					icon: Codicon.stopCircle,
					menu: {
						id: MenuId.ViewContainerTitle,
						when: ContextKeyExpr.and(CONTEXT_TURNING_ON_STATE, ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID)),
						group: 'navigation',
						order: 1
					}
				});
			}
			async run(): Promise<any> {
				return that.userDataSyncWorkbenchService.turnoff(false);
			}
		}));
	}

	private registerSignInAction(): void {
		const that = this;
		const id = 'workbench.userData.actions.signin';
		const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Unavailable));
		this._register(registerAction2(class StopSyncAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userData.actions.signin',
					title: localize('sign in global', "Sign in to Sync Settings"),
					menu: {
						group: '3_configuration',
						id: MenuId.GlobalActivity,
						when,
						order: 2
					}
				});
			}
			async run(): Promise<any> {
				try {
					await that.userDataSyncWorkbenchService.signIn();
				} catch (e) {
					that.notificationService.error(e);
				}
			}
		}));
		this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '1_settings',
			command: {
				id,
				title: localize('sign in accounts', "Sign in to Sync Settings (1)"),
			},
			when
		}));
	}

	private getShowConflictsTitle(): ILocalizedString {
		return localize2('resolveConflicts_global', "Show Conflicts ({0})", this.getConflictsCount());
	}

	private readonly conflictsActionDisposable = this._register(new MutableDisposable());
	private registerShowConflictsAction(): void {
		this.conflictsActionDisposable.value = undefined;
		const that = this;
		this.conflictsActionDisposable.value = registerAction2(class TurningOnSyncAction extends Action2 {
			constructor() {
				super({
					id: showConflictsCommandId,
					get title() { return that.getShowConflictsTitle(); },
					category: SYNC_TITLE,
					f1: true,
					precondition: CONTEXT_HAS_CONFLICTS,
					menu: [{
						group: '3_configuration',
						id: MenuId.GlobalActivity,
						when: CONTEXT_HAS_CONFLICTS,
						order: 2
					}, {
						group: '3_configuration',
						id: MenuId.MenubarPreferencesMenu,
						when: CONTEXT_HAS_CONFLICTS,
						order: 2
					}]
				});
			}
			async run(): Promise<any> {
				return that.userDataSyncWorkbenchService.showConflicts();
			}
		});
	}

	private registerManageSyncAction(): void {
		const that = this;
		const when = ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.notEqualsTo(AccountStatus.Unavailable), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
		this._register(registerAction2(class SyncStatusAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userDataSync.actions.manage',
					title: localize('sync is on', "Settings Sync is On"),
					toggled: ContextKeyTrueExpr.INSTANCE,
					menu: [
						{
							id: MenuId.GlobalActivity,
							group: '3_configuration',
							when,
							order: 2
						},
						{
							id: MenuId.MenubarPreferencesMenu,
							group: '3_configuration',
							when,
							order: 2,
						},
						{
							id: MenuId.AccountsContext,
							group: '1_settings',
							when,
						}
					],
				});
			}
			run(accessor: ServicesAccessor): unknown {
				return new Promise<void>((c, e) => {
					const quickInputService = accessor.get(IQuickInputService);
					const commandService = accessor.get(ICommandService);
					const disposables = new DisposableStore();
					const quickPick = quickInputService.createQuickPick({ useSeparators: true });
					disposables.add(quickPick);
					const items: Array<QuickPickItem> = [];
					if (that.userDataSyncService.conflicts.length) {
						items.push({ id: showConflictsCommandId, label: `${SYNC_TITLE.value}: ${that.getShowConflictsTitle().original}` });
						items.push({ type: 'separator' });
					}
					items.push({ id: configureSyncCommand.id, label: `${SYNC_TITLE.value}: ${configureSyncCommand.title.original}` });
					items.push({ id: showSyncSettingsCommand.id, label: `${SYNC_TITLE.value}: ${showSyncSettingsCommand.title.original}` });
					items.push({ id: showSyncedDataCommand.id, label: `${SYNC_TITLE.value}: ${showSyncedDataCommand.title.original}` });
					items.push({ type: 'separator' });
					items.push({ id: syncNowCommand.id, label: `${SYNC_TITLE.value}: ${syncNowCommand.title.original}`, description: syncNowCommand.description(that.userDataSyncService) });
					if (that.userDataSyncEnablementService.canToggleEnablement()) {
						const account = that.userDataSyncWorkbenchService.current;
						items.push({ id: turnOffSyncCommand.id, label: `${SYNC_TITLE.value}: ${turnOffSyncCommand.title.original}`, description: account ? `${account.accountName} (${that.authenticationService.getProvider(account.authenticationProviderId).label})` : undefined });
					}
					quickPick.items = items;
					disposables.add(quickPick.onDidAccept(() => {
						if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
							commandService.executeCommand(quickPick.selectedItems[0].id);
						}
						quickPick.hide();
					}));
					disposables.add(quickPick.onDidHide(() => {
						disposables.dispose();
						c();
					}));
					quickPick.show();
				});
			}
		}));
	}

	private registerEnableSyncViewsAction(): void {
		const that = this;
		const when = ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
		this._register(registerAction2(class SyncStatusAction extends Action2 {
			constructor() {
				super({
					id: showSyncedDataCommand.id,
					title: showSyncedDataCommand.title,
					category: SYNC_TITLE,
					precondition: when,
					menu: {
						id: MenuId.CommandPalette,
						when
					}
				});
			}
			run(accessor: ServicesAccessor): Promise<void> {
				return that.userDataSyncWorkbenchService.showSyncActivity();
			}
		}));
	}

	private registerSyncNowAction(): void {
		const that = this;
		this._register(registerAction2(class SyncNowAction extends Action2 {
			constructor() {
				super({
					id: syncNowCommand.id,
					title: syncNowCommand.title,
					category: SYNC_TITLE,
					menu: {
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
					}
				});
			}
			run(accessor: ServicesAccessor): Promise<any> {
				return that.userDataSyncWorkbenchService.syncNow();
			}
		}));
	}

	private registerTurnOffSyncAction(): void {
		const that = this;
		this._register(registerAction2(class StopSyncAction extends Action2 {
			constructor() {
				super({
					id: turnOffSyncCommand.id,
					title: turnOffSyncCommand.title,
					category: SYNC_TITLE,
					menu: {
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT),
					},
				});
			}
			async run(): Promise<any> {
				try {
					await that.turnOff();
				} catch (e) {
					if (!isCancellationError(e)) {
						that.notificationService.error(localize('turn off failed', "Error while turning off Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
					}
				}
			}
		}));
	}

	private registerConfigureSyncAction(): void {
		const that = this;
		const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT);
		this._register(registerAction2(class ConfigureSyncAction extends Action2 {
			constructor() {
				super({
					id: configureSyncCommand.id,
					title: configureSyncCommand.title,
					category: SYNC_TITLE,
					icon: Codicon.settingsGear,
					tooltip: localize('configure', "Configure..."),
					menu: [{
						id: MenuId.CommandPalette,
						when
					}, {
						id: MenuId.ViewContainerTitle,
						when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID)),
						group: 'navigation',
						order: 2
					}]
				});
			}
			run(): unknown { return that.configureSyncOptions(); }
		}));
	}

	private registerShowLogAction(): void {
		const that = this;
		this._register(registerAction2(class ShowSyncActivityAction extends Action2 {
			constructor() {
				super({
					id: SHOW_SYNC_LOG_COMMAND_ID,
					title: localize('show sync log title', "{0}: Show Log", SYNC_TITLE.value),
					tooltip: localize('show sync log toolrip', "Show Log"),
					icon: Codicon.output,
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized)),
					}, {
						id: MenuId.ViewContainerTitle,
						when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
						group: 'navigation',
						order: 1
					}],
				});
			}
			run(): unknown { return that.showSyncActivity(); }
		}));
	}

	private registerShowSettingsAction(): void {
		this._register(registerAction2(class ShowSyncSettingsAction extends Action2 {
			constructor() {
				super({
					id: showSyncSettingsCommand.id,
					title: showSyncSettingsCommand.title,
					category: SYNC_TITLE,
					menu: {
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized)),
					},
				});
			}
			run(accessor: ServicesAccessor): void {
				accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: '@tag:sync' });
			}
		}));
	}

	private registerHelpAction(): void {
		const that = this;
		this._register(registerAction2(class HelpAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userDataSync.actions.help',
					title: SYNC_TITLE,
					category: Categories.Help,
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized)),
					}],
				});
			}
			run(): unknown { return that.openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help')); }
		}));
		MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
			command: {
				id: 'workbench.userDataSync.actions.help',
				title: Categories.Help.value
			},
			when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
			group: '1_help',
		});
	}

	private registerAcceptMergesAction(): void {
		const that = this;
		this._register(registerAction2(class AcceptMergesAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.userDataSync.actions.acceptMerges',
					title: localize('complete merges title', "Complete Merge"),
					menu: [{
						id: MenuId.EditorContent,
						when: ContextKeyExpr.and(ctxIsMergeResultEditor, ContextKeyExpr.regex(ctxMergeBaseUri.key, new RegExp(`^${USER_DATA_SYNC_SCHEME}:`))),
					}],
				});
			}

			async run(accessor: ServicesAccessor, previewResource: URI): Promise<void> {
				const textFileService = accessor.get(ITextFileService);
				await textFileService.save(previewResource);
				const content = await textFileService.read(previewResource);
				await that.userDataSyncService.accept(this.getSyncResource(previewResource), previewResource, content.value, true);
			}

			private getSyncResource(previewResource: URI): IUserDataSyncResource {
				const conflict = that.userDataSyncService.conflicts.find(({ conflicts }) => conflicts.some(conflict => isEqual(conflict.previewResource, previewResource)));
				if (conflict) {
					return conflict;
				}
				throw new Error(`Unknown resource: ${previewResource.toString()}`);
			}
		}));
	}

	private registerDownloadSyncActivityAction(): void {
		this._register(registerAction2(class DownloadSyncActivityAction extends Action2 {
			constructor() {
				super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
				const notificationService = accessor.get(INotificationService);
				const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
				if (folder) {
					notificationService.info(localize('download sync activity complete', "Successfully downloaded Settings Sync activity."));
				}
			}

		}));
	}

	private registerViews(): void {
		const container = this.registerViewContainer();
		this.registerDataViews(container);
	}

	private registerViewContainer(): ViewContainer {
		return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: SYNC_VIEW_CONTAINER_ID,
				title: SYNC_TITLE,
				ctorDescriptor: new SyncDescriptor(
					ViewPaneContainer,
					[SYNC_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
				),
				icon: SYNC_VIEW_ICON,
				hideIfEmpty: true,
			}, ViewContainerLocation.Sidebar);
	}

	private registerResetSyncDataAction(): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.actions.syncData.reset',
					title: localize('workbench.actions.syncData.reset', "Clear Data in Cloud..."),
					menu: [{
						id: MenuId.ViewContainerTitle,
						when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
						group: '0_configure',
					}],
				});
			}
			run(): unknown { return that.userDataSyncWorkbenchService.resetSyncedData(); }
		}));
	}

	private registerDataViews(container: ViewContainer): void {
		this._register(this.instantiationService.createInstance(UserDataSyncDataViews, container));
	}

}

class UserDataRemoteContentProvider implements ITextModelContentProvider {

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
	}

	provideTextContent(uri: URI): Promise<ITextModel> | null {
		if (uri.scheme === USER_DATA_SYNC_SCHEME) {
			return this.userDataSyncService.resolveContent(uri).then(content => this.modelService.createModel(content || '', this.languageService.createById('jsonc'), uri));
		}
		return null;
	}
}
