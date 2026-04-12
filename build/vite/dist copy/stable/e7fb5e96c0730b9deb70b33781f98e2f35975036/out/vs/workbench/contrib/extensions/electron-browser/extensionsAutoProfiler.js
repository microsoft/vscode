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
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IProfileAnalysisWorkerService } from '../../../../platform/profiling/electron-browser/profileAnalysisWorkerService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput.js';
import { createSlowExtensionAction } from './extensionsSlowActions.js';
import { IExtensionHostProfileService } from './runtimeExtensionsEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionHostProfiler } from '../../../services/extensions/electron-browser/extensionHostProfiler.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
let ExtensionsAutoProfiler = class ExtensionsAutoProfiler {
    constructor(_extensionService, _extensionProfileService, _telemetryService, _logService, _notificationService, _editorService, _instantiationService, _environmentServie, _profileAnalysisService, _configService, _fileService, timerService) {
        this._extensionService = _extensionService;
        this._extensionProfileService = _extensionProfileService;
        this._telemetryService = _telemetryService;
        this._logService = _logService;
        this._notificationService = _notificationService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._environmentServie = _environmentServie;
        this._profileAnalysisService = _profileAnalysisService;
        this._configService = _configService;
        this._fileService = _fileService;
        this._blame = new ExtensionIdentifierSet();
        this._perfBaseline = -1;
        timerService.perfBaseline.then(value => {
            if (value < 0) {
                return; // too slow for profiling
            }
            this._perfBaseline = value;
            this._unresponsiveListener = _extensionService.onDidChangeResponsiveChange(this._onDidChangeResponsiveChange, this);
        });
    }
    dispose() {
        this._unresponsiveListener?.dispose();
        this._session?.dispose(true);
    }
    async _onDidChangeResponsiveChange(event) {
        if (event.extensionHostKind !== 1 /* ExtensionHostKind.LocalProcess */) {
            return;
        }
        const listener = await event.getInspectListener(true);
        if (!listener) {
            return;
        }
        if (event.isResponsive && this._session) {
            // stop profiling when responsive again
            this._session.cancel();
            this._logService.info('UNRESPONSIVE extension host: received responsive event and cancelling profiling session');
        }
        else if (!event.isResponsive && !this._session) {
            // start profiling if not yet profiling
            const cts = new CancellationTokenSource();
            this._session = cts;
            let session;
            try {
                session = await this._instantiationService.createInstance(ExtensionHostProfiler, listener.host, listener.port).start();
            }
            catch (err) {
                this._session = undefined;
                // fail silent as this is often
                // caused by another party being
                // connected already
                return;
            }
            this._logService.info('UNRESPONSIVE extension host: starting to profile NOW');
            // wait 5 seconds or until responsive again
            try {
                await timeout(5e3, cts.token);
            }
            catch {
                // can throw cancellation error. that is
                // OK, we stop profiling and analyse the
                // profile anyways
            }
            try {
                // stop profiling and analyse results
                this._processCpuProfile(await session.stop());
            }
            catch (err) {
                onUnexpectedError(err);
            }
            finally {
                this._session = undefined;
            }
        }
    }
    async _processCpuProfile(profile) {
        // get all extensions
        await this._extensionService.whenInstalledExtensionsRegistered();
        // send heavy samples iff enabled
        if (this._configService.getValue('application.experimental.rendererProfiling')) {
            const searchTree = TernarySearchTree.forUris();
            searchTree.fill(this._extensionService.extensions.map(e => [e.extensionLocation, e]));
            await this._profileAnalysisService.analyseBottomUp(profile.data, url => searchTree.findSubstr(URI.parse(url))?.identifier.value ?? '<<not-found>>', this._perfBaseline, false);
        }
        // analyse profile by extension-category
        const categories = this._extensionService.extensions
            .filter(e => e.extensionLocation.scheme === Schemas.file)
            .map(e => [e.extensionLocation, ExtensionIdentifier.toKey(e.identifier)]);
        const data = await this._profileAnalysisService.analyseByLocation(profile.data, categories);
        //
        let overall = 0;
        let top = '';
        let topAggregated = -1;
        for (const [category, aggregated] of data) {
            overall += aggregated;
            if (aggregated > topAggregated) {
                topAggregated = aggregated;
                top = category;
            }
        }
        const topPercentage = topAggregated / (overall / 100);
        // associate extensions to profile node
        const extension = await this._extensionService.getExtension(top);
        if (!extension) {
            // not an extension => idle, gc, self?
            return;
        }
        const profilingSessionId = generateUuid();
        // print message to log
        const path = joinPath(this._environmentServie.tmpDir, `exthost-${Math.random().toString(16).slice(2, 8)}.cpuprofile`);
        await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(profile.data)));
        this._logService.warn(`UNRESPONSIVE extension host: '${top}' took ${topPercentage}% of ${topAggregated / 1e3}ms, saved PROFILE here: '${path}'`);
        this._telemetryService.publicLog2('exthostunresponsive', {
            profilingSessionId,
            duration: overall,
            data: data.map(tuple => tuple[0]).flat(),
            id: ExtensionIdentifier.toKey(extension.identifier),
        });
        // add to running extensions view
        this._extensionProfileService.setUnresponsiveProfile(extension.identifier, profile);
        // prompt: when really slow/greedy
        if (!(topPercentage >= 95 && topAggregated >= 5e6)) {
            return;
        }
        const action = await this._instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);
        if (!action) {
            // cannot report issues against this extension...
            return;
        }
        // only blame once per extension, don't blame too often
        if (this._blame.has(extension.identifier) || this._blame.size >= 3) {
            return;
        }
        this._blame.add(extension.identifier);
        // user-facing message when very bad...
        this._notificationService.prompt(Severity.Warning, localize('unresponsive-exthost', "The extension '{0}' took a very long time to complete its last operation and it has prevented other extensions from running.", extension.displayName || extension.name), [{
                label: localize('show', 'Show Extensions'),
                run: () => this._editorService.openEditor(RuntimeExtensionsInput.instance, { pinned: true })
            },
            action
        ], { priority: NotificationPriority.SILENT });
    }
};
ExtensionsAutoProfiler = __decorate([
    __param(0, IExtensionService),
    __param(1, IExtensionHostProfileService),
    __param(2, ITelemetryService),
    __param(3, ILogService),
    __param(4, INotificationService),
    __param(5, IEditorService),
    __param(6, IInstantiationService),
    __param(7, INativeWorkbenchEnvironmentService),
    __param(8, IProfileAnalysisWorkerService),
    __param(9, IConfigurationService),
    __param(10, IFileService),
    __param(11, ITimerService)
], ExtensionsAutoProfiler);
export { ExtensionsAutoProfiler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0F1dG9Qcm9maWxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvZWxlY3Ryb24tYnJvd3Nlci9leHRlbnNpb25zQXV0b1Byb2ZpbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQXlCLE1BQU0sc0RBQXNELENBQUM7QUFDMUksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FB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