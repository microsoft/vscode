/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

// Other dependencies.
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';

/**
 * DynamicPlotThumbnailProps interface.
 */
interface DynamicPlotThumbnailProps {
	plotClient: PlotClientInstance;
}

/**
 * DynamicPlotThumbnail component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const DynamicPlotThumbnail = (props: DynamicPlotThumbnailProps) => {
	return (
		<div className="plot-thumbnail-image">
