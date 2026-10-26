/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IDisposable, Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { IFileService, IFilesConfiguration } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../platform/workspace/common/workspace.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { INotificationService, Severity, NeverShowAgainScope, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { equals } from '../../../../base/common/arrays.js';
import { IGitIgnoreWatcherExcludesService } from '../../../services/files/common/gitIgnoreWatcherExcludesService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';

/**
 * The file watches of a workspace folder.
 */
interface IWorkspaceFolderWatch extends IDisposable {

	/**
	 * The excludes derived from `.gitignore` that the watches use.
	 */
	readonly gitIgnoreExcludes: readonly string[];
}

export class WorkspaceWatcher extends Disposable {

	static readonly ID = 'workbench.contrib.workspaceWatcher';

	private readonly watchedWorkspaces = this._register(new DisposableMap(new ResourceMap<IWorkspaceFolderWatch>(resource => this.uriIdentityService.extUri.getComparisonKey(resource))));

	// Visible editors whose resource is excluded from watching by `.gitignore`
	// are watched separately so that they continue to reflect changes on disk
	private readonly gitIgnoreExcludedEditorWatches = this._register(new DisposableMap(new ResourceMap<IDisposable>(resource => this.uriIdentityService.extUri.getComparisonKey(resource))));

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IHostService private readonly hostService: IHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IGitIgnoreWatcherExcludesService private readonly gitIgnoreWatcherExcludesService: IGitIgnoreWatcherExcludesService,
		@IEditorService private readonly editorService: IEditorService
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
		this._register(this.gitIgnoreWatcherExcludesService.onDidChangeExcludes(folder => this.onDidChangeGitIgnoreExcludes(folder)));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.updateGitIgnoreExcludedEditorWatches()));
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

		this.updateGitIgnoreExcludedEditorWatches();
	}

	private onDidChangeWorkbenchState(): void {
		this.refresh();
	}

	private onDidChangeConfiguration(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('files.watcherExclude') || e.affectsConfiguration('files.watcherInclude')) {
			this.refresh();
		}
	}

	private onDidChangeGitIgnoreExcludes(folderUri: URI): void {
		const folder = this.contextService.getWorkspaceFolder(folderUri);
		if (folder && this.uriIdentityService.extUri.isEqual(folder.uri, folderUri)) {
			const gitIgnoreExcludes = this.gitIgnoreWatcherExcludesService.getExcludes(folder.uri);
			const watch = this.watchedWorkspaces.get(folder.uri);
			if (gitIgnoreExcludes && (!watch || !equals(watch.gitIgnoreExcludes, gitIgnoreExcludes))) {
				this.watchWorkspace(folder);
			}
		}

		this.updateGitIgnoreExcludedEditorWatches();
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
		const gitIgnoreExcludes = this.gitIgnoreWatcherExcludesService.getExcludes(workspace.uri);
		if (!gitIgnoreExcludes) {
			return; // watched once the `.gitignore` file was read (see `onDidChangeGitIgnoreExcludes`)
		}

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

		// Watch all paths as instructed. The excludes derived from `.gitignore`
		// are relative to the workspace folder, so they only apply to it
		const disposables = new DisposableStore();
		for (const [, pathToWatch] of pathsToWatch) {
			const isWorkspaceFolder = this.uriIdentityService.extUri.isEqual(pathToWatch, workspace.uri);
			disposables.add(this.fileService.watch(pathToWatch, { recursive: true, excludes: isWorkspaceFolder && gitIgnoreExcludes.length > 0 ? [...excludes, ...gitIgnoreExcludes] : excludes }));
		}
		this.watchedWorkspaces.set(workspace.uri, { gitIgnoreExcludes, dispose: () => disposables.dispose() });
	}

	private unwatchWorkspace(workspace: IWorkspaceFolder): void {
		this.watchedWorkspaces.deleteAndDispose(workspace.uri);
	}

	private refresh(): void {

		// Unwatch all first
		this.watchedWorkspaces.clearAndDisposeAll();

		// Watch each workspace folder
		for (const folder of this.contextService.getWorkspace().folders) {
			this.watchWorkspace(folder);
		}
	}

	private updateGitIgnoreExcludedEditorWatches(): void {
		const resources = new ResourceSet(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
		if (Array.from(this.watchedWorkspaces.values()).some(watch => watch.gitIgnoreExcludes.length > 0)) {
			for (const editor of this.editorService.visibleEditors) {
				for (const resource of [
					EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }),
					EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY })
				]) {
					if (resource && this.gitIgnoreWatcherExcludesService.isExcluded(resource)) {
						resources.add(resource);
					}
				}
			}
		}

		for (const resource of Array.from(this.gitIgnoreExcludedEditorWatches.keys())) {
			if (!resources.has(resource)) {
				this.gitIgnoreExcludedEditorWatches.deleteAndDispose(resource);
			}
		}

		// The file watcher does not reuse the recursive watcher of the workspace
		// folder for an excluded path and watches the path separately instead
		for (const resource of resources) {
			if (!this.gitIgnoreExcludedEditorWatches.has(resource)) {
				this.gitIgnoreExcludedEditorWatches.set(resource, this.fileService.watch(resource));
			}
		}
	}
}
