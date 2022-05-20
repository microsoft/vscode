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
import { ISessionSyncWorkbenchService, Change, ChangeType, Folder, EditSession } from 'vs/workbench/services/sessionSync/common/sessionSync';
import { ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';


const SYNC_TITLE = localize('session sync', 'Edit Sessions');
const applyLatestCommand = {
	id: 'workbench.sessionSync.actions.applyLatest',
	title: localize('apply latest', "{0}: Apply Latest Edit Session", SYNC_TITLE),
};
const storeLatestCommand = {
	id: 'workbench.sessionSync.actions.publishLatest',
	title: localize('store latest', "{0}: Store Latest Edit Session", SYNC_TITLE),
};

class SessionSyncContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ISessionSyncWorkbenchService private readonly sessionSyncWorkbenchService: ISessionSyncWorkbenchService,
		@IFileService private readonly fileService: IFileService,
		@ISCMService private readonly scmService: ISCMService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		this.registerApplyEditSessionAction();
		this.registerStoreEditSessionAction();
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
				const editSession = await that.sessionSyncWorkbenchService.read();
				if (!editSession) {
					return;
				}

				if ('folders' in editSession && Array.isArray(editSession.folders)) {
					for (const folder of editSession.folders) {
						const folderRoot = that.contextService.getWorkspace().folders.find((f) => f.name === folder.name);
						if (!folderRoot) {
							return;
						}

						for (const { relativeFilePath, contents, type } of folder.workingChanges) {
							const uri = joinPath(folderRoot.uri, relativeFilePath);
							if (type === ChangeType.Addition) {
								await that.fileService.writeFile(uri, VSBuffer.fromString(contents));
							} else if (type === ChangeType.Deletion && await that.fileService.exists(uri)) {
								await that.fileService.del(uri);
							}
						}
					}
				}
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
				const folders: Folder[] = [];

				for (const repository of that.scmService.repositories) {
					// Look through all resource groups and compute which files were added/modified/deleted
					const trackedUris = repository.provider.groups.elements.reduce((resources, resourceGroups) => {
						resourceGroups.elements.map((resource) => resources.add(resource.sourceUri));
						return resources;
					}, new Set<URI>()); // A URI might appear in more than one resource group

					const workingChanges: Change[] = [];
					let name = repository.provider.rootUri ? that.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name : undefined;

					for (const uri of trackedUris) {
						name = name ?? that.contextService.getWorkspaceFolder(uri)?.name;

						if (await that.fileService.exists(uri)) {
							workingChanges.push({ type: ChangeType.Addition, contents: (await that.fileService.readFile(uri)).value.toString(), relativeFilePath: uri.path });
						} else {
							// Assume it's a deletion
							workingChanges.push({ type: ChangeType.Deletion, contents: undefined, relativeFilePath: uri.path });
						}
					}

					folders.push({ workingChanges, name: name ?? '' });
				}

				const data: EditSession = { folders };

				await that.sessionSyncWorkbenchService.write(data);
			}
		}));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SessionSyncContribution, LifecyclePhase.Restored);
