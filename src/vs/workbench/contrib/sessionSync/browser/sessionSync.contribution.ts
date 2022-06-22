/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { ISessionSyncWorkbenchService, Change, ChangeType, Folder, EditSession, FileType, EDIT_SESSION_SYNC_TITLE, EditSessionSchemaVersion } from 'vs/workbench/services/sessionSync/common/sessionSync';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { SessionSyncWorkbenchService } from 'vs/workbench/services/sessionSync/browser/sessionSyncWorkbenchService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UserDataSyncErrorCode, UserDataSyncStoreError } from 'vs/platform/userDataSync/common/userDataSync';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

registerSingleton(ISessionSyncWorkbenchService, SessionSyncWorkbenchService);

const resumeLatestCommand = {
	id: 'workbench.experimental.editSessions.actions.resumeLatest',
	title: localize('resume latest', "{0}: Resume Latest Edit Session", EDIT_SESSION_SYNC_TITLE),
};
const storeCurrentCommand = {
	id: 'workbench.experimental.editSessions.actions.storeCurrent',
	title: localize('store current', "{0}: Store Current Edit Session", EDIT_SESSION_SYNC_TITLE),
};
const continueEditSessionCommand = {
	id: '_workbench.experimental.editSessions.actions.continueEditSession',
	title: localize('continue edit session', "{0}: Continue Edit Session", EDIT_SESSION_SYNC_TITLE),
};
const queryParamName = 'editSessionId';

export class SessionSyncContribution extends Disposable implements IWorkbenchContribution {

	private registered = false;

	constructor(
		@ISessionSyncWorkbenchService private readonly sessionSyncWorkbenchService: ISessionSyncWorkbenchService,
		@IFileService private readonly fileService: IFileService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISCMService private readonly scmService: ISCMService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		if (this.environmentService.editSessionId !== undefined) {
			void this.applyEditSession(this.environmentService.editSessionId).finally(() => this.environmentService.editSessionId = undefined);
		}

		this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('workbench.experimental.editSessions.enabled')) {
				this.registerActions();
			}
		});

		this.registerActions();
	}

	private registerActions() {
		if (this.registered || this.configurationService.getValue('workbench.experimental.editSessions.enabled') !== true) {
			return;
		}

		this.registerContinueEditSessionAction();

		this.registerApplyLatestEditSessionAction();
		this.registerStoreLatestEditSessionAction();

		this.registered = true;
	}

	private registerContinueEditSessionAction() {
		const that = this;
		this._register(registerAction2(class ContinueEditSessionAction extends Action2 {
			constructor() {
				super({
					id: continueEditSessionCommand.id,
					title: continueEditSessionCommand.title
				});
			}

			async run(accessor: ServicesAccessor, workspaceUri: URI): Promise<void> {
				// Run the store action to get back a ref
				const ref = await that.storeEditSession();

				// Append the ref to the URI
				if (ref !== undefined) {
					const encodedRef = encodeURIComponent(ref);
					workspaceUri = workspaceUri.with({
						query: workspaceUri.query.length > 0 ? (workspaceUri + `&${queryParamName}=${encodedRef}`) : `${queryParamName}=${encodedRef}`
					});
				} else {
					that.logService.warn(`Edit Sessions: Failed to store edit session when invoking ${continueEditSessionCommand.id}.`);
				}

				// Open the URI
				that.logService.info(`Edit Sessions: opening ${workspaceUri.toString()}`);
				await that.openerService.open(workspaceUri, { openExternal: true });
			}
		}));
	}

	private registerApplyLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class ApplyLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: resumeLatestCommand.id,
					title: resumeLatestCommand.title,
					menu: {
						id: MenuId.CommandPalette,
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				await that.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('applying edit session', 'Applying edit session...')
				}, async () => await that.applyEditSession());
			}
		}));
	}

	private registerStoreLatestEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
			constructor() {
				super({
					id: storeCurrentCommand.id,
					title: storeCurrentCommand.title,
					menu: {
						id: MenuId.CommandPalette,
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				await that.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('storing edit session', 'Storing edit session...')
				}, async () => await that.storeEditSession());
			}
		}));
	}

	async applyEditSession(ref?: string): Promise<void> {
		if (ref !== undefined) {
			this.logService.info(`Edit Sessions: Applying edit session with ref ${ref}.`);
		}

		const data = await this.sessionSyncWorkbenchService.read(ref);
		if (!data) {
			return;
		}
		const editSession = data.editSession;
		ref = data.ref;

		if (editSession.version > EditSessionSchemaVersion) {
			this.notificationService.error(localize('client too old', "Please upgrade to a newer version of {0} to apply this edit session.", this.productService.nameLong));
			return;
		}

		try {
			const changes: ({ uri: URI; type: ChangeType; contents: string | undefined })[] = [];
			let hasLocalUncommittedChanges = false;

			for (const folder of editSession.folders) {
				const folderRoot = this.contextService.getWorkspace().folders.find((f) => f.name === folder.name);
				if (!folderRoot) {
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
					message: localize('apply edit session warning', 'Applying your edit session may overwrite your existing uncommitted changes. Do you want to proceed?'),
					type: 'warning',
					title: EDIT_SESSION_SYNC_TITLE
				});
				if (!result.confirmed) {
					return;
				}
			}

			for (const { uri, type, contents } of changes) {
				if (type === ChangeType.Addition) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(contents!));
				} else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
					await this.fileService.del(uri);
				}
			}

			await this.sessionSyncWorkbenchService.delete(ref);
		} catch (ex) {
			this.logService.error('Edit Sessions:', (ex as Error).toString());
			this.notificationService.error(localize('apply failed', "Failed to apply your edit session."));
		}
	}

	async storeEditSession(): Promise<string | undefined> {
		const folders: Folder[] = [];

		for (const repository of this.scmService.repositories) {
			// Look through all resource groups and compute which files were added/modified/deleted
			const trackedUris = this.getChangedResources(repository); // A URI might appear in more than one resource group

			const workingChanges: Change[] = [];
			let name = repository.provider.rootUri ? this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name : undefined;

			for (const uri of trackedUris) {
				const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
				if (!workspaceFolder) {
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

				if (await this.fileService.exists(uri)) {
					workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents: (await this.fileService.readFile(uri)).value.toString(), relativeFilePath: relativeFilePath });
				} else {
					// Assume it's a deletion
					workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: undefined, relativeFilePath: relativeFilePath });
				}
			}

			folders.push({ workingChanges, name: name ?? '' });
		}

		const data: EditSession = { folders, version: 1 };

		try {
			const ref = await this.sessionSyncWorkbenchService.write(data);
			this.logService.info(`Edit Sessions: Stored edit session with ref ${ref}.`);
			return ref;
		} catch (ex) {
			type UploadFailedEvent = { reason: string };
			type UploadFailedClassification = {
				owner: 'joyceerhl'; comment: 'Reporting when Continue On server request fails.';
				reason?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The reason that the server request failed.' };
			};

			if (ex instanceof UserDataSyncStoreError) {
				switch (ex.code) {
					case UserDataSyncErrorCode.TooLarge:
						// Uploading a payload can fail due to server size limits
						this.telemetryService.publicLog2<UploadFailedEvent, UploadFailedClassification>('sessionSync.upload.failed', { reason: 'TooLarge' });
						this.notificationService.error(localize('payload too large', 'Your edit session exceeds the size limit and cannot be stored.'));
						break;
					default:
						this.telemetryService.publicLog2<UploadFailedEvent, UploadFailedClassification>('sessionSync.upload.failed', { reason: 'unknown' });
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
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SessionSyncContribution, LifecyclePhase.Restored);
