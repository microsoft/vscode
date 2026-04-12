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
import * as nls from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { TunnelModel } from './tunnelModel.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
export const IRemoteExplorerService = createDecorator('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY = 'remote.explorerType';
export const TUNNEL_VIEW_ID = '~remote.forwardedPorts';
export const TUNNEL_VIEW_CONTAINER_ID = '~remote.forwardedPortsContainer';
export const PORT_AUTO_FORWARD_SETTING = 'remote.autoForwardPorts';
export const PORT_AUTO_SOURCE_SETTING = 'remote.autoForwardPortsSource';
export const PORT_AUTO_FALLBACK_SETTING = 'remote.autoForwardPortsFallback';
export const PORT_AUTO_SOURCE_SETTING_PROCESS = 'process';
export const PORT_AUTO_SOURCE_SETTING_OUTPUT = 'output';
export const PORT_AUTO_SOURCE_SETTING_HYBRID = 'hybrid';
export var TunnelType;
(function (TunnelType) {
    TunnelType["Candidate"] = "Candidate";
    TunnelType["Detected"] = "Detected";
    TunnelType["Forwarded"] = "Forwarded";
    TunnelType["Add"] = "Add";
})(TunnelType || (TunnelType = {}));
export var TunnelEditId;
(function (TunnelEditId) {
    TunnelEditId[TunnelEditId["None"] = 0] = "None";
    TunnelEditId[TunnelEditId["New"] = 1] = "New";
    TunnelEditId[TunnelEditId["Label"] = 2] = "Label";
    TunnelEditId[TunnelEditId["LocalPort"] = 3] = "LocalPort";
})(TunnelEditId || (TunnelEditId = {}));
const getStartedWalkthrough = {
    type: 'object',
    required: ['id'],
    properties: {
        id: {
            description: nls.localize('getStartedWalkthrough.id', 'The ID of a Get Started walkthrough to open.'),
            type: 'string'
        },
    }
};
const remoteHelpExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'remoteHelp',
    jsonSchema: {
        description: nls.localize('RemoteHelpInformationExtPoint', 'Contributes help information for Remote'),
        type: 'object',
        properties: {
            'getStarted': {
                description: nls.localize('RemoteHelpInformationExtPoint.getStarted', "The url, or a command that returns the url, to your project's Getting Started page, or a walkthrough ID contributed by your project's extension"),
                oneOf: [
                    { type: 'string' },
                    getStartedWalkthrough
                ]
            },
            'documentation': {
                description: nls.localize('RemoteHelpInformationExtPoint.documentation', "The url, or a command that returns the url, to your project's documentation page"),
                type: 'string'
            },
            'feedback': {
                description: nls.localize('RemoteHelpInformationExtPoint.feedback', "The url, or a command that returns the url, to your project's feedback reporter"),
                type: 'string',
                markdownDeprecationMessage: nls.localize('RemoteHelpInformationExtPoint.feedback.deprecated', "Use {0} instead", '`reportIssue`')
            },
            'reportIssue': {
                description: nls.localize('RemoteHelpInformationExtPoint.reportIssue', "The url, or a command that returns the url, to your project's issue reporter"),
                type: 'string'
            },
            'issues': {
                description: nls.localize('RemoteHelpInformationExtPoint.issues', "The url, or a command that returns the url, to your project's issues list"),
                type: 'string'
            }
        }
    }
});
export var PortsEnablement;
(function (PortsEnablement) {
    PortsEnablement[PortsEnablement["Disabled"] = 0] = "Disabled";
    PortsEnablement[PortsEnablement["ViewOnly"] = 1] = "ViewOnly";
    PortsEnablement[PortsEnablement["AdditionalFeatures"] = 2] = "AdditionalFeatures";
})(PortsEnablement || (PortsEnablement = {}));
let RemoteExplorerService = class RemoteExplorerService {
    constructor(storageService, tunnelService, instantiationService) {
        this.storageService = storageService;
        this.tunnelService = tunnelService;
        this._targetType = [];
        this._onDidChangeTargetType = new Emitter();
        this.onDidChangeTargetType = this._onDidChangeTargetType.event;
        this._onDidChangeHelpInformation = new Emitter();
        this.onDidChangeHelpInformation = this._onDidChangeHelpInformation.event;
        this._helpInformation = [];
        this._onDidChangeEditable = new Emitter();
        this.onDidChangeEditable = this._onDidChangeEditable.event;
        this._onEnabledPortsFeatures = new Emitter();
        this.onEnabledPortsFeatures = this._onEnabledPortsFeatures.event;
        this._portsFeaturesEnabled = PortsEnablement.Disabled;
        this.namedProcesses = new Map();
        this._tunnelModel = instantiationService.createInstance(TunnelModel);
        remoteHelpExtPoint.setHandler((extensions) => {
            this._helpInformation.push(...extensions);
            this._onDidChangeHelpInformation.fire(extensions);
        });
    }
    get helpInformation() {
        return this._helpInformation;
    }
    set targetType(name) {
        // Can just compare the first element of the array since there are no target overlaps
        const current = this._targetType.length > 0 ? this._targetType[0] : '';
        const newName = name.length > 0 ? name[0] : '';
        if (current !== newName) {
            this._targetType = name;
            this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType.toString(), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            this._onDidChangeTargetType.fire(this._targetType);
        }
    }
    get targetType() {
        return this._targetType;
    }
    get tunnelModel() {
        return this._tunnelModel;
    }
    forward(tunnelProperties, attributes) {
        return this.tunnelModel.forward(tunnelProperties, attributes);
    }
    close(remote, reason) {
        return this.tunnelModel.close(remote.host, remote.port, reason);
    }
    setTunnelInformation(tunnelInformation) {
        if (tunnelInformation?.features) {
            this.tunnelService.setTunnelFeatures(tunnelInformation.features);
        }
        this.tunnelModel.addEnvironmentTunnels(tunnelInformation?.environmentTunnels);
    }
    setEditable(tunnelItem, editId, data) {
        if (!data) {
            this._editable = undefined;
        }
        else {
            this._editable = { tunnelItem, data, editId };
        }
        this._onDidChangeEditable.fire(tunnelItem ? { tunnel: tunnelItem, editId } : undefined);
    }
    getEditableData(tunnelItem, editId) {
        return (this._editable &&
            ((!tunnelItem && (tunnelItem === this._editable.tunnelItem)) ||
                (tunnelItem && (this._editable.tunnelItem?.remotePort === tunnelItem.remotePort) && (this._editable.tunnelItem.remoteHost === tunnelItem.remoteHost)
                    && (this._editable.editId === editId)))) ?
            this._editable.data : undefined;
    }
    setCandidateFilter(filter) {
        if (!filter) {
            return {
                dispose: () => { }
            };
        }
        this.tunnelModel.setCandidateFilter(filter);
        return {
            dispose: () => {
                this.tunnelModel.setCandidateFilter(undefined);
            }
        };
    }
    onFoundNewCandidates(candidates) {
        this.tunnelModel.setCandidates(candidates);
    }
    restore() {
        return this.tunnelModel.restoreForwarded();
    }
    enablePortsFeatures(viewOnly) {
        this._portsFeaturesEnabled = viewOnly ? PortsEnablement.ViewOnly : PortsEnablement.AdditionalFeatures;
        this._onEnabledPortsFeatures.fire();
    }
    get portsFeaturesEnabled() {
        return this._portsFeaturesEnabled;
    }
};
RemoteExplorerService = __decorate([
    __param(0, IStorageService),
    __param(1, ITunnelService),
    __param(2, IInstantiationService)
], RemoteExplorerService);
registerSingleton(IRemoteExplorerService, RemoteExplorerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwSCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsY0FBYyxFQUFnQyxNQUFNLDhDQUE4QyxDQUFDO0FBSzVHLE9BQU8sRUFBZ0QsV0FBVyxFQUFrQyxNQUFNLGtCQUFrQixDQUFDO0FBQzdILE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsTUFBTSwrQ0FBK0MsQ0FBQztBQUl4RyxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxlQUFlLENBQXlCLHVCQUF1QixDQUFDLENBQUM7QUFDdkcsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQVcscUJBQXFCLENBQUM7QUFDdEUsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLHdCQUF3QixDQUFDO0FBQ3ZELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGlDQUFpQyxDQUFDO0FBQzFFLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLHlCQUF5QixDQUFDO0FBQ25FLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLCtCQUErQixDQUFDO0FBQ3hFLE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLGlDQUFpQyxDQUFDO0FBQzVFLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLFNBQVMsQ0FBQztBQUMxRCxNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxRQUFRLENBQUM7QUFDeEQsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsUUFBUSxDQUFDO0FBRXhELE1BQU0sQ0FBTixJQUFZLFVBS1g7QUFMRCxXQUFZLFVBQVU7SUFDckIscUNBQXVCLENBQUE7SUFDdkIsbUNBQXFCLENBQUE7SUFDckIscUNBQXVCLENBQUE7SUFDdkIseUJBQVcsQ0FBQTtBQUNaLENBQUMsRUFMVyxVQUFVLEtBQVYsVUFBVSxRQUtyQjtBQXFCRCxNQUFNLENBQU4sSUFBWSxZQUtYO0FBTEQsV0FBWSxZQUFZO0lBQ3ZCLCtDQUFRLENBQUE7SUFDUiw2Q0FBTyxDQUFBO0lBQ1AsaURBQVMsQ0FBQTtJQUNULHlEQUFhLENBQUE7QUFDZCxDQUFDLEVBTFcsWUFBWSxLQUFaLFlBQVksUUFLdkI7QUFZRCxNQUFNLHFCQUFxQixHQUFnQjtJQUMxQyxJQUFJLEVBQUUsUUFBUTtJQUNkLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQztJQUNoQixVQUFVLEVBQUU7UUFDWCxFQUFFLEVBQUU7WUFDSCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSw4Q0FBOEMsQ0FBQztZQUNyRyxJQUFJLEVBQUUsUUFBUTtTQUNkO0tBQ0Q7Q0FDRCxDQUFDO0FBRUYsTUFBTSxrQkFBa0IsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBa0I7SUFDckYsY0FBYyxFQUFFLFlBQVk7SUFDNUIsVUFBVSxFQUFFO1FBQ1gsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUseUNBQXlDLENBQUM7UUFDckcsSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxZQUFZLEVBQUU7Z0JBQ2IsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMENBQTBDLEVBQUUsaUpBQWlKLENBQUM7Z0JBQ3hOLEtBQUssRUFBRTtvQkFDTixFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7b0JBQ2xCLHFCQUFxQjtpQkFDckI7YUFDRDtZQUNELGVBQWUsRUFBRTtnQkFDaEIsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsNkNBQTZDLEVBQUUsa0ZBQWtGLENBQUM7Z0JBQzVKLElBQUksRUFBRSxRQUFRO2FBQ2Q7WUFDRCxVQUFVLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLEVBQUUsaUZBQWlGLENBQUM7Z0JBQ3RKLElBQUksRUFBRSxRQUFRO2dCQUNkLDBCQUEwQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbURBQW1ELEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxDQUFDO2FBQ2pJO1lBQ0QsYUFBYSxFQUFFO2dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLDhFQUE4RSxDQUFDO2dCQUN0SixJQUFJLEVBQUUsUUFBUTthQUNkO1lBQ0QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDJFQUEyRSxDQUFDO2dCQUM5SSxJQUFJLEVBQUUsUUFBUTthQUNkO1NBQ0Q7S0FDRDtDQUNELENBQUMsQ0FBQztBQUVILE1BQU0sQ0FBTixJQUFZLGVBSVg7QUFKRCxXQUFZLGVBQWU7SUFDMUIsNkRBQVksQ0FBQTtJQUNaLDZEQUFZLENBQUE7SUFDWixpRkFBc0IsQ0FBQTtBQUN2QixDQUFDLEVBSlcsZUFBZSxLQUFmLGVBQWUsUUFJMUI7QUF3QkQsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFpQjFCLFlBQ2tCLGNBQWdELEVBQ2pELGFBQThDLEVBQ3ZDLG9CQUEyQztRQUZoQyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDaEMsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBakJ2RCxnQkFBVyxHQUFhLEVBQUUsQ0FBQztRQUNsQiwyQkFBc0IsR0FBc0IsSUFBSSxPQUFPLEVBQVksQ0FBQztRQUNyRSwwQkFBcUIsR0FBb0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQztRQUMxRSxnQ0FBMkIsR0FBNkQsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN2RywrQkFBMEIsR0FBMkQsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQztRQUNwSSxxQkFBZ0IsR0FBMkMsRUFBRSxDQUFDO1FBR3JELHlCQUFvQixHQUF1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFHLHdCQUFtQixHQUFxRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDO1FBQ3ZILDRCQUF1QixHQUFrQixJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3hELDJCQUFzQixHQUFnQixJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDO1FBQ2pGLDBCQUFxQixHQUFvQixlQUFlLENBQUMsUUFBUSxDQUFDO1FBQzFELG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFPMUQsSUFBSSxDQUFDLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFckUsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUU7WUFDNUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsSUFBSSxlQUFlO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDO0lBQzlCLENBQUM7SUFFRCxJQUFJLFVBQVUsQ0FBQyxJQUFjO1FBQzVCLHFGQUFxRjtRQUNyRixNQUFNLE9BQU8sR0FBVyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUMvRSxNQUFNLE9BQU8sR0FBVyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDdkQsSUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDeEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsZ0VBQWdELENBQUM7WUFDaEksSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsMkRBQTJDLENBQUM7WUFDM0gsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNGLENBQUM7SUFDRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMxQixDQUFDO0lBRUQsT0FBTyxDQUFDLGdCQUFrQyxFQUFFLFVBQThCO1FBQ3pFLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFzQyxFQUFFLE1BQXlCO1FBQ3RFLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxpQkFBZ0Q7UUFDcEUsSUFBSSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDL0UsQ0FBQztJQUVELFdBQVcsQ0FBQyxVQUFtQyxFQUFFLE1BQW9CLEVBQUUsSUFBMEI7UUFDaEcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDNUIsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUMvQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELGVBQWUsQ0FBQyxVQUFtQyxFQUFFLE1BQW9CO1FBQ3hFLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUztZQUNyQixDQUFDLENBQUMsQ0FBQyxVQUFVLElBQUksQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDM0QsQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxVQUFVLEtBQUssVUFBVSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsVUFBVSxLQUFLLFVBQVUsQ0FBQyxVQUFVLENBQUM7dUJBQ2hKLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxNQUFpRTtRQUNuRixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO2dCQUNOLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO2FBQ2xCLENBQUM7UUFDSCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2hELENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVELG9CQUFvQixDQUFDLFVBQTJCO1FBQy9DLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxPQUFPO1FBQ04sT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVELG1CQUFtQixDQUFDLFFBQWlCO1FBQ3BDLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQztRQUN0RyxJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUksb0JBQW9CO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQ25DLENBQUM7Q0FDRCxDQUFBO0FBbkhLLHFCQUFxQjtJQWtCeEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEscUJBQXFCLENBQUE7R0FwQmxCLHFCQUFxQixDQW1IMUI7QUFFRCxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsb0NBQTRCLENBQUMifQ==