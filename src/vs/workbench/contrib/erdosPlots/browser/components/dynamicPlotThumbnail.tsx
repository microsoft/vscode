/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useEffect, useState } from 'react';

// Other dependencies.
import { PlaceholderThumbnail } from './placeholderThumbnail.js';
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * DynamicPlotThumbnailProps interface.
 */
interface DynamicPlotThumbnailProps {
	plotClient: PlotClientInstance;
	size?: number;
}

/**
 * DynamicPlotThumbnail component. This component renders a thumbnail of a plot instance.
 *
 * @param props A DynamicPlotThumbnailProps that contains the component properties.
 * @returns The rendered component.
 */
export const DynamicPlotThumbnail = (props: DynamicPlotThumbnailProps) => {
	const services = useErdosReactServicesContext();
	const [uri, setUri] = useState(() => {
		// If the plot is already rendered, set the URI; otherwise, try to use the cached URI until
		// the plot is rendered.
		if (props.plotClient.lastRender) {
			return props.plotClient.lastRender.uri;
		} else {
			return services.erdosPlotsService.getCachedPlotThumbnailURI(props.plotClient.id);
		}
	});
	const size = props.size || 75; // Default to 75px if no size provided

	useEffect(() => {
		// When the plot is rendered, update the URI. This can happen multiple times if the plot
		// is resized.
		const disposable = props.plotClient.onDidCompleteRender(result => {
			setUri(result.uri);
		});

		return () => disposable.dispose();
	}, [props.plotClient]);

	// If the plot is not yet rendered yet (no URI), show a placeholder;
	// otherwise, show the rendered plot.
	if (uri) {
		return (
			<div className="plot-thumbnail-image">
				<img 
					alt={`Plot ${props.plotClient.id}`} 
					className="plot" 
					src={uri}
					style={{
						width: `${size}px`,
						height: `${size}px`,
						objectFit: 'cover'
					}}
				/>
			</div>
		);
	} else {
		return <PlaceholderThumbnail size={size} />;
	}
};
