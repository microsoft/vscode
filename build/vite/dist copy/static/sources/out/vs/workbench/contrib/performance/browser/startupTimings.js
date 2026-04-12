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
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ILifecycleService, StartupKindToString } from '../../../services/lifecycle/common/lifecycle.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import * as files from '../../files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { posix } from '../../../../base/common/path.js';
import { hash } from '../../../../base/common/hash.js';
let StartupTimings = class StartupTimings {
    constructor(_editorService, _paneCompositeService, _lifecycleService, _updateService, _workspaceTrustService) {
        this._editorService = _editorService;
        this._paneCompositeService = _paneCompositeService;
        this._lifecycleService = _lifecycleService;
        this._updateService = _updateService;
        this._workspaceTrustService = _workspaceTrustService;
    }
    async _isStandardStartup() {
        // check for standard startup:
        // * new window (no reload)
        // * workspace is trusted
        // * just one window
        // * explorer viewlet visible
        // * one text editor (not multiple, not webview, welcome etc...)
        // * cached data present (not rejected, not created)
        if (this._lifecycleService.startupKind !== 1 /* StartupKind.NewWindow */) {
            return StartupKindToString(this._lifecycleService.startupKind);
        }
        if (!this._workspaceTrustService.isWorkspaceTrusted()) {
            return 'Workspace not trusted';
        }
        const activeViewlet = this._paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (!activeViewlet || activeViewlet.getId() !== files.VIEWLET_ID) {
            return 'Explorer viewlet not visible';
        }
        const visibleEditorPanes = this._editorService.visibleEditorPanes;
        if (visibleEditorPanes.length !== 1) {
            return `Expected text editor count : 1, Actual : ${visibleEditorPanes.length}`;
        }
        if (!isCodeEditor(visibleEditorPanes[0].getControl())) {
            return 'Active editor is not a text editor';
        }
        const activePanel = this._paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */);
        if (activePanel) {
            return `Current active panel : ${this._paneCompositeService.getPaneComposite(activePanel.getId(), 1 /* ViewContainerLocation.Panel */)?.name}`;
        }
        const isLatestVersion = await this._updateService.isLatestVersion();
        if (isLatestVersion === false) {
            return 'Not on latest version, updates available';
        }
        return undefined;
    }
};
StartupTimings = __decorate([
    __param(0, IEditorService),
    __param(1, IPaneCompositePartService),
    __param(2, ILifecycleService),
    __param(3, IUpdateService),
    __param(4, IWorkspaceTrustManagementService)
], StartupTimings);
export { StartupTimings };
let BrowserStartupTimings = class BrowserStartupTimings extends StartupTimings {
    constructor(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService, timerService, logService, environmentService, telemetryService, productService) {
        super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);
        this.timerService = timerService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.telemetryService = telemetryService;
        this.productService = productService;
        this.logPerfMarks();
    }
    async logPerfMarks() {
        if (!this.environmentService.profDurationMarkers) {
            return;
        }
        await this.timerService.whenReady();
        const standardStartupError = await this._isStandardStartup();
        const perfBaseline = await this.timerService.perfBaseline;
        const [from, to] = this.environmentService.profDurationMarkers;
        const content = `${this.timerService.getDuration(from, to)}\t${this.productService.nameShort}\t${(this.productService.commit || '').slice(0, 10) || '0000000000'}\t${this.telemetryService.sessionId}\t${standardStartupError === undefined ? 'standard_start' : 'NO_standard_start : ' + standardStartupError}\t${String(perfBaseline).padStart(4, '0')}ms\n`;
        this.logService.info(`[prof-timers] ${content}`);
    }
};
BrowserStartupTimings = __decorate([
    __param(0, IEditorService),
    __param(1, IPaneCompositePartService),
    __param(2, ILifecycleService),
    __param(3, IUpdateService),
    __param(4, IWorkspaceTrustManagementService),
    __param(5, ITimerService),
    __param(6, ILogService),
    __param(7, IBrowserWorkbenchEnvironmentService),
    __param(8, ITelemetryService),
    __param(9, IProductService)
], BrowserStartupTimings);
export { BrowserStartupTimings };
let BrowserResourcePerformanceMarks = class BrowserResourcePerformanceMarks {
    constructor(telemetryService) {
        for (const item of performance.getEntriesByType('resource')) {
            try {
                const url = new URL(item.name);
                const name = posix.basename(url.pathname);
                telemetryService.publicLog2('startup.resource.perf', {
                    hosthash: `H${hash(url.host).toString(16)}`,
                    name,
                    duration: item.duration
                });
            }
            catch {
                // ignore
            }
        }
    }
};
BrowserResourcePerformanceMarks = __decorate([
    __param(0, ITelemetryService)
], BrowserResourcePerformanceMarks);
export { BrowserResourcePerformanceMarks };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhcnR1cFRpbWluZ3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wZXJmb3JtYW5jZS9icm93c2VyL3N0YXJ0dXBUaW1pbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQWUsbUJBQW1CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxLQUFLLEtBQUssTUFBTSw2QkFBNkIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFckcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNsSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFaEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVoRCxJQUFlLGNBQWMsR0FBN0IsTUFBZSxjQUFjO0lBRW5DLFlBQ2tDLGNBQThCLEVBQ25CLHFCQUFnRCxFQUN4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