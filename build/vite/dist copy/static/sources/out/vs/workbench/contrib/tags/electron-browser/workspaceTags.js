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
var WorkspaceTags_1;
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService, } from '../../../services/textfile/common/textfiles.js';
import { IWorkspaceTagsService, getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from '../common/workspaceTags.js';
import { IDiagnosticsService } from '../../../../platform/diagnostics/common/diagnostics.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { isWindows } from '../../../../base/common/platform.js';
import { AllowedSecondLevelDomains, getDomainsOfRemotes } from '../../../../platform/extensionManagement/common/configRemotes.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { hashAsync } from '../../../../base/common/hash.js';
export async function getHashedRemotesFromConfig(text, stripEndingDotGit = false) {
    return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, hashAsync);
}
let WorkspaceTags = WorkspaceTags_1 = class WorkspaceTags {
    constructor(fileService, contextService, telemetryService, requestService, textFileService, workspaceTagsService, diagnosticsService, productService, nativeHostService) {
        this.fileService = fileService;
        this.contextService = contextService;
        this.telemetryService = telemetryService;
        this.requestService = requestService;
        this.textFileService = textFileService;
        this.workspaceTagsService = workspaceTagsService;
        this.diagnosticsService = diagnosticsService;
        this.productService = productService;
        this.nativeHostService = nativeHostService;
        if (this.telemetryService.telemetryLevel === 3 /* TelemetryLevel.USAGE */) {
            this.report();
        }
    }
    async report() {
        // Windows-only Edition Event
        this.reportWindowsEdition();
        // Workspace Tags
        this.workspaceTagsService.getTags()
            .then(tags => this.reportWorkspaceTags(tags), error => onUnexpectedError(error));
        // Cloud Stats
        this.reportCloudStats();
        this.reportProxyStats();
        this.getWorkspaceInformation().then(stats => this.diagnosticsService.reportWorkspaceStats(stats));
    }
    async reportWindowsEdition() {
        if (!isWindows) {
            return;
        }
        let value = await this.nativeHostService.windowsGetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'EditionID');
        if (value === undefined) {
            value = 'Unknown';
        }
        this.telemetryService.publicLog2('windowsEdition', { edition: value });
    }
    async getWorkspaceInformation() {
        const workspace = this.contextService.getWorkspace();
        const state = this.contextService.getWorkbenchState();
        const telemetryId = await this.workspaceTagsService.getTelemetryWorkspaceId(workspace, state);
        return {
            id: workspace.id,
            telemetryId,
            rendererSessionId: this.telemetryService.sessionId,
            folders: workspace.folders,
            transient: workspace.transient,
            configuration: workspace.configuration
        };
    }
    reportWorkspaceTags(tags) {
        /* __GDPR__
            "workspce.tags" : {
                "owner": "lramos15",
                "${include}": [
                    "${WorkspaceTags}"
                ]
            }
        */
        this.telemetryService.publicLog('workspce.tags', tags);
    }
    reportRemoteDomains(workspaceUris) {
        Promise.all(workspaceUris.map(workspaceUri => {
            const path = workspaceUri.path;
            const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/.git/config` });
            return this.fileService.exists(uri).then(exists => {
                if (!exists) {
                    return [];
                }
                return this.textFileService.read(uri, { acceptTextOnly: true }).then(content => getDomainsOfRemotes(content.value, AllowedSecondLevelDomains), err => [] // ignore missing or binary file
                );
            });
        })).then(domains => {
            const set = domains.reduce((set, list) => list.reduce((set, item) => set.add(item), set), new Set());
            const list = [];
            set.forEach(item => list.push(item));
            /* __GDPR__
                "workspace.remotes" : {
                    "owner": "lramos15",
                    "domains" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                }
            */
            this.telemetryService.publicLog('workspace.remotes', { domains: list.sort() });
        }, onUnexpectedError);
    }
    reportRemotes(workspaceUris) {
        Promise.all(workspaceUris.map(workspaceUri => {
            return this.workspaceTagsService.getHashedRemotesFromUri(workspaceUri, true);
        })).then(() => { }, onUnexpectedError);
    }
    /* __GDPR__FRAGMENT__
        "AzureTags" : {
            "node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
        }
    */
    reportAzureNode(workspaceUris, tags) {
        // TODO: should also work for `node_modules` folders several levels down
        const uris = workspaceUris.map(workspaceUri => {
            const path = workspaceUri.path;
            return workspaceUri.with({ path: `${path !== '/' ? path : ''}/node_modules` });
        });
        return this.fileService.resolveAll(uris.map(resource => ({ resource }))).then(results => {
            const names = [].concat(...results.map(result => result.success ? (result.stat.children || []) : [])).map(c => c.name);
            const referencesAzure = WorkspaceTags_1.searchArray(names, /azure/i);
            if (referencesAzure) {
                tags['node'] = true;
            }
            return tags;
        }, err => {
            return tags;
        });
    }
    static searchArray(arr, regEx) {
        return arr.some(v => v.search(regEx) > -1) || undefined;
    }
    /* __GDPR__FRAGMENT__
        "AzureTags" : {
            "java" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
        }
    */
    reportAzureJava(workspaceUris, tags) {
        return Promise.all(workspaceUris.map(workspaceUri => {
            const path = workspaceUri.path;
            const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/pom.xml` });
            return this.fileService.exists(uri).then(exists => {
                if (!exists) {
                    return false;
                }
                return this.textFileService.read(uri, { acceptTextOnly: true }).then(content => !!content.value.match(/azure/i), err => false);
            });
        })).then(javas => {
            if (javas.indexOf(true) !== -1) {
                tags['java'] = true;
            }
            return tags;
        });
    }
    reportAzure(uris) {
        const tags = Object.create(null);
        this.reportAzureNode(uris, tags).then((tags) => {
            return this.reportAzureJava(uris, tags);
        }).then((tags) => {
            if (Object.keys(tags).length) {
                /* __GDPR__
                    "workspace.azure" : {
                        "owner": "lramos15",
                        "${include}": [
                            "${AzureTags}"
                        ]
                    }
                */
                this.telemetryService.publicLog('workspace.azure', tags);
            }
        }).then(undefined, onUnexpectedError);
    }
    reportCloudStats() {
        const uris = this.contextService.getWorkspace().folders.map(folder => folder.uri);
        if (uris.length && this.fileService) {
            this.reportRemoteDomains(uris);
            this.reportRemotes(uris);
            this.reportAzure(uris);
        }
    }
    reportProxyStats() {
        const downloadUrl = this.productService.downloadUrl;
        if (!downloadUrl) {
            return;
        }
        this.requestService.resolveProxy(downloadUrl)
            .then(proxy => {
            let type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : 'EMPTY';
            if (['DIRECT', 'PROXY', 'HTTPS', 'SOCKS', 'EMPTY'].indexOf(type) === -1) {
                type = 'UNKNOWN';
            }
        }).then(undefined, onUnexpectedError);
    }
};
WorkspaceTags = WorkspaceTags_1 = __decorate([
    __param(0, IFileService),
    __param(1, IWorkspaceContextService),
    __param(2, ITelemetryService),
    __param(3, IRequestService),
    __param(4, ITextFileService),
    __param(5, IWorkspaceTagsService),
    __param(6, IDiagnosticsService),
    __param(7, IProductService),
    __param(8, INativeHostService)
], WorkspaceTags);
export { WorkspaceTags };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVGFncy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3RhZ3MvZWxlY3Ryb24tYnJvd3Nlci93b3Jrc3BhY2VUYWdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsWUFBWSxFQUFhLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLGlCQUFpQixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTlGLE9BQU8sRUFBRSxnQkFBZ0IsR0FBRyxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBUSwwQkFBMEIsSUFBSSw4QkFBOEIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSx3REFBd0QsQ0FBQztBQUNwSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFNUQsTUFBTSxDQUFDLEtBQUssVUFBVSwwQkFBMEIsQ0FBQyxJQUFZLEVBQUUsb0JBQTZCLEtBQUs7SUFDaEcsT0FBTyw4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