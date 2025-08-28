/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';
import { PlaceholderThumbnail } from './placeholderThumbnail.js';

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
	// For static plots, we can directly use the plot client's URI
	// This is the actual plot image data, no need for complex caching logic
	const plotUri = props.plotClient.uri;

	if (!plotUri) {
		// If no URI is available, show placeholder
		return <PlaceholderThumbnail />;
	}

	return (
		<div className="plot-thumbnail-image">
			<img 
				src={plotUri} 
				alt={`Plot ${props.plotClient.id} thumbnail`}
				className="plot"
				style={{
					width: '75px',
					height: '75px',
					objectFit: 'cover'
				}}
				onError={() => {
					console.warn('Failed to load plot thumbnail for', props.plotClient.id);
				}}
			/>
		</div>
	);
};
