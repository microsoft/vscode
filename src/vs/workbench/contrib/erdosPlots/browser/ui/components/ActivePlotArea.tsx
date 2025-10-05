/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { UnifiedPlotRenderer, RenderMode, InteractivePlotEngine } from './unifiedPlotRenderer.js';
import { usePlotsContextData } from '../state/PlotsStateContext.js';
import { PlotClientInstance } from '../../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { IErdosPlotClient, StaticPlotInstance } from '../../../common/erdosPlotsService.js';

interface ActivePlotAreaConfiguration {
	areaWidth: number;
	areaHeight: number;
	horizontalPosition: number;
	verticalPosition: number;
	visibilityState: boolean;
}

export const HistoryDimensionPixels = 100;

/**
 * Component rendering the active plot.
 */
export const ActivePlotArea = (config: ActivePlotAreaConfiguration) => {
	const contextData = usePlotsContextData();

	if (!contextData) {
		return (
			<div className='ep-main-container' tabIndex={0}>
				<div className='ep-active-plot-wrapper'>
					<div className='ep-plot-placeholder'></div>
				</div>
			</div>
		);
	}

	const displayHeight = config.areaHeight;
	const displayWidth = config.areaWidth;

	const constructPlotRenderer = (clientInstance: IErdosPlotClient) => {
		let renderingMode: RenderMode;

	if (clientInstance instanceof PlotClientInstance) {
		renderingMode = RenderMode.Dynamic;
	} else if (clientInstance instanceof StaticPlotInstance) {
		renderingMode = RenderMode.Static;
	} else if (clientInstance instanceof InteractivePlotEngine) {
			renderingMode = RenderMode.Interactive;
		} else {
			return null;
		}

		return <UnifiedPlotRenderer
			key={clientInstance.id}
			dimensions={{ w: displayWidth, h: displayHeight }}
			displayMode={renderingMode}
			isVisible={config.visibilityState}
			renderer={clientInstance}
		/>;
	};

	return (
		<div className='ep-main-container' tabIndex={0}>
			<div className='ep-active-plot-wrapper'>
				{contextData.allPlots.length === 0 &&
					<div className='ep-plot-placeholder'></div>}
				{contextData.allPlots.map((instance: IErdosPlotClient, index: number) => (
					instance.id === contextData.selectedInstanceId &&
					constructPlotRenderer(instance)
				))}
			</div>
		</div>
	);
};

