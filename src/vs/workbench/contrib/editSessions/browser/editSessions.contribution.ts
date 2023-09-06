/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILifecycleService, LifecyclePhase, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, IAction2Options, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { IEditSessionsStorageService, Change, ChangeType, Folder, EditSession, FileType, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_CONTAINER_ID, EditSessionSchemaVersion, IEditSessionsLogService, EDIT_SESSIONS_VIEW_ICON, EDIT_SESSIONS_TITLE, EDIT_SESSIONS_ORIGINAL_TITLE, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_DATA_VIEW_ID, decodeEditSessionFileContent, hashedEditSessionId, editSessionsLogId, EDIT_SESSIONS_PENDING } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { basename, joinPath, relativePath } from 'vs/base/common/resources';
import { encodeBase64 } from 'vs/base/common/buffer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from 'vs/platform/progress/common/progress';
import { EditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/browser/editSessionsStorageService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UserDataSyncErrorCode, UserDataSyncStoreError, IUserDataSynchroniser } from 'vs/platform/userDataSync/common/userDataSync';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { getFileNamesMessage, IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/productService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { getVirtualWorkspaceLocation } from 'vs/platform/workspace/common/virtualWorkspace';
import { Schemas } from 'vs/base/common/network';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { EditSessionsLogService } from 'vs/workbench/contrib/editSessions/common/editSessionsLogService';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsService } from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditSessionsDataViews } from 'vs/workbench/contrib/editSessions/browser/editSessionsViews';
import { EditSessionsFileSystemProvider } from 'vs/workbench/contrib/editSessions/browser/editSessionsFileSystemProvider';
import { isNative, isWeb } from 'vs/base/common/platform';
import { VirtualWorkspaceContext, WorkspaceFolderCountContext } from 'vs/workbench/common/contextkeys';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { equals } from 'vs/base/common/objects';
import { EditSessionIdentityMatch, IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { ThemeIcon } from 'vs/base/common/themables';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import { sha1Hex } from 'vs/base/browser/hash';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Codicon } from 'vs/base/common/codicons';
import { CancellationError } from 'vs/base/common/errors';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IExtensionsViewPaneContainer, VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { WorkspaceStateSynchroniser } from 'vs/workbench/contrib/editSessions/common/workspaceStateSync';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IRequestService } from 'vs/platform/request/common/request';
import { EditSessionsStoreClient } from 'vs/workbench/contrib/editSessions/common/editSessionsStorageClient';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceIdentityService } from 'vs/workbench/services/workspaces/common/workspaceIdentityService';

registerSingleton(IEditSessionsLogService, EditSessionsLogService, InstantiationType.Delayed);
registerSingleton(IEditSessionsStorageService, EditSessionsWorkbenchService, InstantiationType.Delayed);


const continueWorkingOnCommand: IAction2Options = {
	id: '_workbench.editSessions.actions.continueEditSession',
	title: { value: localize('continue working on', "Continue Working On..."), original: 'Continue Working On...' },
	precondition: WorkspaceFolderCountContext.notEqualsTo('0'),
	f1: true
};
const openLocalFolderCommand: IAction2Options = {
	id: '_workbench.editSessions.actions.continueEditSession.openLocalFolder',
	title: { value: localize('continue edit session in local folder', "Open In Local Folder"), original: 'Open In Local Folder' },
	category: EDIT_SESSION_SYNC_CATEGORY,
	precondition: ContextKeyExpr.and(IsWebContext.toNegated(), VirtualWorkspaceContext)
};
const showOutputChannelCommand: IAction2Options = {
	id: 'workbench.editSessions.actions.showOutputChannel',
	title: { value: localize('show log', 'Show Log'), original: 'Show Log' },
	category: EDIT_SESSION_SYNC_CATEGORY
};
const installAdditionalContinueOnOptionsCommand = {
	id: 'workbench.action.continueOn.extensions',
	title: localize('continueOn.installAdditional', 'Install additional development environment options'),
};
registerAction2(class extends Action2 {
	constructor() {
		super({ ...installAdditionalContinueOnOptionsCommand, f1: false });
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositePartService = accessor.get(IPaneCompositePartService);
		const viewlet = await paneCompositePartService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
		const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
		view?.search('@tag:continueOn');
	}
});

const resumeProgressOptionsTitle = `[${localize('resuming working changes window', 'Resuming working changes...')}](command:${showOutputChannelCommand.id})`;
const resumeProgressOptions = {
	location: ProgressLocation.Window,
	type: 'syncing',
};
const queryParamName = 'editSessionId';

const useEditSessionsWithContinueOn = 'workbench.editSessions.continueOn';
export class EditSessionsContribution extends Disposable implements IWorkbenchContribution {

	private continueEditSessionOptions: ContinueEditSessionItem[] = [];

	private readonly shouldShowViewsContext: IContextKey<boolean>;
	private readonly pendingEditSessionsContext: IContextKey<boolean>;

	private static APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY = 'applicationLaunchedViaContinueOn';
	private accountsMenuBadgeDisposable = this._register(new MutableDisposable());

	private registeredCommands = new Set<string>();

	private workspaceStateSynchronizer: IUserDataSynchroniser | undefined;
	private editSessionsStorageClient: EditSessionsStoreClient | undefined;

	constructor(
		@IEditSessionsStorageService private readonly editSessionsStorageService: IEditSessionsStorageService,
		@IFileService private readonly fileService: IFileService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISCMService private readonly scmService: ISCMService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IEditSessionsLogService private readonly logService: IEditSessionsLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEditSessionIdentityService private readonly editSessionIdentityService: IEditSessionIdentityService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IStorageService private readonly storageService: IStorageService,
		@IActivityService private readonly activityService: IActivityService,
		@IEditorService private readonly editorService: IEditorService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRequestService private readonly requestService: IRequestService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceIdentityService private readonly workspaceIdentityService: IWorkspaceIdentityService,
	) {
		super();

		this.shouldShowViewsContext = EDIT_SESSIONS_SHOW_VIEW.bindTo(this.contextKeyService);
		this.pendingEditSessionsContext = EDIT_SESSIONS_PENDING.bindTo(this.contextKeyService);
		this.pendingEditSessionsContext.set(false);

		if (!this.productService['editSessions.store']?.url) {
			return;
		}

		this.editSessionsStorageClient = new EditSessionsStoreClient(URI.parse(this.productService['editSessions.store'].url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
		this.editSessionsStorageService.storeClient = this.editSessionsStorageClient;
		this.workspaceStateSynchronizer = new WorkspaceStateSynchroniser(this.userDataProfilesService.defaultProfile, undefined, this.editSessionsStorageClient, this.logService, this.fileService, this.environmentService, this.telemetryService, this.configurationService, this.storageService, this.uriIdentityService, this.workspaceIdentityService, this.editSessionsStorageService);

		this.autoResumeEditSession();

		this.registerActions();
		this.registerViews();
		this.registerContributedEditSessionOptions();

		this._register(this.fileService.registerProvider(EditSessionsFileSystemProvider.SCHEMA, new EditSessionsFileSystemProvider(this.editSessionsStorageService)));
		this.lifecycleService.onWillShutdown((e) => {
			if (e.reason !== ShutdownReason.RELOAD && this.editSessionsStorageService.isSignedIn && this.configurationService.getValue('workbench.experimental.cloudChanges.autoStore') === 'onShutdown' && !isWeb) {
				e.join(this.autoStoreEditSession(), { id: 'autoStoreWorkingChanges', label: localize('autoStoreWorkingChanges', 'Storing current working changes...') });
			}
		});
		this._register(this.editSessionsStorageService.onDidSignIn(() => this.updateAccountsMenuBadge()));
		this._register(this.editSessionsStorageService.onDidSignOut(() => this.updateAccountsMenuBadge()));
	}

	private async autoResumeEditSession() {
		const shouldAutoResumeOnReload = this.configurationService.getValue('workbench.cloudChanges.autoResume') === 'onReload';

		if (this.environmentService.editSessionId !== undefined) {
			this.logService.info(`Resuming cloud changes, reason: found editSessionId ${this.environmentService.editSessionId} in environment service...`);
			await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(this.environmentService.editSessionId, undefined, undefined, undefined, progress).finally(() => this.environmentService.editSessionId = undefined));
		} else if (shouldAutoResumeOnReload && this.editSessionsStorageService.isSignedIn) {
			this.logService.info('Resuming cloud changes, reason: cloud changes enabled...');
			// Attempt to resume edit session based on edit workspace identifier
			// Note: at this point if the user is not signed into edit sessions,
			// we don't want them to be prompted to sign in and should just return early
			await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
		} else if (shouldAutoResumeOnReload) {
			// The application has previously launched via a protocol URL Continue On flow
			const hasApplicationLaunchedFromContinueOnFlow = this.storageService.getBoolean(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION, false);
			this.logService.info(`Prompting to enable cloud changes, has application previously launched from Continue On flow: ${hasApplicationLaunchedFromContinueOnFlow}`);

			const handlePendingEditSessions = () => {
				// display a badge in the accounts menu but do not prompt the user to sign in again
				this.logService.info('Showing badge to enable cloud changes in accounts menu...');
				this.updateAccountsMenuBadge();
				this.pendingEditSessionsContext.set(true);
				// attempt a resume if we are in a pending state and the user just signed in
				const disposable = this.editSessionsStorageService.onDidSignIn(async () => {
					disposable.dispose();
					this.logService.info('Showing badge to enable cloud changes in accounts menu succeeded, resuming cloud changes...');
					await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
					this.storageService.remove(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION);
					this.environmentService.continueOn = undefined;
				});
			};

			if ((this.environmentService.continueOn !== undefined) &&
				!this.editSessionsStorageService.isSignedIn &&
				// and user has not yet been prompted to sign in on this machine
				hasApplicationLaunchedFromContinueOnFlow === false
			) {
				// store the fact that we prompted the user
				this.storageService.store(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.logService.info('Prompting to enable cloud changes...');
				await this.editSessionsStorageService.initialize('read');
				if (this.editSessionsStorageService.isSignedIn) {
					this.logService.info('Prompting to enable cloud changes succeeded, resuming cloud changes...');
					await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
				} else {
					handlePendingEditSessions();
				}
			} else if (!this.editSessionsStorageService.isSignedIn &&
				// and user has been prompted to sign in on this machine
				hasApplicationLaunchedFromContinueOnFlow === true
			) {
				handlePendingEditSessions();
			}
		} else {
			this.logService.debug('Auto resuming cloud changes disabled.');
		}
	}

	private updateAccountsMenuBadge() {
		if (this.editSessionsStorageService.isSignedIn) {
			return this.accountsMenuBadgeDisposable.clear();
		}

		const badge = new NumberBadge(1, () => localize('check for pending cloud changes', 'Check for pending cloud changes'));
		this.accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
	}

	private async autoStoreEditSession() {
		const cancellationTokenSource = new CancellationTokenSource();
		await this.progressService.withProgress({
			location: ProgressLocation.Window,
			type: 'syncing',
			title: localize('store working changes', 'Storing working changes...')
		}, async () => this.storeEditSession(false, cancellationTokenSource.token), () => {
			cancellationTokenSource.cancel();
			cancellationTokenSource.dispose();
		});
	}

	private registerViews() {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer(
			{
				id: EDIT_SESSIONS_CONTAINER_ID,
				title: { value: EDIT_SESSIONS_TITLE, original: EDIT_SESSIONS_ORIGINAL_TITLE },
				ctorDescriptor: new SyncDescriptor(
					ViewPaneContainer,
					[EDIT_SESSIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
				),
				icon: EDIT_SESSIONS_VIEW_ICON,
				hideIfEmpty: true
			}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true }
		);
		this._register(this.instantiationService.createInstance(EditSessionsDataViews, container));
	}

	private registerActions() {
		this.registerContinueEditSessionAction();

		this.registerResumeLatestEditSessionAction();
		this.registerStoreLatestEditSessionAction();

		this.registerContinueInLocalFolderAction();

		this.registerShowEditSessionViewAction();
		this.registerShowEditSessionOutputChannelAction();
	}

	private registerShowEditSessionOutputChannelAction() {
		this._register(registerAction2(class ShowEditSessionOutput extends Action2 {
			constructor() {
				super(showOutputChannelCommand);
			}

			run(accessor: ServicesAccessor, ...args: any[]) {
				const outputChannel = accessor.get(IOutputService);
				void outputChannel.showChannel(editSessionsLogId);
			}
		}));
	}

	private registerShowEditSessionViewAction() {
		const that = this;
		this._register(registerAction2(class ShowEditSessionView extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.showEditSessions',
					title: { value: localize('show cloud changes', "Show Cloud Changes"), original: 'Show Cloud Changes' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true
				});
			}

			async run(accessor: ServicesAccessor) {
				that.shouldShowViewsContext.set(true);
				const viewsService = accessor.get(IViewsService);
				await viewsService.openView(EDIT_SESSIONS_DATA_VIEW_ID);
			}
		}));
	}

	private registerContinueEditSessionAction() {
		const that = this;
		this._register(registerAction2(class ContinueEditSessionAction extends Action2 {
			constructor() {
				super(continueWorkingOnCommand);
			}

			async run(accessor: ServicesAccessor, workspaceUri: URI | undefined, destination: string | undefined): Promise<void> {
				type ContinueOnEventOutcome = { outcome: string; hashedId?: string };
				type ContinueOnClassificationOutcome = {
					owner: 'joyceerhl'; comment: 'Reporting the outcome of invoking the Continue On action.';
					outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The outcome of invoking continue edit session.' };
					hashedId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The hash of the stored edit session id, for correlating success of stores and resumes.' };
				};

				// First ask the user to pick a destination, if necessary
				let uri: URI | 'noDestinationUri' | undefined = workspaceUri;
				if (!destination && !uri) {
					destination = await that.pickContinueEditSessionDestination();
					if (!destination) {
						that.telemetryService.publicLog2<ContinueOnEventOutcome, ContinueOnClassificationOutcome>('continueOn.editSessions.pick.outcome', { outcome: 'noSelection' });
						return;
					}
				}

				// Determine if we need to store an edit session, asking for edit session auth if necessary
				const shouldStoreEditSession = await that.shouldContinueOnWithEditSession();

				// Run the store action to get back a ref
				let ref: string | undefined;
				if (shouldStoreEditSession) {
					type ContinueWithEditSessionEvent = {};
					type ContinueWithEditSessionClassification = {
						owner: 'joyceerhl'; comment: 'Reporting when storing an edit session as part of the Continue On flow.';
					};
					that.telemetryService.publicLog2<ContinueWithEditSessionEvent, ContinueWithEditSessionClassification>('continueOn.editSessions.store');

					const cancellationTokenSource = new CancellationTokenSource();
					try {
						ref = await that.progressService.withProgress({
							location: ProgressLocation.Notification,
							cancellable: true,
							type: 'syncing',
							title: localize('store your working changes', 'Storing your working changes...')
						}, async () => {
							const ref = await that.storeEditSession(false, cancellationTokenSource.token);
							if (ref !== undefined) {
								that.telemetryService.publicLog2<ContinueOnEventOutcome, ContinueOnClassificationOutcome>('continueOn.editSessions.store.outcome', { outcome: 'storeSucceeded', hashedId: hashedEditSessionId(ref) });
							} else {
								that.telemetryService.publicLog2<ContinueOnEventOutcome, ContinueOnClassificationOutcome>('continueOn.editSessions.store.outcome', { outcome: 'storeSkipped' });
							}
							return ref;
						}, () => {
							cancellationTokenSource.cancel();
							cancellationTokenSource.dispose();
							that.telemetryService.publicLog2<ContinueOnEventOutcome, ContinueOnClassificationOutcome>('continueOn.editSessions.store.outcome', { outcome: 'storeCancelledByUser' });
						});
					} catch (ex) {
						that.telemetryService.publicLog2<ContinueOnEventOutcome, ContinueOnClassificationOutcome>('continueOn.editSessions.store.outcome', { outcome: 'storeFailed' });
						throw ex;
					}
				}

				// Append the ref to the URI
				uri = destination ? await that.resolveDestination(destination) : uri;
				if (uri === undefined) {
					return;
				}

				if (ref !== undefined && uri !== 'noDestinationUri') {
					const encodedRef = encodeURIComponent(ref);
					uri = uri.with({
						query: uri.query.length > 0 ? (uri.query + `&${queryParamName}=${encodedRef}&continueOn=1`) : `${queryParamName}=${encodedRef}&continueOn=1`
					});

					// Open the URI
					that.logService.info(`Opening ${uri.toString()}`);
					await that.openerService.open(uri, { openExternal: true });
				} else if (!shouldStoreEditSession && uri !== 'noDestinationUri') {
					// Open the URI without an edit session ref
					that.logService.info(`Opening ${uri.toString()}`);
					await that.openerService.open(uri, { openExternal: true });
				} else if (ref === undefined && shouldStoreEditSession) {
					that.logService.warn(`Failed to store working changes when invoking ${continueWorkingOnCommand.id}.`);
				}
			}
		}));
	}

	private registerResumeLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.resumeLatest',
					title: { value: localize('resume latest cloud changes', "Resume Latest Changes from Cloud"), original: 'Resume Latest Changes from Cloud' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor, editSessionId?: string, forceApplyUnrelatedChange?: boolean): Promise<void> {
				await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, undefined, forceApplyUnrelatedChange));
			}
		}));
		this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.resumeFromSerializedPayload',
					title: { value: localize('resume cloud changes', "Resume Changes from Serialized Data"), original: 'Resume Changes from Serialized Data' },
					category: 'Developer',
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor, editSessionId?: string): Promise<void> {
				const data = await that.quickInputService.input({ prompt: 'Enter serialized data' });
				await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, undefined, undefined, undefined, undefined, data));
			}
		}));
	}

	private registerStoreLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.storeCurrent',
					title: { value: localize('store working changes in cloud', "Store Working Changes in Cloud"), original: 'Store Working Changes in Cloud' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const cancellationTokenSource = new CancellationTokenSource();
				await that.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('storing working changes', 'Storing working changes...')
				}, async () => {
					type StoreEvent = {};
					type StoreClassification = {
						owner: 'joyceerhl'; comment: 'Reporting when the store edit session action is invoked.';
					};
					that.telemetryService.publicLog2<StoreEvent, StoreClassification>('editSessions.store');

					await that.storeEditSession(true, cancellationTokenSource.token);
				}, () => {
					cancellationTokenSource.cancel();
					cancellationTokenSource.dispose();
				});
			}
		}));
	}

	async resumeEditSession(ref?: string, silent?: boolean, forceApplyUnrelatedChange?: boolean, applyPartialMatch?: boolean, progress?: IProgress<IProgressStep>, serializedData?: string): Promise<void> {
		// Wait for the remote environment to become available, if any
		await this.remoteAgentService.getEnvironment();

		// Edit sessions are not currently supported in empty workspaces
		// https://github.com/microsoft/vscode/issues/159220
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		this.logService.info(ref !== undefined ? `Resuming changes from cloud with ref ${ref}...` : 'Checking for pending cloud changes...');

		if (silent && !(await this.editSessionsStorageService.initialize('read', true))) {
			return;
		}

		type ResumeEvent = { outcome: string; hashedId?: string };
		type ResumeClassification = {
			owner: 'joyceerhl'; comment: 'Reporting when an edit session is resumed from an edit session identifier.';
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The outcome of resuming the edit session.' };
			hashedId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The hash of the stored edit session id, for correlating success of stores and resumes.' };
		};
		this.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.resume');

		performance.mark('code/willResumeEditSessionFromIdentifier');

		progress?.report({ message: localize('checkingForWorkingChanges', 'Checking for pending cloud changes...') });
		const data = serializedData ? { content: serializedData, ref: '' } : await this.editSessionsStorageService.read('editSessions', ref);
		if (!data) {
			if (ref === undefined && !silent) {
				this.notificationService.info(localize('no cloud changes', 'There are no changes to resume from the cloud.'));
			} else if (ref !== undefined) {
				this.notificationService.warn(localize('no cloud changes for ref', 'Could not resume changes from the cloud for ID {0}.', ref));
			}
			this.logService.info(ref !== undefined ? `Aborting resuming changes from cloud as no edit session content is available to be applied from ref ${ref}.` : `Aborting resuming edit session as no edit session content is available to be applied`);
			return;
		}

		progress?.report({ message: resumeProgressOptionsTitle });
		const editSession = JSON.parse(data.content);
		ref = data.ref;

		if (editSession.version > EditSessionSchemaVersion) {
			this.notificationService.error(localize('client too old', "Please upgrade to a newer version of {0} to resume your working changes from the cloud.", this.productService.nameLong));
			this.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.resume.outcome', { hashedId: hashedEditSessionId(ref), outcome: 'clientUpdateNeeded' });
			return;
		}

		try {
			const { changes, conflictingChanges } = await this.generateChanges(editSession, ref, forceApplyUnrelatedChange, applyPartialMatch);
			if (changes.length === 0) {
				return;
			}

			// TODO@joyceerhl Provide the option to diff files which would be overwritten by edit session contents
			if (conflictingChanges.length > 0) {
				// Allow to show edit sessions

				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Warning,
					message: conflictingChanges.length > 1 ?
						localize('resume edit session warning many', 'Resuming your working changes from the cloud will overwrite the following {0} files. Do you want to proceed?', conflictingChanges.length) :
						localize('resume edit session warning 1', 'Resuming your working changes from the cloud will overwrite {0}. Do you want to proceed?', basename(conflictingChanges[0].uri)),
					detail: conflictingChanges.length > 1 ? getFileNamesMessage(conflictingChanges.map((c) => c.uri)) : undefined
				});

				if (!confirmed) {
					return;
				}
			}

			for (const { uri, type, contents } of changes) {
				if (type === ChangeType.Addition) {
					await this.fileService.writeFile(uri, decodeEditSessionFileContent(editSession.version, contents!));
				} else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
					await this.fileService.del(uri);
				}
			}

			await this.workspaceStateSynchronizer?.apply(false, {});

			this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
			await this.editSessionsStorageService.delete('editSessions', ref);
			this.logService.info(`Deleted edit session with ref ${ref}.`);

			this.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.resume.outcome', { hashedId: hashedEditSessionId(ref), outcome: 'resumeSucceeded' });
		} catch (ex) {
			this.logService.error('Failed to resume edit session, reason: ', (ex as Error).toString());
			this.notificationService.error(localize('resume failed', "Failed to resume your working changes from the cloud."));
		}

		performance.mark('code/didResumeEditSessionFromIdentifier');
	}

	private async generateChanges(editSession: EditSession, ref: string, forceApplyUnrelatedChange = false, applyPartialMatch = false) {
		const changes: ({ uri: URI; type: ChangeType; contents: string | undefined })[] = [];
		const conflictingChanges = [];
		const workspaceFolders = this.contextService.getWorkspace().folders;
		const cancellationTokenSource = new CancellationTokenSource();

		for (const folder of editSession.folders) {
			let folderRoot: IWorkspaceFolder | undefined;

			if (folder.canonicalIdentity) {
				// Look for an edit session identifier that we can use
				for (const f of workspaceFolders) {
					const identity = await this.editSessionIdentityService.getEditSessionIdentifier(f, cancellationTokenSource.token);
					this.logService.info(`Matching identity ${identity} against edit session folder identity ${folder.canonicalIdentity}...`);

					if (equals(identity, folder.canonicalIdentity) || forceApplyUnrelatedChange) {
						folderRoot = f;
						break;
					}

					if (identity !== undefined) {
						const match = await this.editSessionIdentityService.provideEditSessionIdentityMatch(f, identity, folder.canonicalIdentity, cancellationTokenSource.token);
						if (match === EditSessionIdentityMatch.Complete) {
							folderRoot = f;
							break;
						} else if (match === EditSessionIdentityMatch.Partial &&
							this.configurationService.getValue('workbench.experimental.cloudChanges.partialMatches.enabled') === true
						) {
							if (!applyPartialMatch) {
								// Surface partially matching edit session
								this.notificationService.prompt(
									Severity.Info,
									localize('editSessionPartialMatch', 'You have pending working changes in the cloud for this workspace. Would you like to resume them?'),
									[{ label: localize('resume', 'Resume'), run: () => this.resumeEditSession(ref, false, undefined, true) }]
								);
							} else {
								folderRoot = f;
								break;
							}
						}
					}
				}
			} else {
				folderRoot = workspaceFolders.find((f) => f.name === folder.name);
			}

			if (!folderRoot) {
				this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no matching workspace folder was found.`);
				return { changes: [], conflictingChanges: [], contributedStateHandlers: [] };
			}

			const localChanges = new Set<string>();
			for (const repository of this.scmService.repositories) {
				if (repository.provider.rootUri !== undefined &&
					this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name === folder.name
				) {
					const repositoryChanges = this.getChangedResources(repository);
					repositoryChanges.forEach((change) => localChanges.add(change.toString()));
				}
			}

			for (const change of folder.workingChanges) {
				const uri = joinPath(folderRoot.uri, change.relativeFilePath);

				changes.push({ uri, type: change.type, contents: change.contents });
				if (await this.willChangeLocalContents(localChanges, uri, change)) {
					conflictingChanges.push({ uri, type: change.type, contents: change.contents });
				}
			}
		}

		return { changes, conflictingChanges };
	}

	private async willChangeLocalContents(localChanges: Set<string>, uriWithIncomingChanges: URI, incomingChange: Change) {
		if (!localChanges.has(uriWithIncomingChanges.toString())) {
			return false;
		}

		const { contents, type } = incomingChange;

		switch (type) {
			case (ChangeType.Addition): {
				const [originalContents, incomingContents] = await Promise.all([sha1Hex(contents), sha1Hex(encodeBase64((await this.fileService.readFile(uriWithIncomingChanges)).value))]);
				return originalContents !== incomingContents;
			}
			case (ChangeType.Deletion): {
				return await this.fileService.exists(uriWithIncomingChanges);
			}
			default:
				throw new Error('Unhandled change type.');
		}
	}

	async storeEditSession(fromStoreCommand: boolean, cancellationToken: CancellationToken): Promise<string | undefined> {
		const folders: Folder[] = [];
		let editSessionSize = 0;
		let hasEdits = false;

		// Save all saveable editors before building edit session contents
		await this.editorService.saveAll();

		for (const repository of this.scmService.repositories) {
			// Look through all resource groups and compute which files were added/modified/deleted
			const trackedUris = this.getChangedResources(repository); // A URI might appear in more than one resource group

			const workingChanges: Change[] = [];

			const { rootUri } = repository.provider;
			const workspaceFolder = rootUri ? this.contextService.getWorkspaceFolder(rootUri) : undefined;
			let name = workspaceFolder?.name;

			for (const uri of trackedUris) {
				const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
				if (!workspaceFolder) {
					this.logService.info(`Skipping working change ${uri.toString()} as no associated workspace folder was found.`);

					continue;
				}

				await this.editSessionIdentityService.onWillCreateEditSessionIdentity(workspaceFolder, cancellationToken);

				name = name ?? workspaceFolder.name;
				const relativeFilePath = relativePath(workspaceFolder.uri, uri) ?? uri.path;

				// Only deal with file contents for now
				try {
					if (!(await this.fileService.stat(uri)).isFile) {
						continue;
					}
				} catch { }

				hasEdits = true;


				if (await this.fileService.exists(uri)) {
					const contents = encodeBase64((await this.fileService.readFile(uri)).value);
					editSessionSize += contents.length;
					if (editSessionSize > this.editSessionsStorageService.SIZE_LIMIT) {
						this.notificationService.error(localize('payload too large', 'Your working changes exceed the size limit and cannot be stored.'));
						return undefined;
					}

					workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents: contents, relativeFilePath: relativeFilePath });
				} else {
					// Assume it's a deletion
					workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: undefined, relativeFilePath: relativeFilePath });
				}
			}

			let canonicalIdentity = undefined;
			if (workspaceFolder !== null && workspaceFolder !== undefined) {
				canonicalIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
			}

			// TODO@joyceerhl debt: don't store working changes as a child of the folder
			folders.push({ workingChanges, name: name ?? '', canonicalIdentity: canonicalIdentity ?? undefined, absoluteUri: workspaceFolder?.uri.toString() });
		}

		// Store contributed workspace state
		await this.workspaceStateSynchronizer?.sync(null, {});

		if (!hasEdits) {
			this.logService.info('Skipped storing working changes in the cloud as there are no edits to store.');
			if (fromStoreCommand) {
				this.notificationService.info(localize('no working changes to store', 'Skipped storing working changes in the cloud as there are no edits to store.'));
			}
			return undefined;
		}

		const data: EditSession = { folders, version: 2, workspaceStateId: this.editSessionsStorageService.lastWrittenResources.get('workspaceState')?.ref };

		try {
			this.logService.info(`Storing edit session...`);
			const ref = await this.editSessionsStorageService.write('editSessions', data);
			this.logService.info(`Stored edit session with ref ${ref}.`);
			return ref;
		} catch (ex) {
			this.logService.error(`Failed to store edit session, reason: `, (ex as Error).toString());

			type UploadFailedEvent = { reason: string };
			type UploadFailedClassification = {
				owner: 'joyceerhl'; comment: 'Reporting when Continue On server request fails.';
				reason?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The reason that the server request failed.' };
			};

			if (ex instanceof UserDataSyncStoreError) {
				switch (ex.code) {
					case UserDataSyncErrorCode.TooLarge:
						// Uploading a payload can fail due to server size limits
						this.telemetryService.publicLog2<UploadFailedEvent, UploadFailedClassification>('editSessions.upload.failed', { reason: 'TooLarge' });
						this.notificationService.error(localize('payload too large', 'Your working changes exceed the size limit and cannot be stored.'));
						break;
					default:
						this.telemetryService.publicLog2<UploadFailedEvent, UploadFailedClassification>('editSessions.upload.failed', { reason: 'unknown' });
						this.notificationService.error(localize('payload failed', 'Your working changes cannot be stored.'));
						break;
				}
			}
		}

		return undefined;
	}

	private getChangedResources(repository: ISCMRepository) {
		return repository.provider.groups.elements.reduce((resources, resourceGroups) => {
			resourceGroups.elements.forEach((resource) => resources.add(resource.sourceUri));
			return resources;
		}, new Set<URI>()); // A URI might appear in more than one resource group
	}

	private hasEditSession() {
		for (const repository of this.scmService.repositories) {
			if (this.getChangedResources(repository).size > 0) {
				return true;
			}
		}
		return false;
	}

	private async shouldContinueOnWithEditSession(): Promise<boolean> {
		type EditSessionsAuthCheckEvent = { outcome: string };
		type EditSessionsAuthCheckClassification = {
			owner: 'joyceerhl'; comment: 'Reporting whether we can and should store edit session as part of Continue On.';
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The outcome of checking whether we can store an edit session as part of the Continue On flow.' };
		};

		// If the user is already signed in, we should store edit session
		if (this.editSessionsStorageService.isSignedIn) {
			return this.hasEditSession();
		}

		// If the user has been asked before and said no, don't use edit sessions
		if (this.configurationService.getValue(useEditSessionsWithContinueOn) === 'off') {
			this.telemetryService.publicLog2<EditSessionsAuthCheckEvent, EditSessionsAuthCheckClassification>('continueOn.editSessions.canStore.outcome', { outcome: 'disabledEditSessionsViaSetting' });
			return false;
		}

		// Prompt the user to use edit sessions if they currently could benefit from using it
		if (this.hasEditSession()) {
			const quickpick = this.quickInputService.createQuickPick<IQuickPickItem>();
			quickpick.placeholder = localize('continue with cloud changes', "Select whether to bring your working changes with you");
			quickpick.ok = false;
			quickpick.ignoreFocusOut = true;
			const withCloudChanges = { label: localize('with cloud changes', "Yes, continue with my working changes") };
			const withoutCloudChanges = { label: localize('without cloud changes', "No, continue without my working changes") };
			quickpick.items = [withCloudChanges, withoutCloudChanges];

			const continueWithCloudChanges = await new Promise<boolean>((resolve, reject) => {
				quickpick.onDidAccept(() => {
					resolve(quickpick.selectedItems[0] === withCloudChanges);
					quickpick.hide();
				});
				quickpick.onDidHide(() => {
					reject(new CancellationError());
					quickpick.hide();
				});
				quickpick.show();
			});

			if (!continueWithCloudChanges) {
				this.telemetryService.publicLog2<EditSessionsAuthCheckEvent, EditSessionsAuthCheckClassification>('continueOn.editSessions.canStore.outcome', { outcome: 'didNotEnableEditSessionsWhenPrompted' });
				return continueWithCloudChanges;
			}

			const initialized = await this.editSessionsStorageService.initialize('write');
			if (!initialized) {
				this.telemetryService.publicLog2<EditSessionsAuthCheckEvent, EditSessionsAuthCheckClassification>('continueOn.editSessions.canStore.outcome', { outcome: 'didNotEnableEditSessionsWhenPrompted' });
			}
			return initialized;
		}

		return false;
	}

	//#region Continue Edit Session extension contribution point

	private registerContributedEditSessionOptions() {
		continueEditSessionExtPoint.setHandler(extensions => {
			const continueEditSessionOptions: ContinueEditSessionItem[] = [];
			for (const extension of extensions) {
				if (!isProposedApiEnabled(extension.description, 'contribEditSessions')) {
					continue;
				}
				if (!Array.isArray(extension.value)) {
					continue;
				}
				for (const contribution of extension.value) {
					const command = MenuRegistry.getCommand(contribution.command);
					if (!command) {
						return;
					}

					const icon = command.icon;
					const title = typeof command.title === 'string' ? command.title : command.title.value;
					const when = ContextKeyExpr.deserialize(contribution.when);

					continueEditSessionOptions.push(new ContinueEditSessionItem(
						ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title,
						command.id,
						command.source?.title,
						when,
						contribution.documentation
					));

					if (contribution.qualifiedName) {
						this.generateStandaloneOptionCommand(command.id, contribution.qualifiedName, contribution.category ?? command.category, when, contribution.remoteGroup);
					}
				}
			}
			this.continueEditSessionOptions = continueEditSessionOptions;
		});
	}

	private generateStandaloneOptionCommand(commandId: string, qualifiedName: string, category: string | ILocalizedString | undefined, when: ContextKeyExpression | undefined, remoteGroup: string | undefined) {
		const command = {
			id: `${continueWorkingOnCommand.id}.${commandId}`,
			title: { original: qualifiedName, value: qualifiedName },
			category: typeof category === 'string' ? { original: category, value: category } : category,
			precondition: when,
			f1: true
		};

		if (!this.registeredCommands.has(command.id)) {
			this.registeredCommands.add(command.id);

			registerAction2(class StandaloneContinueOnOption extends Action2 {
				constructor() {
					super(command);
				}

				async run(accessor: ServicesAccessor): Promise<void> {
					return accessor.get(ICommandService).executeCommand(continueWorkingOnCommand.id, undefined, commandId);
				}
			});

			if (remoteGroup !== undefined) {
				MenuRegistry.appendMenuItem(MenuId.StatusBarRemoteIndicatorMenu, {
					group: remoteGroup,
					command: command,
					when: command.precondition
				});
			}
		}
	}

	private registerContinueInLocalFolderAction(): void {
		const that = this;
		this._register(registerAction2(class ContinueInLocalFolderAction extends Action2 {
			constructor() {
				super(openLocalFolderCommand);
			}

			async run(accessor: ServicesAccessor): Promise<URI | undefined> {
				const selection = await that.fileDialogService.showOpenDialog({
					title: localize('continueEditSession.openLocalFolder.title.v2', 'Select a local folder to continue working in'),
					canSelectFolders: true,
					canSelectMany: false,
					canSelectFiles: false,
					availableFileSystems: [Schemas.file]
				});

				return selection?.length !== 1 ? undefined : URI.from({
					scheme: that.productService.urlProtocol,
					authority: Schemas.file,
					path: selection[0].path
				});
			}
		}));

		if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined && isNative) {
			this.generateStandaloneOptionCommand(openLocalFolderCommand.id, localize('continueWorkingOn.existingLocalFolder', 'Continue Working in Existing Local Folder'), undefined, openLocalFolderCommand.precondition, undefined);
		}
	}

	private async pickContinueEditSessionDestination(): Promise<string | undefined> {
		const quickPick = this.quickInputService.createQuickPick<ContinueEditSessionItem>();

		const workspaceContext = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER
			? this.contextService.getWorkspace().folders[0].name
			: this.contextService.getWorkspace().folders.map((folder) => folder.name).join(', ');
		quickPick.placeholder = localize('continueEditSessionPick.title.v2', "Select a development environment to continue working on {0} in", `'${workspaceContext}'`);
		quickPick.items = this.createPickItems();
		this.extensionService.onDidChangeExtensions(() => {
			quickPick.items = this.createPickItems();
		});

		const command = await new Promise<string | undefined>((resolve, reject) => {
			quickPick.onDidHide(() => resolve(undefined));

			quickPick.onDidAccept((e) => {
				const selection = quickPick.activeItems[0].command;

				if (selection === installAdditionalContinueOnOptionsCommand.id) {
					void this.commandService.executeCommand(installAdditionalContinueOnOptionsCommand.id);
				} else {
					resolve(selection);
					quickPick.hide();
				}
			});

			quickPick.show();

			quickPick.onDidTriggerItemButton(async (e) => {
				if (e.item.documentation !== undefined) {
					const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this.commandService.executeCommand(e.item.documentation);
					void this.openerService.open(uri, { openExternal: true });
				}
			});
		});

		quickPick.dispose();

		return command;
	}

	private async resolveDestination(command: string): Promise<URI | 'noDestinationUri' | undefined> {
		type EvaluateContinueOnDestinationEvent = { outcome: string; selection: string };
		type EvaluateContinueOnDestinationClassification = {
			owner: 'joyceerhl'; comment: 'Reporting the outcome of evaluating a selected Continue On destination option.';
			selection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The selected Continue On destination option.' };
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The outcome of evaluating the selected Continue On destination option.' };
		};

		try {
			const uri = await this.commandService.executeCommand(command);

			// Some continue on commands do not return a URI
			// to support extensions which want to be in control
			// of how the destination is opened
			if (uri === undefined) {
				this.telemetryService.publicLog2<EvaluateContinueOnDestinationEvent, EvaluateContinueOnDestinationClassification>('continueOn.openDestination.outcome', { selection: command, outcome: 'noDestinationUri' });
				return 'noDestinationUri';
			}

			if (URI.isUri(uri)) {
				this.telemetryService.publicLog2<EvaluateContinueOnDestinationEvent, EvaluateContinueOnDestinationClassification>('continueOn.openDestination.outcome', { selection: command, outcome: 'resolvedUri' });
				return uri;
			}

			this.telemetryService.publicLog2<EvaluateContinueOnDestinationEvent, EvaluateContinueOnDestinationClassification>('continueOn.openDestination.outcome', { selection: command, outcome: 'invalidDestination' });
			return undefined;
		} catch (ex) {
			if (ex instanceof CancellationError) {
				this.telemetryService.publicLog2<EvaluateContinueOnDestinationEvent, EvaluateContinueOnDestinationClassification>('continueOn.openDestination.outcome', { selection: command, outcome: 'cancelled' });
			} else {
				this.telemetryService.publicLog2<EvaluateContinueOnDestinationEvent, EvaluateContinueOnDestinationClassification>('continueOn.openDestination.outcome', { selection: command, outcome: 'unknownError' });
			}
			return undefined;
		}
	}

	private createPickItems(): (ContinueEditSessionItem | IQuickPickSeparator)[] {
		const items = [...this.continueEditSessionOptions].filter((option) => option.when === undefined || this.contextKeyService.contextMatchesRules(option.when));

		if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined && isNative) {
			items.push(new ContinueEditSessionItem(
				'$(folder) ' + localize('continueEditSessionItem.openInLocalFolder.v2', 'Open in Local Folder'),
				openLocalFolderCommand.id,
				localize('continueEditSessionItem.builtin', 'Built-in')
			));
		}

		const sortedItems: (ContinueEditSessionItem | IQuickPickSeparator)[] = items.sort((item1, item2) => item1.label.localeCompare(item2.label));
		return sortedItems.concat({ type: 'separator' }, new ContinueEditSessionItem(installAdditionalContinueOnOptionsCommand.title, installAdditionalContinueOnOptionsCommand.id));
	}
}

const infoButtonClass = ThemeIcon.asClassName(Codicon.info);
class ContinueEditSessionItem implements IQuickPickItem {
	public readonly buttons: IQuickInputButton[] | undefined;

	constructor(
		public readonly label: string,
		public readonly command: string,
		public readonly description?: string,
		public readonly when?: ContextKeyExpression,
		public readonly documentation?: string,
	) {
		if (documentation !== undefined) {
			this.buttons = [{
				iconClass: infoButtonClass,
				tooltip: localize('learnMoreTooltip', 'Learn More'),
			}];
		}
	}
}

interface ICommand {
	command: string;
	group: string;
	when: string;
	documentation?: string;
	qualifiedName?: string;
	category?: string;
	remoteGroup?: string;
}

const continueEditSessionExtPoint = ExtensionsRegistry.registerExtensionPoint<ICommand[]>({
	extensionPoint: 'continueEditSession',
	jsonSchema: {
		description: localize('continueEditSessionExtPoint', 'Contributes options for continuing the current edit session in a different environment'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				command: {
					description: localize('continueEditSessionExtPoint.command', 'Identifier of the command to execute. The command must be declared in the \'commands\'-section and return a URI representing a different environment where the current edit session can be continued.'),
					type: 'string'
				},
				group: {
					description: localize('continueEditSessionExtPoint.group', 'Group into which this item belongs.'),
					type: 'string'
				},
				qualifiedName: {
					description: localize('continueEditSessionExtPoint.qualifiedName', 'A fully qualified name for this item which is used for display in menus.'),
					type: 'string'
				},
				description: {
					description: localize('continueEditSessionExtPoint.description', "The url, or a command that returns the url, to the option's documentation page."),
					type: 'string'
				},
				remoteGroup: {
					description: localize('continueEditSessionExtPoint.remoteGroup', 'Group into which this item belongs in the remote indicator.'),
					type: 'string'
				},
				when: {
					description: localize('continueEditSessionExtPoint.when', 'Condition which must be true to show this item.'),
					type: 'string'
				}
			},
			required: ['command']
		}
	}
});

//#endregion

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.experimental.cloudChanges.autoStore': {
			enum: ['onShutdown', 'off'],
			enumDescriptions: [
				localize('autoStoreWorkingChanges.onShutdown', "Automatically store current working changes in the cloud on window close."),
				localize('autoStoreWorkingChanges.off', "Never attempt to automatically store working changes in the cloud.")
			],
			'type': 'string',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': 'off',
			'markdownDescription': localize('autoStoreWorkingChangesDescription', "Controls whether to automatically store available working changes in the cloud for the current workspace. This setting has no effect in the web."),
		},
		'workbench.cloudChanges.autoResume': {
			enum: ['onReload', 'off'],
			enumDescriptions: [
				localize('autoResumeWorkingChanges.onReload', "Automatically resume available working changes from the cloud on window reload."),
				localize('autoResumeWorkingChanges.off', "Never attempt to resume working changes from the cloud.")
			],
			'type': 'string',
			'tags': ['usesOnlineServices'],
			'default': 'onReload',
			'markdownDescription': localize('autoResumeWorkingChanges', "Controls whether to automatically resume available working changes stored in the cloud for the current workspace."),
		},
		'workbench.cloudChanges.continueOn': {
			enum: ['prompt', 'off'],
			enumDescriptions: [
				localize('continueOnCloudChanges.promptForAuth', 'Prompt the user to sign in to store working changes in the cloud with Continue Working On.'),
				localize('continueOnCloudChanges.off', 'Do not store working changes in the cloud with Continue Working On unless the user has already turned on Cloud Changes.')
			],
			type: 'string',
			tags: ['usesOnlineServices'],
			default: 'prompt',
			markdownDescription: localize('continueOnCloudChanges', 'Controls whether to prompt the user to store working changes in the cloud when using Continue Working On.')
		},
		'workbench.experimental.cloudChanges.partialMatches.enabled': {
			'type': 'boolean',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': false,
			'markdownDescription': localize('cloudChangesPartialMatchesEnabled', "Controls whether to surface cloud changes which partially match the current session.")
		}
	}
});
