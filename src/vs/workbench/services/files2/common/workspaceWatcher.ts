/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, IFileService } from 'vs/platform/files/common/files';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ResourceMap } from 'vs/base/common/map';

export class WorkspaceWatchLogic extends Disposable {

	private watches = new ResourceMap<IDisposable>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		this.registerListeners();

		this.refresh();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
	}

	private onDidChangeWorkspaceFolders(e: IWorkspaceFoldersChangeEvent): void {

		// Removed workspace: Unwatch
		for (const removed of e.removed) {
			this.unwatchWorkspace(removed.uri);
		}

		// Added workspace: Watch
		for (const added of e.added) {
			this.watchWorkspace(added.uri);
		}
	}

	private onDidChangeWorkbenchState(): void {
		this.refresh();
	}

	private onDidChangeConfiguration(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('files.watcherExclude')) {
			this.refresh();
		}
	}

	private watchWorkspace(resource: URI) {

		// Compute the watcher exclude rules from configuration
		const excludes: string[] = [];
		const config = this.configurationService.getValue<IFilesConfiguration>({ resource });
		if (config.files && config.files.watcherExclude) {
			for (const key in config.files.watcherExclude) {
				if (config.files.watcherExclude[key] === true) {
					excludes.push(key);
				}
			}
		}

		// Watch workspace
		const disposable = this.fileService.watch(resource, { recursive: true, excludes });
		this.watches.set(resource, disposable);
	}

	private unwatchWorkspace(resource: URI) {
		if (this.watches.has(resource)) {
			dispose(this.watches.get(resource));
			this.watches.delete(resource);
		}
	}

	private refresh(): void {

		// Unwatch all first
		this.unwatchWorkspaces();

		// Watch each workspace folder
		for (const folder of this.contextService.getWorkspace().folders) {
			this.watchWorkspace(folder.uri);
		}
	}

	private unwatchWorkspaces() {
		this.watches.forEach(disposable => dispose(disposable));
		this.watches.clear();
	}

	dispose(): void {
		super.dispose();

		this.unwatchWorkspaces();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceWatchLogic, LifecyclePhase.Restored);