/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { ZoomLevel } from '../../../../services/erdosPlots/common/erdosPlots.js';

/**
 * DynamicPlotInstanceProps interface.
 */
interface DynamicPlotInstanceProps {
	height: number;
	plotClient: PlotClientInstance;
	width: number;
	zoom: ZoomLevel;
}

/**
 * DynamicPlotInstance component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const DynamicPlotInstance = (props: DynamicPlotInstanceProps) => {
	return (
		<div className="plot-instance" style={{ width: props.width, height: props.height }}>
			<div className="image-placeholder">
				<div className="image-placeholder-text">
					Dynamic Plot (ID: {props.plotClient.id})
				</div>
			</div>
		</div>
	);
};
