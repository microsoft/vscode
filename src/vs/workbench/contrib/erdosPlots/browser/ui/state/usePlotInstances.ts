/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IErdosPlotClient } from '../../../common/erdosPlotsService.js';
import { PlotClientInstance } from '../../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { services } from '../../../../../../base/browser/erdosReactServices.js';

/**
 * State structure for plot instances and selection.
 */
export interface PlotInstancesState {
	readonly allPlots: IErdosPlotClient[];
	selectedInstanceId: string;
	selectedInstanceIndex: number;
}

/**
 * Hook managing plot instance state synchronized with the service layer.
 */
export const usePlotInstances = (): PlotInstancesState => {	const [instanceCollection, updateInstanceCollection] = useState<IErdosPlotClient[]>(
		services.erdosPlotsService.allPlots);

	const initialActiveId = services.erdosPlotsService.activePlotId;
	const [activeInstanceId, updateActiveInstanceId] = useState<string>(initialActiveId ?? '');

	const initialActivePosition = services.erdosPlotsService.allPlots.findIndex
		((client: IErdosPlotClient) => client.id === initialActiveId);
	const [activeInstancePosition, updateActiveInstancePosition] = useState<number>(initialActivePosition);

	useEffect(() => {
		const cleanupHandlers = new DisposableStore();

		cleanupHandlers.add(services.erdosPlotsService.onPlotCreated((emittedInstance: IErdosPlotClient) => {
			updateInstanceCollection(currentCollection => {
				if (currentCollection.some((client: IErdosPlotClient) => client.id === emittedInstance.id)) {
					return currentCollection;
				}
				return [...currentCollection, emittedInstance];
			});

			if (emittedInstance instanceof PlotClientInstance) {
				cleanupHandlers.add(emittedInstance.onDidClose(() => {
					updateInstanceCollection(currentCollection => currentCollection.filter((c: IErdosPlotClient) => c !== emittedInstance));
				}));
			}
		}));

		cleanupHandlers.add(services.erdosPlotsService.onPlotActivated((identifier: string) => {
			updateActiveInstanceId(identifier);

			const position = services.erdosPlotsService.allPlots.findIndex(
				(client: IErdosPlotClient) => client.id === identifier);
			updateActiveInstancePosition(position);
		}));

		cleanupHandlers.add(services.erdosPlotsService.onPlotDeleted((identifier: string) => {
			updateInstanceCollection(currentCollection => currentCollection.filter((client: IErdosPlotClient) => client.id !== identifier));
		}));

		cleanupHandlers.add(services.erdosPlotsService.onPlotsReplaced((instances: IErdosPlotClient[]) => {
			updateInstanceCollection(instances);
		}));

		cleanupHandlers.add(services.erdosPlotsService.onPlotMetadataChanged((modifiedInstance: IErdosPlotClient) => {
			updateInstanceCollection(currentCollection =>
				currentCollection.map(instance =>
					instance.id === modifiedInstance.id ? modifiedInstance : instance
				)
			);
		}));

		return () => cleanupHandlers.dispose();
	}, [services.erdosPlotsService]);

	return { allPlots: instanceCollection, selectedInstanceId: activeInstanceId, selectedInstanceIndex: activeInstancePosition };
};

