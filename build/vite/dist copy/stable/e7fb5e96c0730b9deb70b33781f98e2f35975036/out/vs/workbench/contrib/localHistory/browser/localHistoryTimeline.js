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
var LocalHistoryTimeline_1;
import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ITimelineService } from '../../timeline/common/timeline.js';
import { IWorkingCopyHistoryService } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { URI } from '../../../../base/common/uri.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { LocalHistoryFileSystemProvider } from './localHistoryFileSystemProvider.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COMPARE_WITH_FILE_LABEL, toDiffEditorArguments } from './localHistoryCommands.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_ENTRY, LOCAL_HISTORY_MENU_CONTEXT_VALUE } from './localHistory.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getVirtualWorkspaceAuthority } from '../../../../platform/workspace/common/virtualWorkspace.js';
let LocalHistoryTimeline = class LocalHistoryTimeline extends Disposable {
    static { LocalHistoryTimeline_1 = this; }
    static { this.ID = 'workbench.contrib.localHistoryTimeline'; }
    static { this.LOCAL_HISTORY_ENABLED_SETTINGS_KEY = 'workbench.localHistory.enabled'; }
    constructor(timelineService, workingCopyHistoryService, pathService, fileService, environmentService, configurationService, contextService) {
        super();
        this.timelineService = timelineService;
        this.workingCopyHistoryService = workingCopyHistoryService;
        this.pathService = pathService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.id = 'timeline.localHistory';
        this.label = localize('localHistory', "Local History");
        this.scheme = '*'; // we try to show local history for all schemes if possible
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.timelineProviderDisposable = this._register(new MutableDisposable());
        this.registerComponents();
        this.registerListeners();
    }
    registerComponents() {
        // Timeline (if enabled)
        this.updateTimelineRegistration();
        // File Service Provider
        this._register(this.fileService.registerProvider(LocalHistoryFileSystemProvider.SCHEMA, new LocalHistoryFileSystemProvider(this.fileService)));
    }
    updateTimelineRegistration() {
        if (this.configurationService.getValue(LocalHistoryTimeline_1.LOCAL_HISTORY_ENABLED_SETTINGS_KEY)) {
            this.timelineProviderDisposable.value = this.timelineService.registerTimelineProvider(this);
        }
        else {
            this.timelineProviderDisposable.clear();
        }
    }
    registerListeners() {
        // History changes
        this._register(this.workingCopyHistoryService.onDidAddEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
        this._register(this.workingCopyHistoryService.onDidChangeEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
        this._register(this.workingCopyHistoryService.onDidReplaceEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
        this._register(this.workingCopyHistoryService.onDidRemoveEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
        this._register(this.workingCopyHistoryService.onDidRemoveEntries(() => this.onDidChangeWorkingCopyHistoryEntry(undefined /* all entries */)));
        this._register(this.workingCopyHistoryService.onDidMoveEntries(() => this.onDidChangeWorkingCopyHistoryEntry(undefined /* all entries */)));
        // Configuration changes
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(LocalHistoryTimeline_1.LOCAL_HISTORY_ENABLED_SETTINGS_KEY)) {
                this.updateTimelineRegistration();
            }
        }));
    }
    onDidChangeWorkingCopyHistoryEntry(entry) {
        // Re-emit as timeline change event
        this._onDidChange.fire({
            id: this.id,
            uri: entry?.workingCopy.resource,
            reset: true // there is no other way to indicate that items might have been replaced/removed
        });
    }
    async provideTimeline(uri, options, token) {
        const items = [];
        // Try to convert the provided `uri` into a form that is likely
        // for the provider to find entries for so that we can ensure
        // the timeline is always providing local history entries
        let resource = undefined;
        if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
            // `vscode-local-history`: convert back to the associated resource
            resource = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
        }
        else if (uri.scheme === this.pathService.defaultUriScheme || uri.scheme === Schemas.vscodeUserData) {
            // default-scheme / settings: keep as is
            resource = uri;
        }
        else if (this.fileService.hasProvider(uri)) {
            // anything that is backed by a file system provider:
            // try best to convert the URI back into a form that is
            // likely to match the workspace URIs. That means:
            // - change to the default URI scheme
            // - change to the remote authority or virtual workspace authority
            // - preserve the path
            resource = URI.from({
                scheme: this.pathService.defaultUriScheme,
                authority: this.environmentService.remoteAuthority ?? getVirtualWorkspaceAuthority(this.contextService.getWorkspace()),
                path: uri.path
            });
        }
        if (resource) {
            // Retrieve from working copy history
            const entries = await this.workingCopyHistoryService.getEntries(resource, token);
            // Convert to timeline items
            for (const entry of entries) {
                items.push(this.toTimelineItem(entry));
            }
        }
        return {
            source: this.id,
            items
        };
    }
    toTimelineItem(entry) {
        return {
            handle: entry.id,
            label: SaveSourceRegistry.getSourceLabel(entry.source),
            tooltip: new MarkdownString(`$(history) ${getLocalHistoryDateFormatter().format(entry.timestamp)}\n\n${SaveSourceRegistry.getSourceLabel(entry.source)}${entry.sourceDescription ? ` (${entry.sourceDescription})` : ``}`, { supportThemeIcons: true }),
            source: this.id,
            timestamp: entry.timestamp,
            themeIcon: LOCAL_HISTORY_ICON_ENTRY,
            contextValue: LOCAL_HISTORY_MENU_CONTEXT_VALUE,
            command: {
                id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
                title: COMPARE_WITH_FILE_LABEL.value,
                arguments: toDiffEditorArguments(entry, entry.workingCopy.resource)
            }
        };
    }
};
LocalHistoryTimeline = LocalHistoryTimeline_1 = __decorate([
    __param(0, ITimelineService),
    __param(1, IWorkingCopyHistoryService),
    __param(2, IPathService),
    __param(3, IFileService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IConfigurationService),
    __param(6, IWorkspaceContextService)
], LocalHistoryTimeline);
export { LocalHistoryTimeline };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxIaXN0b3J5VGltZWxpbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2NhbEhpc3RvcnkvYnJvd3Nlci9sb2NhbEhpc3RvcnlUaW1lbGluZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFckYsT0FBTyxFQUFFLGdCQUFnQixFQUFrRixNQUFNLG1DQUFtQyxDQUFDO0FBQ3JKLE9BQU8sRUFBNEIsMEJBQTBCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMzRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1B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