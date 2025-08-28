/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IErdosPlotClient } from '../../../services/erdosPlots/common/erdosPlots.js';
import { PlotClientInstance } from '../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

/**
 * The Erdos plots state.
 */
export interface ErdosPlotsState {
	readonly erdosPlotInstances: IErdosPlotClient[];
	selectedInstanceId: string;
	selectedInstanceIndex: number;
}

/**
 * The useErdosPlotsState custom hook.
 * @returns The hook.
 */
export const useErdosPlotsState = (): ErdosPlotsState => {
	// Hooks.
	const services = useErdosReactServicesContext();

	// Initial set of plot instances.
	const [erdosPlotInstances, setErdosPlotInstances] = useState<IErdosPlotClient[]>(
		services.erdosPlotsService.erdosPlotInstances);

	// Initial selected plot instance.
	const initialSelectedId = services.erdosPlotsService.selectedPlotId;
	const [selectedInstanceId, setSelectedInstanceId] = useState<string>(initialSelectedId ?? '');

	// Index of the selected plot instance.
	const initialSelectedIndex = services.erdosPlotsService.erdosPlotInstances.findIndex
		(p => p.id === initialSelectedId);
	const [selectedInstanceIndex, setSelectedInstanceIndex] = useState<number>(initialSelectedIndex);

	// Add event handlers.
	useEffect(() => {
		const disposableStore = new DisposableStore();

		// Listen for new plot instances.
		disposableStore.add(services.erdosPlotsService.onDidEmitPlot(plotInstance => {
			// Add the plot instance to the list of plot instances
			setErdosPlotInstances(erdosPlotInstances => {
				// This can be called multiple times for the same plot instance, so make sure
				// we don't add it twice.
				if (erdosPlotInstances.some(p => p.id === plotInstance.id)) {
					return erdosPlotInstances;
				}
				return [...erdosPlotInstances, plotInstance];
			});

			// When the plot closes, remove it from the list of plot instances.
			// (If the plot is not a plot client instance, then it doesn't have
			// a backend and therefore doesn't need to be removed from the list
			// of active plot instances.)
			if (plotInstance instanceof PlotClientInstance) {
				disposableStore.add(plotInstance.onDidClose(() => {
					setErdosPlotInstances(erdosPlotInstances => erdosPlotInstances.filter(p => p !== plotInstance));
				}));
			}
		}));

		// Listen for plot selection changes.
		disposableStore.add(services.erdosPlotsService.onDidSelectPlot(id => {
			// Set the selected plot instance.
			setSelectedInstanceId(id);

			// Find the index of the selected plot instance.
			const index = services.erdosPlotsService.erdosPlotInstances.findIndex(
				p => p.id === id);
			setSelectedInstanceIndex(index);
		}));

		// Listen for plot removal.
		disposableStore.add(services.erdosPlotsService.onDidRemovePlot(id => {
			setErdosPlotInstances(erdosPlotInstances => erdosPlotInstances.filter(p => p.id !== id));
		}));

		// Listen for replacing all plots.
		disposableStore.add(services.erdosPlotsService.onDidReplacePlots((plots) => {
			setErdosPlotInstances(plots);
		}));

		// Return the clean up for our event handlers.
		return () => disposableStore.dispose();
	}, [services.erdosPlotsService]);

	return { erdosPlotInstances, selectedInstanceId, selectedInstanceIndex };
};
