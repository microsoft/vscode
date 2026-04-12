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
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { IExtensionService } from '../common/extensions.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IV8InspectProfilingService } from '../../../../platform/profiling/common/profiling.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
let ExtensionHostProfiler = class ExtensionHostProfiler {
    constructor(_host, _port, _extensionService, _profilingService) {
        this._host = _host;
        this._port = _port;
        this._extensionService = _extensionService;
        this._profilingService = _profilingService;
    }
    async start() {
        const id = await this._profilingService.startProfiling({ host: this._host, port: this._port });
        return {
            stop: createSingleCallFunction(async () => {
                const profile = await this._profilingService.stopProfiling(id);
                await this._extensionService.whenInstalledExtensionsRegistered();
                const extensions = this._extensionService.extensions;
                return this._distill(profile, extensions);
            })
        };
    }
    _distill(profile, extensions) {
        const searchTree = TernarySearchTree.forUris();
        for (const extension of extensions) {
            if (extension.extensionLocation.scheme === Schemas.file) {
                searchTree.set(URI.file(extension.extensionLocation.fsPath), extension);
            }
        }
        const nodes = profile.nodes;
        const idsToNodes = new Map();
        const idsToSegmentId = new Map();
        for (const node of nodes) {
            idsToNodes.set(node.id, node);
        }
        function visit(node, segmentId) {
            if (!segmentId) {
                switch (node.callFrame.functionName) {
                    case '(root)':
                        break;
                    case '(program)':
                        segmentId = 'program';
                        break;
                    case '(garbage collector)':
                        segmentId = 'gc';
                        break;
                    default:
                        segmentId = 'self';
                        break;
                }
            }
            else if (segmentId === 'self' && node.callFrame.url) {
                let extension;
                try {
                    extension = searchTree.findSubstr(URI.parse(node.callFrame.url));
                }
                catch {
                    // ignore
                }
                if (extension) {
                    segmentId = extension.identifier.value;
                }
            }
            idsToSegmentId.set(node.id, segmentId);
            if (node.children) {
                for (const child of node.children) {
                    const childNode = idsToNodes.get(child);
                    if (childNode) {
                        visit(childNode, segmentId);
                    }
                }
            }
        }
        visit(nodes[0], null);
        const samples = profile.samples || [];
        const timeDeltas = profile.timeDeltas || [];
        const distilledDeltas = [];
        const distilledIds = [];
        let currSegmentTime = 0;
        let currSegmentId;
        for (let i = 0; i < samples.length; i++) {
            const id = samples[i];
            const segmentId = idsToSegmentId.get(id);
            if (segmentId !== currSegmentId) {
                if (currSegmentId) {
                    distilledIds.push(currSegmentId);
                    distilledDeltas.push(currSegmentTime);
                }
                currSegmentId = segmentId ?? undefined;
                currSegmentTime = 0;
            }
            currSegmentTime += timeDeltas[i];
        }
        if (currSegmentId) {
            distilledIds.push(currSegmentId);
            distilledDeltas.push(currSegmentTime);
        }
        return {
            startTime: profile.startTime,
            endTime: profile.endTime,
            deltas: distilledDeltas,
            ids: distilledIds,
            data: profile,
            getAggregatedTimes: () => {
                const segmentsToTime = new Map();
                for (let i = 0; i < distilledIds.length; i++) {
                    const id = distilledIds[i];
                    segmentsToTime.set(id, (segmentsToTime.get(id) || 0) + distilledDeltas[i]);
                }
                return segmentsToTime;
            }
        };
    }
};
ExtensionHostProfiler = __decorate([
    __param(2, IExtensionService),
    __param(3, IV8InspectProfilingService)
], ExtensionHostProfiler);
export { ExtensionHostProfiler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdFByb2ZpbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvZWxlY3Ryb24tYnJvd3Nlci9leHRlbnNpb25Ib3N0UHJvZmlsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDakYsT0FBTyxFQUF5QixpQkFBaUIsRUFBb0MsTUFBTSx5QkFBeUIsQ0FBQztBQUVySCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSwwQkFBMEIsRUFBOEIsTUFBTSxvREFBb0QsQ0FBQztBQUM1SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUxRSxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFxQjtJQUVqQyxZQUNrQixLQUFhLEVBQ2IsS0FBYSxFQUNNLGlCQUFvQyxFQUMzQixpQkFBNkM7UUFIekUsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUNiLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDTSxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBQzNCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBNEI7SUFFM0YsQ0FBQztJQUVNLEtBQUssQ0FBQyxLQUFLO1FBRWpCLE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUUvRixPQUFPO1lBQ04sSUFBSSxFQUFFLHdC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