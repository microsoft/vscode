/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { PropsWithChildren } from 'react';

// Other dependencies.
import { IErdosPlotClient } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * PlotGalleryThumbnailProps interface.
 */
interface PlotGalleryThumbnailProps {
	focusNextPlotThumbnail: (currentPlotId: string) => void;
	focusPreviousPlotThumbnail: (currentPlotId: string) => void;
	plotClient: IErdosPlotClient;
	selected: boolean;
}

/**
 * PlotGalleryThumbnail component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const PlotGalleryThumbnail = (props: PropsWithChildren<PlotGalleryThumbnailProps>) => {
	const services = useErdosReactServicesContext();

	const handleClick = () => {
		services.erdosPlotsService.selectPlot(props.plotClient.id);
	};

	const handleRemove = (e: React.MouseEvent) => {
		e.stopPropagation();
		services.erdosPlotsService.removePlot(props.plotClient.id);
	};

	return (
		<div 
			className={`plot-thumbnail ${props.selected ? 'selected' : ''}`}
			data-plot-id={props.plotClient.id}
		>
			<button onClick={handleClick}>
				{props.children}
			</button>
			<button className="plot-close" onClick={handleRemove} title="Remove plot">
				×
			</button>
		</div>
	);
};
