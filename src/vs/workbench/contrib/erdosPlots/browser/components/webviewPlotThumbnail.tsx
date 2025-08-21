/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { WebviewPlotClient } from '../webviewPlotClient.js';

/**
 * WebviewPlotThumbnailProps interface.
 */
interface WebviewPlotThumbnailProps {
	plotClient: WebviewPlotClient;
}

/**
 * WebviewPlotThumbnail component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const WebviewPlotThumbnail = (props: WebviewPlotThumbnailProps) => {
	return (
		<div className="plot-thumbnail-image">
			🖼️
		</div>
	);
};
