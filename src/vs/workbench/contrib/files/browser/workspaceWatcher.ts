/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IDisposable, Disposable, dispose, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { IFileService, IFilesConfiguration } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../platform/workspace/common/workspace.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { INotificationService, Severity, NeverShowAgainScope, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

export class WorkspaceWatcher extends Disposable {

	static readonly ID = 'workbench.contrib.workspaceWatcher';

	private readonly watchedWorkspaces = new ResourceMap<IDisposable>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IHostService private readonly hostService: IHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this.registerListeners();

		this.refresh();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
		this._register(this.fileService.onDidWatchError(error => this.onDidWatchError(error)));
	}

	private onDidChangeWorkspaceFolders(e: IWorkspaceFoldersChangeEvent): void {

		// Removed workspace: Unwatch
		for (const removed of e.removed) {
			this.unwatchWorkspace(removed);
		}

		// Added workspace: Watch
		for (const added of e.added) {
			this.watchWorkspace(added);
		}
	}

	private onDidChangeWorkbenchState(): void {
		this.refresh();
	}

	private onDidChangeConfiguration(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('files.watcherExclude') || e.affectsConfiguration('files.watcherInclude')) {
			this.refresh();
		}
	}

	private onDidWatchError(error: Error): void {
		const msg = error.toString();
		let reason: 'ENOSPC' | 'EUNKNOWN' | 'ETERM' | undefined = undefined;

		// Detect if we run into ENOSPC issues
		if (msg.indexOf('ENOSPC') >= 0) {
			reason = 'ENOSPC';

			this.notificationService.prompt(
				Severity.Warning,
				localize('enospcError', "Unable to watch for file changes. Please follow the instructions link to resolve this issue."),
				[{
					label: localize('learnMore', "Instructions"),
					run: () => this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=867693'))
				}],
				{
					sticky: true,
					neverShowAgain: { id: 'ignoreEnospcError', isSecondary: true, scope: NeverShowAgainScope.WORKSPACE }
				}
			);
		}

		// Detect when the watcher throws an error unexpectedly
		else if (msg.indexOf('EUNKNOWN') >= 0) {
			reason = 'EUNKNOWN';

			this.notificationService.prompt(
				Severity.Warning,
				localize('eshutdownError', "File changes watcher stopped unexpectedly. A reload of the window may enable the watcher again unless the workspace cannot be watched for file changes."),
				[{
					label: localize('reload', "Reload"),
					run: () => this.hostService.reload()
				}],
				{
					sticky: true,
					priority: NotificationPriority.SILENT // reduce potential spam since we don't really know how often this fires
				}
			);
		}

		// Detect unexpected termination
		else if (msg.indexOf('ETERM') >= 0) {
			reason = 'ETERM';
		}

		// Log telemetry if we gathered a reason (logging it from the renderer
		// allows us to investigate this situation in context of experiments)
		if (reason) {
			type WatchErrorClassification = {
				owner: 'bpasero';
				comment: 'An event that fires when a watcher errors';
				reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The watcher error reason.' };
			};
			type WatchErrorEvent = {
				reason: string;
			};
			this.telemetryService.publicLog2<WatchErrorEvent, WatchErrorClassification>('fileWatcherError', { reason });
		}
	}

	private watchWorkspace(workspace: IWorkspaceFolder): void {

		// Compute the watcher exclude rules from configuration
		const excludes: string[] = [];
		const config = this.configurationService.getValue<IFilesConfiguration>({ resource: workspace.uri });
		if (config.files?.watcherExclude) {
			for (const key in config.files.watcherExclude) {
				if (key && config.files.watcherExclude[key] === true) {
					excludes.push(key);
				}
			}
		}

		const pathsToWatch = new ResourceMap<URI>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));

		// Add the workspace as path to watch
		pathsToWatch.set(workspace.uri, workspace.uri);

		// Compute additional includes from configuration
		if (config.files?.watcherInclude) {
			for (const includePath of config.files.watcherInclude) {
				if (!includePath) {
					continue;
				}

				// Absolute: verify a child of the workspace
				if (isAbsolute(includePath)) {
					const candidate = URI.file(includePath).with({ scheme: workspace.uri.scheme });
					if (this.uriIdentityService.extUri.isEqualOrParent(candidate, workspace.uri)) {
						pathsToWatch.set(candidate, candidate);
					}
				}

				// Relative: join against workspace folder
				else {
					const candidate = workspace.toResource(includePath);
					pathsToWatch.set(candidate, candidate);
				}
			}
		}

		// Watch all paths as instructed
		const disposables = new DisposableStore();
		for (const [, pathToWatch] of pathsToWatch) {
			disposables.add(this.fileService.watch(pathToWatch, { recursive: true, excludes }));
		}
		this.watchedWorkspaces.set(workspace.uri, disposables);
	}

	private unwatchWorkspace(workspace: IWorkspaceFolder): void {
		if (this.watchedWorkspaces.has(workspace.uri)) {
			dispose(this.watchedWorkspaces.get(workspace.uri));
			this.watchedWorkspaces.delete(workspace.uri);
		}
	}

	private refresh(): void {

		// Unwatch all first
		this.unwatchWorkspaces();

		// Watch each workspace folder
		for (const folder of this.contextService.getWorkspace().folders) {
			this.watchWorkspace(folder);
		}
	}

	private unwatchWorkspaces(): void {
		for (const [, disposable] of this.watchedWorkspaces) {
			disposable.dispose();
		}
		this.watchedWorkspaces.clear();
	}

	override dispose(): void {
		super.dispose();

		this.unwatchWorkspaces();
	}
}
