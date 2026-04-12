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
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { listErrorForeground, listWarningForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
class MarkersDecorationsProvider {
    constructor(_markerService) {
        this._markerService = _markerService;
        this.label = localize('label', "Problems");
        this.onDidChange = _markerService.onMarkerChanged;
    }
    provideDecorations(resource) {
        const markers = this._markerService.read({
            resource,
            severities: MarkerSeverity.Error | MarkerSeverity.Warning
        });
        let first;
        for (const marker of markers) {
            if (!first || marker.severity > first.severity) {
                first = marker;
            }
        }
        if (!first) {
            return undefined;
        }
        return {
            weight: 100 * first.severity,
            bubble: true,
            tooltip: markers.length === 1 ? localize('tooltip.1', "1 problem in this file") : localize('tooltip.N', "{0} problems in this file", markers.length),
            letter: markers.length < 10 ? markers.length.toString() : '9+',
            color: first.severity === MarkerSeverity.Error ? listErrorForeground : listWarningForeground,
        };
    }
}
let MarkersFileDecorations = class MarkersFileDecorations {
    constructor(_markerService, _decorationsService, _configurationService) {
        this._markerService = _markerService;
        this._decorationsService = _decorationsService;
        this._configurationService = _configurationService;
        this._disposables = [
            this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('problems.visibility')) {
                    this._updateEnablement();
                }
            }),
        ];
        this._updateEnablement();
    }
    dispose() {
        dispose(this._provider);
        dispose(this._disposables);
    }
    _updateEnablement() {
        const problem = this._configurationService.getValue('problems.visibility');
        if (problem === undefined) {
            return;
        }
        const value = this._configurationService.getValue('problems');
        const shouldEnable = (problem && value.decorations.enabled);
        if (shouldEnable === this._enabled) {
            if (!problem || !value.decorations.enabled) {
                this._provider?.dispose();
                this._provider = undefined;
            }
            return;
        }
        this._enabled = shouldEnable;
        if (this._enabled) {
            const provider = new MarkersDecorationsProvider(this._markerService);
            this._provider = this._decorationsService.registerDecorationsProvider(provider);
        }
        else if (this._provider) {
            this._provider.dispose();
        }
    }
};
MarkersFileDecorations = __decorate([
    __param(0, IMarkerService),
    __param(1, IDecorationsService),
    __param(2, IConfigurationService)
], MarkersFileDecorations);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    'id': 'problems',
    'order': 101,
    'type': 'object',
    'properties': {
        'problems.decorations.enabled': {
            'markdownDescription': localize('markers.showOnFile', "Show Errors & Warnings on files and folder. Overwritten by {0} when it is off.", '`#problems.visibility#`'),
            'type': 'boolean',
            'default': true
        }
    }
});
// register file decorations
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(MarkersFileDecorations, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc0ZpbGVEZWNvcmF0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzRmlsZURlY29yYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBMkQsVUFBVSxJQUFJLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLGNBQWMsRUFBVyxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsbUJBQW1CLEVBQXlDLE1BQU0scURBQXFELENBQUM7QUFDakksT0FBTyxFQUFlLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUduSixNQUFNLDBCQUEwQjtJQUsvQixZQUNrQixjQUE4QjtRQUE5QixtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFKdkMsVUFBSyxHQUFXLFFBQVEsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFNdEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxjQUFjLENBQUMsZUFBZSxDQUFDO0lBQ25ELENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxRQUFhO1FBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLENB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