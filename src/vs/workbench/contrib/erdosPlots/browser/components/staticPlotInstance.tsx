/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';
import { ZoomLevel } from '../../../../services/erdosPlots/common/erdosPlots.js';

/**
 * StaticPlotInstanceProps interface.
 */
interface StaticPlotInstanceProps {
	plotClient: StaticPlotClient;
	zoom: ZoomLevel;
}

/**
 * StaticPlotInstance component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const StaticPlotInstance = (props: StaticPlotInstanceProps) => {
	return (
		<div className="plot-instance">
			<div className="image-placeholder">
				<div className="image-placeholder-text">
					Static Plot (ID: {props.plotClient.id})
				</div>
			</div>
		</div>
	);
};
