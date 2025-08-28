/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useState, useEffect } from 'react';

// Other dependencies.
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { ZoomLevel, PlotRenderFormat } from '../../../../services/erdosPlots/common/erdosPlots.js';

/**
 * DynamicPlotInstanceProps interface.
 */
interface DynamicPlotInstanceProps {
	height: number;
	plotClient: PlotClientInstance;
	width: number;
	zoom: ZoomLevel;
}

/**
 * DynamicPlotInstance component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const DynamicPlotInstance = (props: DynamicPlotInstanceProps) => {
	const [imageUri, setImageUri] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		const renderPlot = async () => {
			try {
				setIsLoading(true);
				setError(undefined);
				
				// Check if plot has already been rendered
				if (props.plotClient.lastRender?.uri) {
					setImageUri(props.plotClient.lastRender.uri);
					setIsLoading(false);
					return;
				}

				// Request a new render with current dimensions
				const rendered = await props.plotClient.requestRender({
					size: { width: props.width, height: props.height },
					pixel_ratio: window.devicePixelRatio || 1,
					format: PlotRenderFormat.Png
				});
				setImageUri(rendered.uri);
			} catch (err) {
				console.error('Failed to render plot:', err);
				setError('Failed to render plot');
			} finally {
				setIsLoading(false);
			}
		};

		// Only render if we have valid dimensions
		if (props.width > 0 && props.height > 0) {
			renderPlot();
		}
	}, [props.plotClient, props.width, props.height]);

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

	if (props.width <= 0 || props.height <= 0) {
		return (
			<div className="plot-instance dynamic-plot-instance" style={{ width: props.width, height: props.height }}>
				<div className="image-placeholder">
					<div className="image-placeholder-text">Invalid dimensions</div>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="plot-instance dynamic-plot-instance" style={{ width: props.width, height: props.height }}>
				<div className="image-placeholder">
					<div className="image-placeholder-text">Rendering plot...</div>
				</div>
			</div>
		);
	}

	if (error || !imageUri) {
		return (
			<div className="plot-instance dynamic-plot-instance" style={{ width: props.width, height: props.height }}>
				<div className="image-placeholder">
					<div className="image-placeholder-text">
						{error || 'Dynamic Plot (ID: ' + props.plotClient.id + ')'}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="plot-instance dynamic-plot-instance" style={{ width: props.width, height: props.height }}>
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
