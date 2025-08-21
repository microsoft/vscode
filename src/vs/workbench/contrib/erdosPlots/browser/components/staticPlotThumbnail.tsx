/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';

/**
 * StaticPlotThumbnailProps interface.
 */
interface StaticPlotThumbnailProps {
	plotClient: StaticPlotClient;
}

/**
 * StaticPlotThumbnail component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const StaticPlotThumbnail = (props: StaticPlotThumbnailProps) => {
	return (
		<div className="plot-thumbnail-image">
			📈
		</div>
	);
};
