/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useEffect, useState } from 'react';

// Other dependencies.
import { WebviewPlotClient } from '../webviewPlotClient.js';
import { PlaceholderThumbnail } from './placeholderThumbnail.js';

/**
 * WebviewPlotThumbnailProps interface.
 */
interface WebviewPlotThumbnailProps {
	plotClient: WebviewPlotClient;
}

/**
 * WebviewPlotThumbnail component. This component renders a thumbnail of a plot
 * instance backed by a webview.
 *
 * @param props A WebviewPlotThumbnailProps that contains the component properties.
 * @returns The rendered component.
 */
export const WebviewPlotThumbnail = (props: WebviewPlotThumbnailProps) => {
	const [uri, setUri] = useState(() => {
		// If the plot already has a thumbnail URI, use it; otherwise show placeholder until rendered
		if (props.plotClient.thumbnailUri) {
			return props.plotClient.thumbnailUri;
		}
		return undefined;
	});

	useEffect(() => {
		// When the plot thumbnail is rendered, update the URI
		const disposable = props.plotClient.onDidRenderThumbnail((result) => {
			if (result) {
				setUri(result);
			}
		});

		return () => disposable.dispose();
	}, [props.plotClient]);

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
						width: '75px',
						height: '75px',
						objectFit: 'cover'
					}}
				/>
			</div>
		);
	} else {
		return <PlaceholderThumbnail />;
	}
};
