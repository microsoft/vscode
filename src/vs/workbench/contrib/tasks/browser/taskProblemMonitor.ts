/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { AbstractProblemCollector } from '../common/problemCollectors.js';
import { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { URI } from '../../../../base/common/uri.js';
import { IMarkerData, MarkerSeverity, IMarker as ITaskMarker } from '../../../../platform/markers/common/markers.js';

interface ITerminalMarkerData {
	readonly resources: Map<string, URI>;
	readonly markers: Map<string, Map<string, IMarkerData>>;
}

export class TaskProblemMonitor extends Disposable {

	private readonly terminalMarkerMap: Map<number, ITerminalMarkerData> = new Map();
	private readonly terminalDisposables: Map<number, DisposableStore> = new Map();

	constructor() {
		super();
	}

	addTerminal(terminal: ITerminalInstance, problemMatcher: AbstractProblemCollector) {
		this.terminalMarkerMap.set(terminal.instanceId, {
			resources: new Map<string, URI>(),
			markers: new Map<string, Map<string, IMarkerData>>()
		});

		const store = new DisposableStore();
		this.terminalDisposables.set(terminal.instanceId, store);

		store.add(terminal.onDisposed(() => {
			this.terminalMarkerMap.delete(terminal.instanceId);
			this.terminalDisposables.get(terminal.instanceId)?.dispose();
			this.terminalDisposables.delete(terminal.instanceId);
		}));

		store.add(problemMatcher.onDidFindErrors((markers: ITaskMarker[]) => {
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
				resources: new Map<string, URI>(),
				markers: new Map<string, Map<string, IMarkerData>>()
			});
		}));
	}

	/**
	 * Gets the task problems for a specific terminal instance
	 * @param instanceId The terminal instance ID
	 * @returns Map of problem matchers to their resources and marker data, or undefined if no problems found
	 */
	public getTaskProblems(instanceId: number): Map<string, { resources: URI[]; markers: IMarkerData[] }> | undefined {
		const markerData = this.terminalMarkerMap.get(instanceId);
		if (!markerData) {
			return undefined;
		} else if (markerData.markers.size === 0) {
			return new Map();
		}

		const result = new Map<string, { resources: URI[]; markers: IMarkerData[] }>();
		for (const [owner, markersMap] of markerData.markers) {
			const resources: URI[] = [];
			const markers: IMarkerData[] = [];
			for (const [resource, marker] of markersMap) {
				resources.push(markerData.resources.get(resource)!);
				markers.push(marker);
			}
			result.set(owner, { resources, markers });
		}
		return result;
	}
}
