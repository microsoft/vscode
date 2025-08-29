/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useEffect, useState } from 'react';

// Other dependencies.
import { WebviewPlotClient } from '../webviewPlotClient.js';
import { PlaceholderThumbnail } from './placeholderThumbnail.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * WebviewPlotThumbnailProps interface.
 */
interface WebviewPlotThumbnailProps {
	plotClient: WebviewPlotClient;
	size?: number;
}

/**
 * WebviewPlotThumbnail component. This component renders a thumbnail of a plot
 * instance backed by a webview.
 *
 * @param props A WebviewPlotThumbnailProps that contains the component properties.
 * @returns The rendered component.
 */
export const WebviewPlotThumbnail = (props: WebviewPlotThumbnailProps) => {
	const services = useErdosReactServicesContext();
	const [uri, setUri] = useState(() => {
		// If the plot is already rendered, set the URI; otherwise, try to use the cached URI until
		// the plot is rendered.
		if (props.plotClient.thumbnailUri) {
			return props.plotClient.thumbnailUri;
		} else {
			return services.erdosPlotsService.getCachedPlotThumbnailURI(props.plotClient.id);
		}
	});
	const size = props.size || 75; // Default to 75px if no size provided

	useEffect(() => {
		// When the plot thumbnail is rendered, update the URI
		const disposable = props.plotClient.onDidRenderThumbnail((result) => {
			setUri(result);
		});

		return () => disposable.dispose();
	}, [services.erdosPlotsService, props.plotClient]);

	// If the plot is not yet rendered yet (no URI), show a placeholder;
	// otherwise, show the rendered thumbnail.
	if (uri) {
		return (
			<div className="plot-thumbnail-image">
				<img 
					alt={`Plot ${props.plotClient.id}`} 
					src={uri}
					className="plot"
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
