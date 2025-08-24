/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './actionBars.css';

// React.
import React, { PropsWithChildren } from 'react';

// Other dependencies.
import { localize } from '../../../../../nls.js';
import { useErdosPlotsContext } from '../erdosPlotsContext.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * ActionBarsProps interface.
 */
export interface ActionBarsProps {
	readonly zoomHandler: (zoomLevel: number) => void;
	readonly zoomLevel: number;
}

/**
 * ActionBars component.
 * @param props An ActionBarsProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActionBars = (props: PropsWithChildren<ActionBarsProps>) => {
	// Hooks.
	const services = useErdosReactServicesContext();
	const erdosPlotsContext = useErdosPlotsContext();

	// Do we have any plots?
	const noPlots = erdosPlotsContext.erdosPlotInstances.length === 0;
	const disableLeft = noPlots || erdosPlotsContext.selectedInstanceIndex <= 0;
	const disableRight = noPlots || erdosPlotsContext.selectedInstanceIndex >=
		erdosPlotsContext.erdosPlotInstances.length - 1;

	// Render a simple action bar for now
	return (
		<div className="plots-action-bars-container">
			<div className="action-bar">
				<button 
					disabled={disableLeft}
					onClick={() => services.erdosPlotsService.selectPreviousPlot()}
					title={localize('erdosShowPreviousPlot', "Show previous plot")}
				>
					◄
				</button>
				<button 
					disabled={disableRight}
					onClick={() => services.erdosPlotsService.selectNextPlot()}
					title={localize('erdosShowNextPlot', "Show next plot")}
				>
					►
				</button>
				<button 
					disabled={noPlots}
					onClick={() => services.erdosPlotsService.removeAllPlots()}
					title={localize('erdosClearAllPlots', "Clear all plots")}
				>
					Clear
				</button>
			</div>
		</div>
	);
};
