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
import { ISessionSyncWorkbenchService, Change, ChangeType, Folder, EditSession, FileType } from 'vs/workbench/services/sessionSync/common/sessionSync';
import { ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { SessionSyncWorkbenchService } from 'vs/workbench/services/sessionSync/browser/sessionSyncWorkbenchService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(ISessionSyncWorkbenchService, SessionSyncWorkbenchService);

const SYNC_TITLE = localize('session sync', 'Edit Sessions');
const applyLatestCommand = {
	id: 'workbench.sessionSync.actions.applyLatest',
	title: localize('apply latest', "{0}: Apply Latest Edit Session", SYNC_TITLE),
};
const storeLatestCommand = {
	id: 'workbench.sessionSync.actions.storeLatest',
	title: localize('store latest', "{0}: Store Latest Edit Session", SYNC_TITLE),
};

export class SessionSyncContribution extends Disposable implements IWorkbenchContribution {

	private registered = false;

	constructor(
		@ISessionSyncWorkbenchService private readonly sessionSyncWorkbenchService: ISessionSyncWorkbenchService,
		@IFileService private readonly fileService: IFileService,
		@IProgressService private readonly progressService: IProgressService,
		@ISCMService private readonly scmService: ISCMService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('workbench.experimental.sessionSync.enabled')) {
				this.registerActions();
			}
		});

		this.registerActions();
	}

	private registerActions() {
		if (this.registered || this.configurationService.getValue('workbench.experimental.sessionSync.enabled') !== true) {
			return;
		}

		this.registerApplyEditSessionAction();
		this.registerStoreEditSessionAction();

		this.registered = true;
	}

	private registerApplyEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class ApplyEditSessionAction extends Action2 {
			constructor() {
				super({
					id: applyLatestCommand.id,
					title: applyLatestCommand.title,
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

	private registerStoreEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class StoreEditSessionAction extends Action2 {
			constructor() {
				super({
					id: storeLatestCommand.id,
					title: storeLatestCommand.title,
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

	async applyEditSession() {
		const editSession = await this.sessionSyncWorkbenchService.read();
		if (!editSession) {
			return;
		}

		for (const folder of editSession.folders) {
			const folderRoot = this.contextService.getWorkspace().folders.find((f) => f.name === folder.name);
			if (!folderRoot) {
				return;
			}

			for (const { relativeFilePath, contents, type } of folder.workingChanges) {
				const uri = joinPath(folderRoot.uri, relativeFilePath);
				if (type === ChangeType.Addition) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(contents));
				} else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
					await this.fileService.del(uri);
				}
			}
		}
	}

	async storeEditSession() {
		const folders: Folder[] = [];

		for (const repository of this.scmService.repositories) {
			// Look through all resource groups and compute which files were added/modified/deleted
			const trackedUris = repository.provider.groups.elements.reduce((resources, resourceGroups) => {
				resourceGroups.elements.map((resource) => resources.add(resource.sourceUri));
				return resources;
			}, new Set<URI>()); // A URI might appear in more than one resource group

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

		await this.sessionSyncWorkbenchService.write(data);
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SessionSyncContribution, LifecyclePhase.Restored);
