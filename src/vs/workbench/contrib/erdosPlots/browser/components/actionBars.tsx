/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './actionBars.css';

// React.
import React, { PropsWithChildren } from 'react';

// Other dependencies.
import { useErdosPlotsContext } from '../erdosPlotsContext.js';
import { PlotDropdown } from './plotDropdown.js';
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
	const erdosPlotsContext = useErdosPlotsContext();
	const services = useErdosReactServicesContext();

	// Get plots data
	const plots = erdosPlotsContext.erdosPlotInstances;
	const selectedPlotId = erdosPlotsContext.selectedInstanceId;

	// Check if we have plots and current plot state
	const hasPlots = plots.length > 0;
	const hasCurrentPlot = selectedPlotId !== undefined && selectedPlotId !== '';

	// Action handlers
	const handlePreviousPlot = () => {
		services.commandService.executeCommand('workbench.action.erdosPlots.navigatePreviousPlot');
	};

	const handleNextPlot = () => {
		services.commandService.executeCommand('workbench.action.erdosPlots.navigateNextPlot');
	};

	const handleCopyPlot = () => {
		services.commandService.executeCommand('workbench.action.erdosPlots.copyCurrentPlot');
	};

	const handleSavePlot = () => {
		services.commandService.executeCommand('workbench.action.erdosPlots.saveCurrentPlot');
	};

	const handleClearPlot = () => {
		services.commandService.executeCommand('workbench.action.erdosPlots.clearCurrentPlot');
	};



	// The action bar contains left actions (icons) and right actions (dropdown)
	return (
		<div className="plots-action-bars-container">
			<div className="action-bar">
				<div className="left-actions">
					<button 
						className="action-button"
						disabled={!hasPlots}
						onClick={handlePreviousPlot}
						title="Previous plot"
					>
						<span className="codicon codicon-chevron-left"></span>
					</button>
					<button 
						className="action-button"
						disabled={!hasPlots}
						onClick={handleNextPlot}
						title="Next plot"
					>
						<span className="codicon codicon-chevron-right"></span>
					</button>
					<button 
						className="action-button"
						disabled={!hasCurrentPlot}
						onClick={handleCopyPlot}
						title="Copy plot"
					>
						<span className="codicon codicon-copy"></span>
					</button>
					<button 
						className="action-button"
						disabled={!hasCurrentPlot}
						onClick={handleSavePlot}
						title="Save plot"
					>
						<span className="codicon codicon-save"></span>
					</button>
					<button 
						className="action-button"
						disabled={!hasCurrentPlot}
						onClick={handleClearPlot}
						title="Clear current plot"
					>
						<span className="codicon codicon-trash"></span>
					</button>
				</div>
				<div className="right-actions">
					<PlotDropdown 
						plots={plots}
						selectedPlotId={selectedPlotId}
					/>
				</div>
			</div>
		</div>
	);
};
