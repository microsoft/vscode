/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, IAction2Options, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { IEditSessionsStorageService, Change, ChangeType, Folder, EditSession, FileType, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_CONTAINER_ID, EditSessionSchemaVersion, IEditSessionsLogService, EDIT_SESSIONS_VIEW_ICON, EDIT_SESSIONS_TITLE, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_SIGNED_IN, EDIT_SESSIONS_DATA_VIEW_ID, decodeEditSessionFileContent } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { encodeBase64 } from 'vs/base/common/buffer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { EditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/browser/editSessionsStorageService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UserDataSyncErrorCode, UserDataSyncStoreError } from 'vs/platform/userDataSync/common/userDataSync';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/productService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { getVirtualWorkspaceLocation } from 'vs/platform/workspace/common/virtualWorkspace';
import { Schemas } from 'vs/base/common/network';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { EditSessionsLogService } from 'vs/workbench/contrib/editSessions/common/editSessionsLogService';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsService } from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditSessionsDataViews } from 'vs/workbench/contrib/editSessions/browser/editSessionsViews';
import { EditSessionsFileSystemProvider } from 'vs/workbench/contrib/editSessions/browser/editSessionsFileSystemProvider';
import { isNative } from 'vs/base/common/platform';
import { WorkspaceFolderCountContext } from 'vs/workbench/common/contextkeys';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { equals } from 'vs/base/common/objects';
import { IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';

registerSingleton(IEditSessionsLogService, EditSessionsLogService, false);
registerSingleton(IEditSessionsStorageService, EditSessionsWorkbenchService, false);

const continueEditSessionCommand: IAction2Options = {
	id: '_workbench.experimental.editSessions.actions.continueEditSession',
	title: { value: localize('continue edit session', "Continue Edit Session..."), original: 'Continue Edit Session...' },
	category: EDIT_SESSION_SYNC_CATEGORY,
	precondition: WorkspaceFolderCountContext.notEqualsTo('0'),
	f1: true
};
const openLocalFolderCommand: IAction2Options = {
	id: '_workbench.experimental.editSessions.actions.continueEditSession.openLocalFolder',
	title: { value: localize('continue edit session in local folder', "Open In Local Folder"), original: 'Open In Local Folder' },
	category: EDIT_SESSION_SYNC_CATEGORY,
	precondition: IsWebContext
};
const showOutputChannelCommand: IAction2Options = {
	id: 'workbench.experimental.editSessions.actions.showOutputChannel',
	title: { value: localize('show log', 'Show Log'), original: 'Show Log' },
	category: EDIT_SESSION_SYNC_CATEGORY
};
const resumingProgressOptions = {
	location: ProgressLocation.Window,
	type: 'syncing',
	title: `[${localize('resuming edit session window', 'Resuming edit session...')}](command:${showOutputChannelCommand.id})`
};
const queryParamName = 'editSessionId';
const experimentalSettingName = 'workbench.experimental.editSessions.enabled';

export class EditSessionsContribution extends Disposable implements IWorkbenchContribution {

	private registered = false;
	private continueEditSessionOptions: ContinueEditSessionItem[] = [];

	private readonly shouldShowViewsContext: IContextKey<boolean>;

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
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this.autoResumeEditSession();

		this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(experimentalSettingName)) {
				this.registerActions();
			}
		});

		this.registerActions();
		this.registerViews();
		this.registerContributedEditSessionOptions();

		this.shouldShowViewsContext = EDIT_SESSIONS_SHOW_VIEW.bindTo(this.contextKeyService);

		this._register(this.fileService.registerProvider(EditSessionsFileSystemProvider.SCHEMA, new EditSessionsFileSystemProvider(this.editSessionsStorageService)));
		this.lifecycleService.onWillShutdown((e) => e.join(this.autoStoreEditSession(), { id: 'autoStoreEditSession', label: localize('autoStoreEditSession', 'Storing current edit session...') }));
	}

	private autoResumeEditSession() {
		void this.progressService.withProgress(resumingProgressOptions, async () => {
			performance.mark('code/willResumeEditSessionFromIdentifier');

			type ResumeEvent = {};
			type ResumeClassification = {
				owner: 'joyceerhl'; comment: 'Reporting when an action is resumed from an edit session identifier.';
			};
			this.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.continue.resume');

			if (this.environmentService.editSessionId !== undefined) {
				await this.resumeEditSession(this.environmentService.editSessionId).finally(() => this.environmentService.editSessionId = undefined);
			} else if (
				this.configurationService.getValue('workbench.experimental.editSessions.enabled') === true &&
				this.configurationService.getValue('workbench.experimental.editSessions.autoResume') === 'onReload' &&
				this.editSessionsStorageService.isSignedIn
			) {
				// Attempt to resume edit session based on edit workspace identifier
				// Note: at this point if the user is not signed into edit sessions,
				// we don't want them to be prompted to sign in and should just return early
				await this.resumeEditSession(undefined, true);
			}

			performance.mark('code/didResumeEditSessionFromIdentifier');
		});
	}

	private async autoStoreEditSession() {
		if (this.configurationService.getValue('workbench.experimental.editSessions.autoStore') === 'onShutdown') {
			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				type: 'syncing',
				title: localize('store edit session', 'Storing edit session...')
			}, async () => this.storeEditSession(false));
		}
	}

	private registerViews() {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer(
			{
				id: EDIT_SESSIONS_CONTAINER_ID,
				title: EDIT_SESSIONS_TITLE,
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
		if (this.registered || this.configurationService.getValue(experimentalSettingName) !== true) {
			this.logService.info(`Skipping registering edit sessions actions as edit sessions are currently disabled. Set ${experimentalSettingName} to enable edit sessions.`);
			return;
		}

		this.registerContinueEditSessionAction();

		this.registerResumeLatestEditSessionAction();
		this.registerStoreLatestEditSessionAction();

		this.registerContinueInLocalFolderAction();

		this.registerShowEditSessionViewAction();
		this.registerShowEditSessionOutputChannelAction();

		this.registered = true;
	}

	private registerShowEditSessionOutputChannelAction() {
		this._register(registerAction2(class ShowEditSessionOutput extends Action2 {
			constructor() {
				super(showOutputChannelCommand);
			}

			run(accessor: ServicesAccessor, ...args: any[]) {
				const outputChannel = accessor.get(IOutputService);
				void outputChannel.showChannel(Constants.editSessionsLogChannelId);
			}
		}));
	}

	private registerShowEditSessionViewAction() {
		const that = this;
		this._register(registerAction2(class ShowEditSessionView extends Action2 {
			constructor() {
				super({
					id: 'workbench.editSessions.actions.showEditSessions',
					title: { value: localize('show edit session', "Show Edit Sessions"), original: 'Show Edit Sessions' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true,
					precondition: EDIT_SESSIONS_SIGNED_IN
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
				super(continueEditSessionCommand);
			}

			async run(accessor: ServicesAccessor, workspaceUri: URI | undefined): Promise<void> {
				type ContinueEditSessionEvent = {};
				type ContinueEditSessionClassification = {
					owner: 'joyceerhl'; comment: 'Reporting when the continue edit session action is run.';
				};
				that.telemetryService.publicLog2<ContinueEditSessionEvent, ContinueEditSessionClassification>('editSessions.continue.store');

				let uri = workspaceUri ?? await that.pickContinueEditSessionDestination();
				if (uri === undefined) { return; }

				// Run the store action to get back a ref
				const ref = await that.storeEditSession(false);

				// Append the ref to the URI
				if (ref !== undefined) {
					const encodedRef = encodeURIComponent(ref);
					uri = uri.with({
						query: uri.query.length > 0 ? (uri + `&${queryParamName}=${encodedRef}`) : `${queryParamName}=${encodedRef}`
					});
				} else {
					that.logService.warn(`Failed to store edit session when invoking ${continueEditSessionCommand.id}.`);
				}

				// Open the URI
				that.logService.info(`Opening ${uri.toString()}`);
				await that.openerService.open(uri, { openExternal: true });
			}
		}));
	}

	private registerResumeLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.experimental.editSessions.actions.resumeLatest',
					title: { value: localize('resume latest.v2', "Resume Latest Edit Session"), original: 'Resume Latest Edit Session' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor, editSessionId?: string): Promise<void> {
				await that.progressService.withProgress(resumingProgressOptions, async () => {
					type ResumeEvent = {};
					type ResumeClassification = {
						owner: 'joyceerhl'; comment: 'Reporting when the resume edit session action is invoked.';
					};
					that.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.resume');

					await that.resumeEditSession(editSessionId);
				});
			}
		}));
	}

	private registerStoreLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.experimental.editSessions.actions.storeCurrent',
					title: { value: localize('store current.v2', "Store Current Edit Session"), original: 'Store Current Edit Session' },
					category: EDIT_SESSION_SYNC_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				await that.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('storing edit session', 'Storing edit session...')
				}, async () => {
					type StoreEvent = {};
					type StoreClassification = {
						owner: 'joyceerhl'; comment: 'Reporting when the store edit session action is invoked.';
					};
					that.telemetryService.publicLog2<StoreEvent, StoreClassification>('editSessions.store');

					await that.storeEditSession(true);
				});
			}
		}));
	}

	async resumeEditSession(ref?: string, silent?: boolean): Promise<void> {
		// Edit sessions are not currently supported in empty workspaces
		// https://github.com/microsoft/vscode/issues/159220
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		this.logService.info(ref !== undefined ? `Resuming edit session with ref ${ref}...` : 'Resuming edit session...');

		const data = await this.editSessionsStorageService.read(ref);
		if (!data) {
			if (ref === undefined && !silent) {
				this.notificationService.info(localize('no edit session', 'There are no edit sessions to resume.'));
			} else if (ref !== undefined) {
				this.notificationService.warn(localize('no edit session content for ref', 'Could not resume edit session contents for ID {0}.', ref));
			}
			this.logService.info(`Aborting resuming edit session as no edit session content is available to be applied from ref ${ref}.`);
			return;
		}
		const editSession = data.editSession;
		ref = data.ref;

		if (editSession.version > EditSessionSchemaVersion) {
			this.notificationService.error(localize('client too old', "Please upgrade to a newer version of {0} to resume this edit session.", this.productService.nameLong));
			return;
		}

		try {
			const changes: ({ uri: URI; type: ChangeType; contents: string | undefined })[] = [];
			let hasLocalUncommittedChanges = false;
			const workspaceFolders = this.contextService.getWorkspace().folders;

			for (const folder of editSession.folders) {
				const cancellationTokenSource = new CancellationTokenSource();
				let folderRoot: IWorkspaceFolder | undefined;

				if (folder.canonicalIdentity) {
					// Look for an edit session identifier that we can use
					for (const f of workspaceFolders) {
						const identity = await this.editSessionIdentityService.getEditSessionIdentifier(f, cancellationTokenSource);
						this.logService.info(`Matching identity ${identity} against edit session folder identity ${folder.canonicalIdentity}...`);
						if (equals(identity, folder.canonicalIdentity)) {
							folderRoot = f;
							break;
						}
					}
				} else {
					folderRoot = workspaceFolders.find((f) => f.name === folder.name);
				}

				if (!folderRoot) {
					this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no matching workspace folder was found.`);
					return;
				}

				for (const repository of this.scmService.repositories) {
					if (repository.provider.rootUri !== undefined &&
						this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name === folder.name &&
						this.getChangedResources(repository).length > 0
					) {
						hasLocalUncommittedChanges = true;
						break;
					}
				}

				for (const { relativeFilePath, contents, type } of folder.workingChanges) {
					const uri = joinPath(folderRoot.uri, relativeFilePath);
					changes.push({ uri: uri, type: type, contents: contents });
				}
			}

			if (hasLocalUncommittedChanges) {
				// TODO@joyceerhl Provide the option to diff files which would be overwritten by edit session contents
				const result = await this.dialogService.confirm({
					message: localize('resume edit session warning', 'Resuming your edit session may overwrite your existing uncommitted changes. Do you want to proceed?'),
					type: 'warning',
					title: EDIT_SESSION_SYNC_CATEGORY.value
				});
				if (!result.confirmed) {
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

			this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
			await this.editSessionsStorageService.delete(ref);
			this.logService.info(`Deleted edit session with ref ${ref}.`);
		} catch (ex) {
			this.logService.error('Failed to resume edit session, reason: ', (ex as Error).toString());
			this.notificationService.error(localize('resume failed', "Failed to resume your edit session."));
		}
	}

	async storeEditSession(fromStoreCommand: boolean): Promise<string | undefined> {
		const folders: Folder[] = [];
		let hasEdits = false;

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
					workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents: contents, relativeFilePath: relativeFilePath });
				} else {
					// Assume it's a deletion
					workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: undefined, relativeFilePath: relativeFilePath });
				}
			}

			const canonicalIdentity = workspaceFolder ? await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, new CancellationTokenSource()) : undefined;

			folders.push({ workingChanges, name: name ?? '', canonicalIdentity: canonicalIdentity ?? undefined });
		}

		if (!hasEdits) {
			this.logService.info('Skipping storing edit session as there are no edits to store.');
			if (fromStoreCommand) {
				this.notificationService.info(localize('no edits to store', 'Skipped storing edit session as there are no edits to store.'));
			}
			return undefined;
		}

		const data: EditSession = { folders, version: 2 };

		try {
			this.logService.info(`Storing edit session...`);
			const ref = await this.editSessionsStorageService.write(data);
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
						this.notificationService.error(localize('payload too large', 'Your edit session exceeds the size limit and cannot be stored.'));
						break;
					default:
						this.telemetryService.publicLog2<UploadFailedEvent, UploadFailedClassification>('editSessions.upload.failed', { reason: 'unknown' });
						this.notificationService.error(localize('payload failed', 'Your edit session cannot be stored.'));
						break;
				}
			}
		}

		return undefined;
	}

	private getChangedResources(repository: ISCMRepository) {
		const trackedUris = repository.provider.groups.elements.reduce((resources, resourceGroups) => {
			resourceGroups.elements.forEach((resource) => resources.add(resource.sourceUri));
			return resources;
		}, new Set<URI>()); // A URI might appear in more than one resource group

		return [...trackedUris];
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

					continueEditSessionOptions.push(new ContinueEditSessionItem(
						ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title,
						command.id,
						command.source,
						ContextKeyExpr.deserialize(contribution.when)
					));
				}
			}
			this.continueEditSessionOptions = continueEditSessionOptions;
		});
	}

	private registerContinueInLocalFolderAction(): void {
		const that = this;
		this._register(registerAction2(class ContinueInLocalFolderAction extends Action2 {
			constructor() {
				super(openLocalFolderCommand);
			}

			async run(accessor: ServicesAccessor): Promise<URI | undefined> {
				const selection = await that.fileDialogService.showOpenDialog({
					title: localize('continueEditSession.openLocalFolder.title', 'Select a local folder to continue your edit session in'),
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
	}

	private async pickContinueEditSessionDestination(): Promise<URI | undefined> {
		const quickPick = this.quickInputService.createQuickPick<ContinueEditSessionItem>();

		const workspaceContext = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER
			? this.contextService.getWorkspace().folders[0].name
			: this.contextService.getWorkspace().folders.map((folder) => folder.name).join(', ');
		quickPick.title = localize('continueEditSessionPick.title', "Continue {0} on", `'${workspaceContext}'`);
		quickPick.placeholder = localize('continueEditSessionPick.placeholder', 'Choose how you would like to continue working');
		quickPick.items = this.createPickItems();

		const command = await new Promise<string | undefined>((resolve, reject) => {
			quickPick.onDidHide(() => resolve(undefined));

			quickPick.onDidAccept((e) => {
				const selection = quickPick.activeItems[0].command;
				resolve(selection);
				quickPick.hide();
			});

			quickPick.show();
		});

		quickPick.dispose();

		if (command === undefined) {
			return undefined;
		}

		try {
			const uri = await this.commandService.executeCommand(command);
			return URI.isUri(uri) ? uri : undefined;
		} catch (ex) {
			return undefined;
		}
	}

	private createPickItems(): ContinueEditSessionItem[] {
		const items = [...this.continueEditSessionOptions].filter((option) => option.when === undefined || this.contextKeyService.contextMatchesRules(option.when));

		if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined && isNative) {
			items.push(new ContinueEditSessionItem(
				'$(folder) ' + localize('continueEditSessionItem.openInLocalFolder.v2', 'Open in Local Folder'),
				openLocalFolderCommand.id,
				localize('continueEditSessionItem.builtin', 'Built-in')
			));
		}

		return items.sort((item1, item2) => item1.label.localeCompare(item2.label));
	}
}

class ContinueEditSessionItem implements IQuickPickItem {
	constructor(
		public readonly label: string,
		public readonly command: string,
		public readonly description?: string,
		public readonly when?: ContextKeyExpression,
	) { }
}

interface ICommand {
	command: string;
	group: string;
	when: string;
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
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, 'EditSessionsContribution', LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.experimental.editSessions.autoStore': {
			enum: ['onShutdown', 'off'],
			enumDescriptions: [
				localize('autoStore.onShutdown', "Automatically store current edit session on window close."),
				localize('autoStore.off', "Never attempt to automatically store an edit session.")
			],
			'type': 'string',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': 'off',
			'markdownDescription': localize('autoStore', "Controls whether to automatically store an available edit session for the current workspace."),
		},
		'workbench.experimental.editSessions.enabled': {
			'type': 'boolean',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': true,
			'markdownDescription': localize('editSessionsEnabled', "Controls whether to display cloud-enabled actions to store and resume uncommitted changes when switching between web, desktop, or devices."),
		},
		'workbench.experimental.editSessions.autoResume': {
			enum: ['onReload', 'off'],
			enumDescriptions: [
				localize('autoResume.onReload', "Automatically resume available edit session on window reload."),
				localize('autoResume.off', "Never attempt to resume an edit session.")
			],
			'type': 'string',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': 'onReload',
			'markdownDescription': localize('autoResume', "Controls whether to automatically resume an available edit session for the current workspace."),
		},
	}
});
