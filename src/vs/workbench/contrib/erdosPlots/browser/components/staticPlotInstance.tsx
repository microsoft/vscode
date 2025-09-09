/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useState, useEffect } from 'react';

// Other dependencies.
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';
import { ZoomLevel } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { DataTransfers } from '../../../../../base/browser/dnd.js';

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
		<div className="plot-instance static-plot-instance" style={{
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: '100%',
			height: '100%'
		}}
>
			<img 
				src={imageUri} 
				alt={`Plot ${props.plotClient.id}`}
				draggable={true}
				className='plot'
				style={{ 
					transform: getZoomTransform(),
					maxWidth: props.zoom === ZoomLevel.Fit ? '100%' : 'none',
					maxHeight: props.zoom === ZoomLevel.Fit ? '100%' : 'none',
					objectFit: props.zoom === ZoomLevel.Fit ? 'contain' : 'none',
					pointerEvents: 'auto',
					userSelect: 'auto'
				}}
				onError={() => setError('Failed to load image')}
				onDragStart={(e) => {
					if (e.dataTransfer) {
						// Set plot data for erdosAi to recognize
						const plotData = {
							id: props.plotClient.id,
							uri: imageUri,
							type: 'static',
							metadata: {}
						};
						e.dataTransfer.setData(DataTransfers.PLOTS, JSON.stringify(plotData));
						
						// Also set as text for external applications
						e.dataTransfer.setData(DataTransfers.TEXT, `Plot: ${props.plotClient.id}`);
					}
				}}
				onContextMenu={(e) => {
					// Don't prevent default - let browser handle context menu
				}}
			/>
		</div>
	);
};
