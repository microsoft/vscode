/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
export class TaskProblemMonitor extends Disposable {
    constructor() {
        super();
        this.terminalMarkerMap = new Map();
        this.terminalDisposables = new DisposableMap();
    }
    addTerminal(terminal, problemMatcher) {
        this.terminalMarkerMap.set(terminal.instanceId, {
            resources: new Map(),
            markers: new Map()
        });
        const store = new DisposableStore();
        this.terminalDisposables.set(terminal.instanceId, store);
        store.add(terminal.onDisposed(() => {
            this.terminalMarkerMap.delete(terminal.instanceId);
            this.terminalDisposables.deleteAndDispose(terminal.instanceId);
        }));
        store.add(problemMatcher.onDidFindErrors((markers) => {
            const markerData = this.terminalMarkerMap.get(terminal.instanceId);
            if (markerData) {
                // Clear existing markers for a new set, otherwise older compilation
                // issues will be included
                markerData.markers.clear();
                markerData.resources.clear();
                for (const marker of markers) {
                    if (marker.severity === MarkerSeverity.Error) {
                        markerData.resources.set(marker.resource.toString(), marker.resource);
                        const markersForOwner = markerData.markers.get(marker.owner);
                        let markerMap = markersForOwner;
                        if (!markerMap) {
                            markerMap = new Map();
                            markerData.markers.set(marker.owner, markerMap);
                        }
                        markerMap.set(marker.resource.toString(), marker);
                        this.terminalMarkerMap.set(terminal.instanceId, markerData);
                    }
                }
            }
        }));
        store.add(problemMatcher.onDidRequestInvalidateLastMarker(() => {
            const markerData = this.terminalMarkerMap.get(terminal.instanceId);
            markerData?.markers.clear();
            markerData?.resources.clear();
            this.terminalMarkerMap.set(terminal.instanceId, {
                resources: new Map(),
                markers: new Map()
            });
        }));
    }
    /**
     * Gets the task problems for a specific terminal instance
     * @param instanceId The terminal instance ID
     * @returns Map of problem matchers to their resources and marker data, or undefined if no problems found
     */
    getTaskProblems(instanceId) {
        const markerData = this.terminalMarkerMap.get(instanceId);
        if (!markerData) {
            return undefined;
        }
        else if (markerData.markers.size === 0) {
            return new Map();
        }
        const result = new Map();
        for (const [owner, markersMap] of markerData.markers) {
            const resources = [];
            const markers = [];
            for (const [resource, marker] of markersMap) {
                resources.push(markerData.resources.get(resource));
                markers.push(marker);
            }
            result.set(owner, { resources, markers });
        }
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1Byb2JsZW1Nb25pdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGFza3MvYnJvd3Nlci90YXNrUHJvYmxlbU1vbml0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJbEcsT0FBTyxFQUFlLGNBQWMsRUFBMEIsTUFBTSxnREFBZ0QsQ0FBQztBQU9ySCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsVUFBVTtJQUtqRDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBSlEsc0JBQWlCLEdBQXFDLElBQUksR0FBRyxFQUFFLENBQUM7UUFDaEUsd0JBQW1CLEdBQUcsSUFBSSxhQUFhLEVBQVUsQ0FBQztJQUluRSxDQUFDO0lBRUQsV0FBVyxDQUFDLFFBQTJCLEVBQUUsY0FBd0M7UUFDaEYsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO1lBQy9DLFNBQVMsRUFBRSxJQUFJLEdBQUcsRUFBZTtZQUNqQyxPQUFPLEVBQUUsSUFBSSxHQUFHLEVBQW9DO1NBQ3BELENBQUMsQ0FBQztRQUVILE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXpELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDbEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFD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