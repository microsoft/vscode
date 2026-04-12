/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { Disposable, dispose, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { INotificationService, Severity, NeverShowAgainScope, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
let WorkspaceWatcher = class WorkspaceWatcher extends Disposable {
    static { this.ID = 'workbench.contrib.workspaceWatcher'; }
    constructor(fileService, configurationService, contextService, notificationService, openerService, uriIdentityService, hostService, telemetryService) {
        super();
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.notificationService = notificationService;
        this.openerService = openerService;
        this.uriIdentityService = uriIdentityService;
        this.hostService = hostService;
        this.telemetryService = telemetryService;
        this.watchedWorkspaces = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        this.registerListeners();
        this.refresh();
    }
    registerListeners() {
        this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
        this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
        this._register(this.fileService.onDidWatchError(error => this.onDidWatchError(error)));
    }
    onDidChangeWorkspaceFolders(e) {
        // Removed workspace: Unwatch
        for (const removed of e.removed) {
            this.unwatchWorkspace(removed);
        }
        // Added workspace: Watch
        for (const added of e.added) {
            this.watchWorkspace(added);
        }
    }
    onDidChangeWorkbenchState() {
        this.refresh();
    }
    onDidChangeConfiguration(e) {
        if (e.affectsConfiguration('files.watcherExclude') || e.affectsConfiguration('files.watcherInclude')) {
            this.refresh();
        }
    }
    onDidWatchError(error) {
        const msg = error.toString();
        let reason = undefined;
        // Detect if we run into ENOSPC issues
        if (msg.indexOf('ENOSPC') >= 0) {
            reason = 'ENOSPC';
            this.notificationService.prompt(Severity.Warning, localize('enospcError', "Unable to watch for file changes. Please follow the instructions link to resolve this issue."), [{
                    label: localize('learnMore', "Instructions"),
                    run: () => this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=867693'))
                }], {
                sticky: true,
                neverShowAgain: { id: 'ignoreEnospcError', isSecondary: true, scope: NeverShowAgainScope.WORKSPACE }
            });
        }
        // Detect when the watcher throws an error unexpectedly
        else if (msg.indexOf('EUNKNOWN') >= 0) {
            reason = 'EUNKNOWN';
            this.notificationService.prompt(Severity.Warning, localize('eshutdownError', "File changes watcher stopped unexpectedly. A reload of the window may enable the watcher again unless the workspace cannot be watched for file changes."), [{
                    label: localize('reload', "Reload"),
                    run: () => this.hostService.reload()
                }], {
                sticky: true,
                priority: NotificationPriority.SILENT // reduce potential spam since we don't really know how often this fires
            });
        }
        // Detect unexpected termination
        else if (msg.indexOf('ETERM') >= 0) {
            reason = 'ETERM';
        }
        // Log telemetry if we gathered a reason (logging it from the renderer
        // allows us to investigate this situation in context of experiments)
        if (reason) {
            this.telemetryService.publicLog2('fileWatcherError', { reason });
        }
    }
    watchWorkspace(workspace) {
        // Compute the watcher exclude rules from configuration
        const excludes = [];
        const config = this.configurationService.getValue({ resource: workspace.uri });
        if (config.files?.watcherExclude) {
            for (const key in config.files.watcherExclude) {
                if (key && config.files.watcherExclude[key] === true) {
                    excludes.push(key);
                }
            }
        }
        const pathsToWatch = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
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
    unwatchWorkspace(workspace) {
        if (this.watchedWorkspaces.has(workspace.uri)) {
            dispose(this.watchedWorkspaces.get(workspace.uri));
            this.watchedWorkspaces.delete(workspace.uri);
        }
    }
    refresh() {
        // Unwatch all first
        this.unwatchWorkspaces();
        // Watch each workspace folder
        for (const folder of this.contextService.getWorkspace().folders) {
            this.watchWorkspace(folder);
        }
    }
    unwatchWorkspaces() {
        for (const [, disposable] of this.watchedWorkspaces) {
            disposable.dispose();
        }
        this.watchedWorkspaces.clear();
    }
    dispose() {
        super.dispose();
        this.unwatchWorkspaces();
    }
};
WorkspaceWatcher = __decorate([
    __param(0, IFileService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceContextService),
    __param(3, INotificationService),
    __param(4, IOpenerService),
    __param(5, IUriIdentityService),
    __param(6, IHostService),
    __param(7, ITelemetryService)
], WorkspaceWatcher);
export { WorkspaceWatcher };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlV2F0Y2hlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvd29ya3NwYWNlV2F0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFlLFVBQVUsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxxQkFBcUIsRUFBNkIsTUFBTSw0REFBNEQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsWUFBWSxFQUF1QixNQUFNLDRDQUE0QyxDQUFDO0FBQy9GLE9BQU8sRUFBRSx3QkFBd0IsRUFBa0QsTUFBTSxvREFBb0QsQ0FBQztBQUM5SSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRWhGLElBQU0sZ0JBQWdCLEdBQXRCLE1BQU0sZ0JBQWlCLFNBQVEsVUFBVTthQUUvQixPQUFFLEdBQUcs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