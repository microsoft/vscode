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
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { UserDataSyncStoreClient } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';

const SYNC_TITLE = localize('session sync', 'Session Sync');
const sessionSyncCommand = {
	id: 'workbench.sessionSync.actions.applyLatest',
	title: localize('apply latest', "{0}: Apply Latest Edit Session", SYNC_TITLE),
};

class SessionSyncContribution extends Disposable implements IWorkbenchContribution {

	private storeClient: UserDataSyncStoreClient | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		const server = this.productService['sessionSync.store']; // TODO@joyceerhl update product.json in distro
		if (server?.url) {
			this.initializeStoreClient(server.url);
			this.registerApplyEditSessionAction();
		}
	}

	private initializeStoreClient(url: string) {
		this.storeClient = new UserDataSyncStoreClient(URI.parse(url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
		// this.storeClient.setAuthToken(); // TODO@joyceerhl set this from the auth provider
		this.storeClient.onTokenSucceed(() => undefined);
	}

	private registerApplyEditSessionAction(): void {
		const that = this;
		this._register(registerAction2(class ApplyEditSessionAction extends Action2 {
			constructor() {
				super({
					id: sessionSyncCommand.id,
					title: sessionSyncCommand.title,
					menu: {
						id: MenuId.CommandPalette,
					}
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				// Pull latest session data from service
				const sessionData = await that.storeClient?.read('editSessions', null);
				if (!sessionData?.content) {
					return;
				}

				// Apply data to workspace
				const editSession = JSON.parse(sessionData.content);
				if ('folders' in editSession && Array.isArray(editSession.folders)) {
					for (const folder of editSession.folders) {
						const folderRoot = that.contextService.getWorkspace().folders.find((f) => f.name === folder.name);
						if (!folderRoot) {
							return;
						}

						for (const { relativeFilePath, contents, type } of folder.workingChanges) {
							const uri = joinPath(folderRoot.uri, relativeFilePath);
							if (type === 1) {
								await that.fileService.writeFile(uri, VSBuffer.fromString(contents));
							} else if (type === 2) {
								await that.fileService.del(uri);
							}
						}
					}
				}
			}
		}));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SessionSyncContribution, LifecyclePhase.Ready);
