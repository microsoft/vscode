/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosPlots.css';

// React.
import React, { PropsWithChildren, useCallback, useEffect, useState } from 'react';

// Other dependencies.
import { ErdosPlotsContextProvider } from './erdosPlotsContext.js';
import { HistoryPolicy, isZoomablePlotClient, ZoomLevel } from '../../../services/erdosPlots/common/erdosPlots.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { PlotsContainer } from './components/plotsContainer.js';
import { ActionBars } from './components/actionBars.js';
import { ErdosPlotsViewPane } from './erdosPlotsView.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

/**
 * ErdosPlotsProps interface.
 */
export interface ErdosPlotsProps {
	readonly reactComponentContainer: ErdosPlotsViewPane;
}

/**
 * ErdosPlots component.
 * @param props A ErdosPlotsProps that contains the component properties.
 * @returns The rendered component.
 */
export const ErdosPlots = (props: PropsWithChildren<ErdosPlotsProps>) => {
	// Context hooks.
	const services = useErdosReactServicesContext();

	// Compute the history visibility based on the history policy.
	const computeHistoryVisibility = useCallback((policy: HistoryPolicy) => {
		switch (policy) {
			case HistoryPolicy.AlwaysVisible:
				return true;
			case HistoryPolicy.NeverVisible:
				return false;
			case HistoryPolicy.Automatic:
				// Don't show the history if there aren't at least two plots.
				if (services.erdosPlotsService.erdosPlotInstances.length < 2) {
					return false;
				}

				// Don't show the history if the container is too small.
				if (props.reactComponentContainer.width < 300 ||
					props.reactComponentContainer.height < 300) {
					return false;
				}

				// Show the history.
				return true;
		}
	}, [services.erdosPlotsService.erdosPlotInstances.length, props.reactComponentContainer.height, props.reactComponentContainer.width]);

	const zoomHandler = (zoom: number) => {
		const currentPlotId = services.erdosPlotsService.selectedPlotId;
		if (!currentPlotId) {
			return;
		}

		const plot = services.erdosPlotsService.erdosPlotInstances.find(plot => plot.id === currentPlotId);
		if (isZoomablePlotClient(plot)) {
			// Update the zoom level in the plot metadata.
			plot.zoomLevel = zoom;
		}
	};

	// Hooks.
	const [width, setWidth] = useState(props.reactComponentContainer.width);
	const [height, setHeight] = useState(props.reactComponentContainer.height);
	const [posX, setPosX] = useState(0);
	const [posY, setPosY] = useState(0);
	const [visible, setVisible] = useState(props.reactComponentContainer.containerVisible);
	const [showHistory, setShowHistory] = useState(computeHistoryVisibility(services.erdosPlotsService.historyPolicy));
	const [darkFilterMode, setDarkFilterMode] = useState(services.erdosPlotsService.darkFilterMode);
	const [zoom, setZoom] = useState(ZoomLevel.Fit);

	// Add IReactComponentContainer event handlers.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the onSizeChanged event handler.
		disposableStore.add(props.reactComponentContainer.onSizeChanged(size => {
			setWidth(size.width);
			setHeight(size.height);
			setShowHistory(computeHistoryVisibility(services.erdosPlotsService.historyPolicy));
		}));

		// Add the onSizeChanged event handler.
		disposableStore.add(props.reactComponentContainer.onPositionChanged(pos => {
			setPosX(pos.x);
			setPosY(pos.y);
		}));

		// Add the onVisibilityChanged event handler.
		disposableStore.add(props.reactComponentContainer.onVisibilityChanged(visible => {
			setVisible(visible);
		}));

		// Add event handlers so we can show/hide the history portion of the panel as the set
		// of plots changes.
		disposableStore.add(services.erdosPlotsService.onDidEmitPlot(() => {
			setShowHistory(computeHistoryVisibility(services.erdosPlotsService.historyPolicy));
		}));
		disposableStore.add(services.erdosPlotsService.onDidRemovePlot(() => {
			setShowHistory(computeHistoryVisibility(services.erdosPlotsService.historyPolicy));
		}));
		disposableStore.add(services.erdosPlotsService.onDidReplacePlots(() => {
			setShowHistory(computeHistoryVisibility(services.erdosPlotsService.historyPolicy));
		}));

		// Add the event handler for history policy changes.
		disposableStore.add(services.erdosPlotsService.onDidChangeHistoryPolicy(policy => {
			setShowHistory(computeHistoryVisibility(policy));
		}));

		// Add the event handler for dark filter mode changes.
		disposableStore.add(services.erdosPlotsService.onDidChangeDarkFilterMode(mode => {
			setDarkFilterMode(mode);
		}));

		// Return the cleanup function that will dispose of the event handlers.
		return () => disposableStore.dispose();
	}, [computeHistoryVisibility, services.erdosPlotsService, props.reactComponentContainer]);

	useEffect(() => {
		// Set the initial zoom level for the current plot.
		const disposableStore = new DisposableStore();

		disposableStore.add(services.erdosPlotsService.onDidSelectPlot(plotId => {
			const currentPlot = services.erdosPlotsService.selectedPlotId;

			if (currentPlot) {
				const plot = services.erdosPlotsService.erdosPlotInstances.find(plot => plot.id === currentPlot);
				if (isZoomablePlotClient(plot)) {
					disposableStore.add(plot.onDidChangeZoomLevel((zoomLevel) => {
						setZoom(zoomLevel);
					}));
					setZoom(plot.zoomLevel);
				} else {
					setZoom(ZoomLevel.Fit);
				}
			}
		}));

		return () => {
			// Dispose of the disposable store to clean up event handlers.
			disposableStore.dispose();
		}
	}, [services.erdosPlotsService]);

	// Render.
	return (
		<ErdosPlotsContextProvider {...props}>
			<ActionBars
				{...props}
				key={services.erdosPlotsService.selectedPlotId}
				zoomHandler={zoomHandler}
				zoomLevel={zoom}
			/>
			<PlotsContainer
				darkFilterMode={darkFilterMode}
				height={height > 0 ? height - 34 : 0}
				showHistory={showHistory}
				visible={visible}
				width={width}
				x={posX}
				y={posY}
			/>
		</ErdosPlotsContextProvider>
	);

};
