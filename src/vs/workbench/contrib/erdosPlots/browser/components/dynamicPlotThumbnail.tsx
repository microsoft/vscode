/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useEffect, useState } from 'react';

// Other dependencies.
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { PlaceholderThumbnail } from './placeholderThumbnail.js';

/**
 * DynamicPlotThumbnailProps interface.
 */
interface DynamicPlotThumbnailProps {
	plotClient: PlotClientInstance;
}

/**
 * DynamicPlotThumbnail component. This component renders a thumbnail of a plot instance.
 *
 * @param props A DynamicPlotThumbnailProps that contains the component properties.
 * @returns The rendered component.
 */
export const DynamicPlotThumbnail = (props: DynamicPlotThumbnailProps) => {
	const [uri, setUri] = useState(() => {
		// If the plot is already rendered, set the URI; otherwise, show placeholder until rendered
		if (props.plotClient.lastRender) {
			return props.plotClient.lastRender.uri;
		}
		return undefined;
	});

	useEffect(() => {
		// When the plot is rendered, update the URI. This can happen multiple times if the plot
		// is resized.
		const disposable = props.plotClient.onDidRender((result: any) => {
			if (result && result.uri) {
				setUri(result.uri);
			}
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
