/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useState, useEffect } from 'react';

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
	const [imageUri, setImageUri] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		const loadPlotImage = async () => {
			try {
				setIsLoading(true);
				setError(undefined);
				
				// For StaticPlotClient, check if it has a URI property
				const uri = (props.plotClient as any).uri;
				if (uri) {
					setImageUri(uri);
				} else {
					// If no URI, show that no image is available
					setError('No image data available');
				}
			} catch (err) {
				console.error('Failed to load plot:', err);
				setError('Failed to load plot image');
			} finally {
				setIsLoading(false);
			}
		};

		loadPlotImage();
	}, [props.plotClient]);

	if (isLoading) {
		return (
			<div className="plot-instance static-plot-instance">
				<div className="image-placeholder">
					<div className="image-placeholder-text">Loading plot...</div>
				</div>
			</div>
		);
	}

	if (error || !imageUri) {
		return (
			<div className="plot-instance static-plot-instance">
				<div className="image-placeholder">
					<div className="image-placeholder-text">
						{error || 'Static Plot (ID: ' + props.plotClient.id + ')'}
					</div>
				</div>
			</div>
		);
	}

	const getZoomTransform = () => {
		switch (props.zoom) {
			case ZoomLevel.Fifty:
				return 'scale(0.5)';
			case ZoomLevel.SeventyFive:
				return 'scale(0.75)';
			case ZoomLevel.OneHundred:
				return 'scale(1)';
			case ZoomLevel.TwoHundred:
				return 'scale(2)';
			case ZoomLevel.Fit:
			default:
				return 'scale(1)';
		}
	};

	return (
		<div className="plot-instance static-plot-instance">
			<div className="image-wrapper">
				<img 
					src={imageUri} 
					alt={`Plot ${props.plotClient.id}`}
					style={{ 
						transform: `translate(-50%, -50%) ${getZoomTransform()}`,
						position: 'absolute',
						top: '50%',
						left: '50%',
						maxWidth: '100%',
						maxHeight: '100%',
						objectFit: 'contain'
					}}
					onError={() => setError('Failed to load image')}
				/>
			</div>
		</div>
	);
};
