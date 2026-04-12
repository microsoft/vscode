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
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { MarkerList, IMarkerNavigationService } from '../../../../../../editor/contrib/gotoError/browser/markerNavigationService.js';
import { CellUri } from '../../../common/notebookCommon.js';
import { IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { throttle } from '../../../../../../base/common/decorators.js';
import { editorErrorForeground, editorWarningForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { isEqual } from '../../../../../../base/common/resources.js';
let MarkerListProvider = class MarkerListProvider {
    static { this.ID = 'workbench.contrib.markerListProvider'; }
    constructor(_markerService, markerNavigation, _configService) {
        this._markerService = _markerService;
        this._configService = _configService;
        this._dispoables = markerNavigation.registerProvider(this);
    }
    dispose() {
        this._dispoables.dispose();
    }
    getMarkerList(resource) {
        if (!resource) {
            return undefined;
        }
        const data = CellUri.parse(resource);
        if (!data) {
            return undefined;
        }
        return new MarkerList(uri => {
            const otherData = CellUri.parse(uri);
            return otherData?.notebook.toString() === data.notebook.toString();
        }, this._markerService, this._configService);
    }
};
MarkerListProvider = __decorate([
    __param(0, IMarkerService),
    __param(1, IMarkerNavigationService),
    __param(2, IConfigurationService)
], MarkerListProvider);
let NotebookMarkerDecorationContribution = class NotebookMarkerDecorationContribution extends Disposable {
    static { this.id = 'workbench.notebook.markerDecoration'; }
    constructor(_notebookEditor, _markerService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._markerService = _markerService;
        this._markersOverviewRulerDecorations = [];
        this._update();
        this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
        this._register(this._markerService.onMarkerChanged(e => {
            if (e.some(uri => this._notebookEditor.getCellsInRange().some(cell => isEqual(cell.uri, uri)))) {
                this._update();
            }
        }));
    }
    _update() {
        if (!this._notebookEditor.hasModel()) {
            return;
        }
        const cellDecorations = [];
        this._notebookEditor.getCellsInRange().forEach(cell => {
            const marker = this._markerService.read({ resource: cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
            marker.forEach(m => {
                const color = m.severity === MarkerSeverity.Error ? editorErrorForeground : editorWarningForeground;
                const range = { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn };
                cellDecorations.push({
                    handle: cell.handle,
                    options: {
                        overviewRuler: {
                            color: color,
                            modelRanges: [range],
                            includeOutput: false,
                            position: NotebookOverviewRulerLane.Right
                        }
                    }
                });
            });
        });
        this._markersOverviewRulerDecorations = this._notebookEditor.deltaCellDecorations(this._markersOverviewRulerDecorations, cellDecorations);
    }
};
__decorate([
    throttle(100)
], NotebookMarkerDecorationContribution.prototype, "_update", null);
NotebookMarkerDecorationContribution = __decorate([
    __param(1, IMarkerService)
], NotebookMarkerDecorationContribution);
registerWorkbenchContribution2(MarkerListProvider.ID, MarkerListProvider, 2 /* WorkbenchPhase.BlockRestore */);
registerNotebookContribution(NotebookMarkerDecorationContribution.id, NotebookMarkerDecorationContribution);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VyUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvbWFya2VyL21hcmtlclByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBa0IsOEJBQThCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RyxPQUFPLEVBQXVCLFVBQVUsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQzFKLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQTBFLHlCQUF5QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0ksT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVyRSxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFrQjthQUVQLE9BQUUsR0FBRyxzQ0FBc0MsQUFBekMsQ0FBMEM7SUFJNUQsWUFDa0MsY0FBOEIsRUFDckMsZ0JBQTBDLEVBQzVCLGNBQXFDO1FBRjVDLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUV2QixtQkFBYyxH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