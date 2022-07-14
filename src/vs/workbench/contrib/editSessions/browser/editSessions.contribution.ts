/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, IAction2Options, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { IEditSessionsWorkbenchService, Change, ChangeType, Folder, EditSession, FileType, EDIT_SESSION_SYNC_CATEGORY, EditSessionSchemaVersion, IEditSessionsLogService } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { EditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/browser/editSessionsWorkbenchService';
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
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { getVirtualWorkspaceLocation } from 'vs/platform/workspace/common/virtualWorkspace';
import { Schemas } from 'vs/base/common/network';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { EditSessionsLogService } from 'vs/workbench/contrib/editSessions/common/editSessionsLogService';

registerSingleton(IEditSessionsLogService, EditSessionsLogService);
registerSingleton(IEditSessionsWorkbenchService, EditSessionsWorkbenchService);

const continueEditSessionCommand: IAction2Options = {
	id: '_workbench.experimental.editSessions.actions.continueEditSession',
	title: { value: localize('continue edit session', "Continue Edit Session..."), original: 'Continue Edit Session...' },
	category: EDIT_SESSION_SYNC_CATEGORY,
	f1: true
};
const openLocalFolderCommand: IAction2Options = {
	id: '_workbench.experimental.editSessions.actions.continueEditSession.openLocalFolder',
	title: { value: localize('continue edit session in local folder', "Open In Local Folder"), original: 'Open In Local Folder' },
	category: EDIT_SESSION_SYNC_CATEGORY,
	precondition: IsWebContext
};
const queryParamName = 'editSessionId';
const experimentalSettingName = 'workbench.experimental.editSessions.enabled';

export class EditSessionsContribution extends Disposable implements IWorkbenchContribution {

	private registered = false;
	private continueEditSessionOptions: ContinueEditSessionItem[] = [];

	constructor(
		@IEditSessionsWorkbenchService private readonly editSessionsWorkbenchService: IEditSessionsWorkbenchService,
		@IFileService private readonly fileService: IFileService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISCMService private readonly scmService: ISCMService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IEditSessionsLogService private readonly logService: IEditSessionsLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService
	) {
		super();

		if (this.environmentService.editSessionId !== undefined) {
			type ResumeEvent = {};
			type ResumeClassification = {
				owner: 'joyceerhl'; comment: 'Reporting when an action is resumed from an edit session identifier.';
			};
			this.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.continue.resume');

			void this.resumeEditSession(this.environmentService.editSessionId).finally(() => this.environmentService.editSessionId = undefined);
		}

		this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(experimentalSettingName)) {
				this.registerActions();
			}
		});

		this.registerActions();

		continueEditSessionExtPoint.setHandler(extensions => {
			const continueEditSessionOptions: ContinueEditSessionItem[] = [];
			for (const extension of extensions) {
				if (!isProposedApiEnabled(extension.description, 'contribEditSessions')) {
					continue;
				}
				if (!Array.isArray(extension.value)) {
					continue;
				}
				const commands = new Map((extension.description.contributes?.commands ?? []).map(c => [c.command, c]));
				for (const contribution of extension.value) {
					if (!contribution.command || !contribution.group || !contribution.when) {
						continue;
					}
					const fullCommand = commands.get(contribution.command);
					if (!fullCommand) { return; }

					continueEditSessionOptions.push(new ContinueEditSessionItem(
						fullCommand.title,
						fullCommand.command,
						ContextKeyExpr.deserialize(contribution.when)
					));
				}
			}
			this.continueEditSessionOptions = continueEditSessionOptions;
		});
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

		this.registered = true;
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

			async run(accessor: ServicesAccessor): Promise<void> {
				await that.progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('resuming edit session', 'Resuming edit session...')
				}, async () => {
					type ResumeEvent = {};
					type ResumeClassification = {
						owner: 'joyceerhl'; comment: 'Reporting when the resume edit session action is invoked.';
					};
					that.telemetryService.publicLog2<ResumeEvent, ResumeClassification>('editSessions.resume');

					await that.resumeEditSession();
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

	async resumeEditSession(ref?: string): Promise<void> {
		this.logService.info(ref !== undefined ? `Resuming edit session with ref ${ref}...` : 'Resuming edit session...');

		const data = await this.editSessionsWorkbenchService.read(ref);
		if (!data) {
			if (ref === undefined) {
				this.notificationService.info(localize('no edit session', 'There are no edit sessions to resume.'));
			} else {
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

			for (const folder of editSession.folders) {
				const folderRoot = this.contextService.getWorkspace().folders.find((f) => f.name === folder.name);
				if (!folderRoot) {
					this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no corresponding workspace folder named ${folder.name} is currently open.`);
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
					await this.fileService.writeFile(uri, VSBuffer.fromString(contents!));
				} else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
					await this.fileService.del(uri);
				}
			}

			this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
			await this.editSessionsWorkbenchService.delete(ref);
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
			let name = repository.provider.rootUri ? this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name : undefined;

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
					workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents: (await this.fileService.readFile(uri)).value.toString(), relativeFilePath: relativeFilePath });
				} else {
					// Assume it's a deletion
					workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: undefined, relativeFilePath: relativeFilePath });
				}
			}

			folders.push({ workingChanges, name: name ?? '' });
		}

		if (!hasEdits) {
			this.logService.info('Skipping storing edit session as there are no edits to store.');
			if (fromStoreCommand) {
				this.notificationService.info(localize('no edits to store', 'Skipped storing edit session as there are no edits to store.'));
			}
			return undefined;
		}

		const data: EditSession = { folders, version: 1 };

		try {
			this.logService.info(`Storing edit session...`);
			const ref = await this.editSessionsWorkbenchService.write(data);
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

		quickPick.title = localize('continueEditSessionPick.title', 'Continue Edit Session...');
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

		if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined) {
			items.push(new ContinueEditSessionItem(
				localize('continueEditSessionItem.openInLocalFolder', 'Open In Local Folder'),
				openLocalFolderCommand.id,
			));
		}

		return items;
	}
}

class ContinueEditSessionItem implements IQuickPickItem {
	constructor(
		public readonly label: string,
		public readonly command: string,
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
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.experimental.editSessions.enabled': {
			'type': 'boolean',
			'tags': ['experimental', 'usesOnlineServices'],
			'default': false,
			'markdownDescription': localize('editSessionsEnabled', "Controls whether to display cloud-enabled actions to store and resume uncommitted changes when switching between web, desktop, or devices."),
		},
	}
});
