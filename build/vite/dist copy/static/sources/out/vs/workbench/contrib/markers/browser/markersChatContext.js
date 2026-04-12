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
import { groupBy } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extUri } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatContextPickService, picksWithPromiseFn } from '../../chat/browser/attachments/chatContextPickService.js';
import { IDiagnosticVariableEntryFilterData } from '../../chat/common/attachments/chatVariableEntries.js';
let MarkerChatContextPick = class MarkerChatContextPick {
    constructor(_markerService, _labelService, _editorService) {
        this._markerService = _markerService;
        this._labelService = _labelService;
        this._editorService = _editorService;
        this.type = 'pickerPick';
        this.label = localize('chatContext.diagnstic', 'Problems...');
        this.icon = Codicon.error;
        this.ordinal = -100;
    }
    isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsProblemAttachments;
    }
    asPicker() {
        return {
            placeholder: localize('chatContext.diagnstic.placeholder', 'Select a problem to attach'),
            picks: picksWithPromiseFn(async (query, token) => {
                return this.getPicksForQuery(query);
            })
        };
    }
    /**
     * @internal For testing purposes only
     */
    getPicksForQuery(query) {
        const markers = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
        const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));
        // Get the active editor URI for prioritization
        const activeEditorUri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor);
        // Sort groups to prioritize active file
        const sortedGroups = grouped.sort((groupA, groupB) => {
            const resourceA = groupA[0].resource;
            const resourceB = groupB[0].resource;
            // If one group is from the active file, prioritize it
            if (activeEditorUri) {
                const isAActiveFile = extUri.isEqual(resourceA, activeEditorUri);
                const isBActiveFile = extUri.isEqual(resourceB, activeEditorUri);
                if (isAActiveFile && !isBActiveFile) {
                    return -1; // A comes first
                }
                if (!isAActiveFile && isBActiveFile) {
                    return 1; // B comes first
                }
            }
            // Otherwise, sort by resource URI as before
            return extUri.compare(resourceA, resourceB);
        });
        const severities = new Set();
        const items = [];
        let pickCount = 0;
        for (const group of sortedGroups) {
            const resource = group[0].resource;
            const isActiveFile = activeEditorUri && extUri.isEqual(resource, activeEditorUri);
            const fileLabel = this._labelService.getUriLabel(resource, { relative: true });
            const separatorLabel = isActiveFile ? `${fileLabel} (current file)` : fileLabel;
            items.push({ type: 'separator', label: separatorLabel });
            for (const marker of group) {
                pickCount++;
                severities.add(marker.severity);
                items.push({
                    label: marker.message,
                    description: localize('markers.panel.at.ln.col.number', "[Ln {0}, Col {1}]", '' + marker.startLineNumber, '' + marker.startColumn),
                    asAttachment() {
                        return IDiagnosticVariableEntryFilterData.toEntry(IDiagnosticVariableEntryFilterData.fromMarker(marker));
                    }
                });
            }
        }
        items.unshift({
            label: localize('markers.panel.allErrors', 'All Problems'),
            asAttachment() {
                return IDiagnosticVariableEntryFilterData.toEntry({
                    filterSeverity: MarkerSeverity.Info
                });
            },
        });
        return items;
    }
};
MarkerChatContextPick = __decorate([
    __param(0, IMarkerService),
    __param(1, ILabelService),
    __param(2, IEditorService)
], MarkerChatContextPick);
let MarkerChatContextContribution = class MarkerChatContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chat.markerChatContextContribution'; }
    constructor(contextPickService, instantiationService) {
        super();
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(MarkerChatContextPick)));
    }
};
MarkerChatContextContribution = __decorate([
    __param(0, IChatContextPickService),
    __param(1, IInstantiationService)
], MarkerChatContextContribution);
export { MarkerChatContextContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc0NoYXRDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Vycy9icm93c2VyL21hcmtlcnNDaGF0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWhHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRW5FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQXNELHVCQUF1QixFQUFzQixrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQy9MLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRzFHLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBTzFCLFlBQ2lCLGNBQStDLEVBQ2hELGFBQTZDLEVBQzVDLGNBQStDO1FBRjlCLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUMvQixrQkFBYSxHQUFiLGFBQWEsQ0FBZTtR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