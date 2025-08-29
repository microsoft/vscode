/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './plotsContainer.css';

// React.
import React, { useEffect, useRef } from 'react';

// Other dependencies.
import * as DOM from '../../../../../base/browser/dom.js';
import { DynamicPlotInstance } from './dynamicPlotInstance.js';
import { DynamicPlotThumbnail } from './dynamicPlotThumbnail.js';
import { PlotGalleryThumbnail } from './plotGalleryThumbnail.js';
import { StaticPlotInstance } from './staticPlotInstance.js';
import { StaticPlotThumbnail } from './staticPlotThumbnail.js';
import { WebviewPlotInstance } from './webviewPlotInstance.js';
import { WebviewPlotThumbnail } from './webviewPlotThumbnail.js';
import { useErdosPlotsContext } from '../erdosPlotsContext.js';
import { WebviewPlotClient } from '../webviewPlotClient.js';
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { DarkFilter, IErdosPlotClient, isZoomablePlotClient, PlotRenderFormat, ZoomLevel } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';
import { PlotSizingPolicyIntrinsic } from '../../../../services/erdosPlots/common/sizingPolicyIntrinsic.js';
import { PlotSizingPolicyAuto } from '../../../../services/erdosPlots/common/sizingPolicyAuto.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * PlotContainerProps interface.
 */
interface PlotContainerProps {
	width: number;
	height: number;
	x: number;
	y: number;
	visible: boolean;
	showHistory: boolean;
	darkFilterMode: DarkFilter;
}

/**
 * The number of pixels (height or width) to use for the history portion of the
 * plots container.
 */
export const HistoryPx = 100;

/**
 * PlotContainer component; holds the plot instances.
 *
 * @param props A PlotContainerProps that contains the component properties.
 * @returns The rendered component.
 */
export const PlotsContainer = (props: PlotContainerProps) => {
	const services = useErdosReactServicesContext();
	const erdosPlotsContext = useErdosPlotsContext();
	const plotHistoryRef = React.createRef<HTMLDivElement>();
	const containerRef = useRef<HTMLDivElement>(undefined!);
	const [zoom, setZoom] = React.useState<ZoomLevel>(ZoomLevel.Fit);

	// We generally prefer showing the plot history on the bottom (making the
	// plot wider), but if the plot container is too wide, we show it on the
	// right instead.
	const historyBottom = props.height / props.width > 0.75;

	const historyPx = props.showHistory ? HistoryPx : 0;
	const historyEdge = historyBottom ? 'history-bottom' : 'history-right';
	const plotHeight = historyBottom && props.height > 0 ? props.height - historyPx : props.height;
	const plotWidth = historyBottom || props.width <= 0 ? props.width : props.width - historyPx;

	// Plot history useEffect to handle scrolling, mouse wheel events, and keyboard navigation.
	useEffect(() => {
		// Get the current plot history and container. If the plot history is not rendered,
		// return.
		const plotHistory = plotHistoryRef.current;
		const container = containerRef.current;
		if (!plotHistory || !container) {
			return;
		}

		// Ensure that the selected plot or the most recently generated plot is
		// is visible in the plot history.
		const selectedPlot = plotHistory.querySelector('.selected');
		if (selectedPlot) {
			// If there is a selected plot, scroll it into view.
			selectedPlot.scrollIntoView({ behavior: 'smooth' });
		} else {
			// If there isn't a selected plot, scroll the history to the end to
			// show the most recently generated plot.
			plotHistory.scrollLeft = plotHistory.scrollWidth;
			plotHistory.scrollTop = plotHistory.scrollHeight;
		}

		// The keyboard event listener for the plot container.
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
				e.preventDefault();
				services.erdosPlotsService.selectPreviousPlot();
			} else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
				e.preventDefault();
				services.erdosPlotsService.selectNextPlot();
			}
		};

		// If the plot history is not at the bottom, there is no need to handle
		// horizontal scrolling with the mouse wheel.
		if (!historyBottom) {
			// Add keyboard event listener to the container
			container.addEventListener('keydown', onKeyDown);

			return () => {
				container.removeEventListener('keydown', onKeyDown);
			};
		}

		// The wheel event listener for the plot history. This allows the user to
		// scroll the plot history horizontally using the mouse wheel. We prevent
		// the default behavior to avoid scrolling the entire page when the user
		// scrolls deltaY over the plot history.
		const onWheel = (e: WheelEvent) => {
			// Convert deltaY into deltaX for horizontal scrolling.
			if (e.deltaY !== 0) {
				e.preventDefault();
				plotHistory.scrollLeft += e.deltaY;
			}
		};

		// Add the wheel event listener to the plot history. (The passive: false
		// option indicates that we might call preventDefault() inside our event
		// handler.)
		plotHistory.addEventListener('wheel', onWheel, { passive: false });

		// Add keyboard event listener to the container
		container.addEventListener('keydown', onKeyDown);

		// Cleanup function to remove the wheel and keyboard event listeners when the component
		// unmounts.
		return () => {
			plotHistory.removeEventListener('wheel', onWheel);
			container.removeEventListener('keydown', onKeyDown);
		};
	}, [historyBottom, containerRef, plotHistoryRef, services.erdosPlotsService]);

	useEffect(() => {
		// Be defensive against null sizes when pane is invisible
		if (plotWidth <= 0 || plotHeight <= 0) {
			return;
		}

		const notify = () => {
			let policy = services.erdosPlotsService.selectedSizingPolicy;

			if (policy instanceof PlotSizingPolicyIntrinsic) {
				policy = new PlotSizingPolicyAuto;
			}

			const viewPortSize = {
				height: plotHeight,
				width: plotWidth,
			}
			let size = policy.getPlotSize(viewPortSize);
			size = size ? size : viewPortSize;

			services.erdosPlotsService.setPlotsRenderSettings({
				size,
				pixel_ratio: DOM.getWindow(containerRef.current).devicePixelRatio,
				format: PlotRenderFormat.Png, // Currently hard-coded
			});
		};

		// Renotify if the sizing policy changes
		const disposables = new DisposableStore();
		disposables.add(services.erdosPlotsService.onDidChangeSizingPolicy((_policy) => {
			notify();
		}));

		// Propagate current render settings. Use a debouncer to avoid excessive
		// messaging to language kernels.
		const debounceTimer = setTimeout(() => {
			notify()
		}, 500);

		return () => {
			clearTimeout(debounceTimer);
			disposables.dispose();
		};
	}, [plotWidth, plotHeight, services.erdosPlotsService]);

	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Get the current plot instance using the selected instance ID from the
		// ErdosPlotsContext.
		const currentPlotInstance = erdosPlotsContext.erdosPlotInstances.find(
			(plotInstance) => plotInstance.id === erdosPlotsContext.selectedInstanceId
		);
		if (currentPlotInstance && isZoomablePlotClient(currentPlotInstance)) {
			// Listen to the plot instance for zoom level changes.
			disposableStore.add(currentPlotInstance.onDidChangeZoomLevel((zoomLevel) => {
				setZoom(zoomLevel);
			}));
			// Set the initial zoom level.
			setZoom(currentPlotInstance.zoomLevel);
		}
		return () => {
			// Dispose of the disposable store when the component unmounts.
			disposableStore.dispose();
		}
	}, [erdosPlotsContext.erdosPlotInstances, erdosPlotsContext.selectedInstanceId]);

	/**
	 * Renders either a DynamicPlotInstance (resizable plot), a
	 * StaticPlotInstance (static plot image), or a WebviewPlotInstance
	 * (interactive HTML plot) depending on the type of plot instance.
	 *
	 * @param plotInstance The plot instance to render
	 * @returns The rendered component.
	 */
	const render = (plotInstance: IErdosPlotClient) => {
		if (plotInstance instanceof PlotClientInstance) {
			return <DynamicPlotInstance
				key={plotInstance.id}
				height={plotHeight}
				plotClient={plotInstance}
				width={plotWidth}
				zoom={zoom} />;
		} else if (plotInstance instanceof StaticPlotClient) {
			return <StaticPlotInstance
				key={plotInstance.id}
				plotClient={plotInstance}
				zoom={zoom} />;
		} else if (plotInstance instanceof WebviewPlotClient) {
			return <WebviewPlotInstance
				key={plotInstance.id}
				height={plotHeight}
				plotClient={plotInstance}
				visible={props.visible}
				width={plotWidth} />;
		}

		return null;
	};

	/**
	 * Focuses the plot thumbnail for the given plot ID.
	 * @param plotId The ID of the plot to focus on.
	 */
	const focusPlotThumbnail = (plotId: string) => {
		const plotHistory = plotHistoryRef.current;
		if (!plotHistory) {
			return;
		}
		const plotThumbnailElement = plotHistory.querySelector(
			`.plot-thumbnail[data-plot-id="${plotId}"]`
		) as HTMLButtonElement;
		if (plotThumbnailElement) {
			plotThumbnailElement.focus();
		}
	};

	/**
	 * Focuses the previous plot thumbnail in the history.
	 * @param currentPlotId The ID of the currently selected plot.
	 */
	const focusPreviousPlotThumbnail = (currentPlotId: string) => {
		const currentPlotIndex = erdosPlotsContext.erdosPlotInstances.findIndex(
			(plotInstance) => plotInstance.id === currentPlotId
		);
		if (currentPlotIndex === -1) {
			return;
		}
		if (currentPlotIndex === 0) {
			return;
		}
		const previousPlotInstance = erdosPlotsContext.erdosPlotInstances[currentPlotIndex - 1];
		focusPlotThumbnail(previousPlotInstance.id);
	}

	/**
	 * Focuses the next plot thumbnail in the history.
	 * @param currentPlotId The ID of the currently selected plot.
	 */
	const focusNextPlotThumbnail = (currentPlotId: string) => {
		const currentPlotIndex = erdosPlotsContext.erdosPlotInstances.findIndex(
			(plotInstance) => plotInstance.id === currentPlotId
		);
		if (currentPlotIndex === -1) {
			return;
		}
		if (currentPlotIndex === erdosPlotsContext.erdosPlotInstances.length - 1) {
			return;
		}
		const nextPlotInstance = erdosPlotsContext.erdosPlotInstances[currentPlotIndex + 1];
		focusPlotThumbnail(nextPlotInstance.id);
	}

	/**
	 * Renders a thumbnail of either a DynamicPlotInstance (resizable plot), a
	 * StaticPlotInstance (static plot image), or a WebviewPlotInstance
	 * (interactive HTML plot) depending on the type of plot instance.
	 *
	 * @param plotInstance The plot instance to render
	 * @param selected Whether the thumbnail is selected
	 * @returns
	 */
	const renderThumbnail = (plotInstance: IErdosPlotClient, selected: boolean) => {
		const renderThumbnailImage = () => {
			if (plotInstance instanceof PlotClientInstance) {
				return <DynamicPlotThumbnail plotClient={plotInstance} />;
			} else if (plotInstance instanceof StaticPlotClient) {
				return <StaticPlotThumbnail plotClient={plotInstance} />;
			} else if (plotInstance instanceof WebviewPlotClient) {
				return <WebviewPlotThumbnail plotClient={plotInstance} />;
			} else {
				return null;
			}
		};

		return <PlotGalleryThumbnail
			key={plotInstance.id}
			focusNextPlotThumbnail={focusNextPlotThumbnail}
			focusPreviousPlotThumbnail={focusPreviousPlotThumbnail}
			plotClient={plotInstance}
			selected={selected}>
			{renderThumbnailImage()}
		</PlotGalleryThumbnail>;
	};

	// Render the plot history gallery.
	const renderHistory = () => {
		return <div ref={plotHistoryRef} className='plot-history-scroller'>
			<div className='plot-history'>
				{erdosPlotsContext.erdosPlotInstances.map((plotInstance) => (
					renderThumbnail(plotInstance,
						plotInstance.id === erdosPlotsContext.selectedInstanceId)
				))}
			</div>
		</div>;
	};

	// If there are no plot instances, show a placeholder; otherwise, show the
	// most recently generated plot.
	return (
		<div ref={containerRef} className={'plots-container dark-filter-' + props.darkFilterMode + ' ' + historyEdge} tabIndex={0}>
			<div className='selected-plot'>
				{erdosPlotsContext.erdosPlotInstances.length === 0 ? (
					(() => {
						return <div className='plot-placeholder'></div>;
					})()
				) : (
					erdosPlotsContext.erdosPlotInstances.map((plotInstance, index) => {
						const isSelected = plotInstance.id === erdosPlotsContext.selectedInstanceId;
						if (isSelected) {
							return render(plotInstance);
						}
						return null;
					})
				)}
			</div>
			{props.showHistory && renderHistory()}
		</div>
	);
};
