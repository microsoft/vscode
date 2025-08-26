/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useState, useEffect } from 'react';

// Other dependencies.
import { StaticPlotClient } from '../../../../services/erdosPlots/common/staticPlotClient.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * StaticPlotThumbnailProps interface.
 */
interface StaticPlotThumbnailProps {
	plotClient: StaticPlotClient;
}

/**
 * StaticPlotThumbnail component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const StaticPlotThumbnail = (props: StaticPlotThumbnailProps) => {
	const services = useErdosReactServicesContext();
	const [thumbnailUri, setThumbnailUri] = useState<string | undefined>(
		services.erdosPlotsService.getCachedPlotThumbnailURI(props.plotClient.id)
	);
	const [isLoading, setIsLoading] = useState(!thumbnailUri);

	useEffect(() => {
		const generateThumbnail = async () => {
			if (thumbnailUri) {
				return; // Already have a thumbnail
			}

			try {
				setIsLoading(true);
				
				// Try to use the StaticPlotClient's URI directly
				const uri = (props.plotClient as any).uri;
				if (uri) {
					setThumbnailUri(uri);
					return;
				}

				// Fallback to a placeholder
				const placeholderUri = generatePlaceholderThumbnail(props.plotClient.id);
				setThumbnailUri(placeholderUri);
			} catch (error) {
				console.warn('Failed to generate thumbnail:', error);
				const placeholderUri = generatePlaceholderThumbnail(props.plotClient.id);
				setThumbnailUri(placeholderUri);
			} finally {
				setIsLoading(false);
			}
		};

		generateThumbnail();
	}, [props.plotClient.id, thumbnailUri]);

	const generatePlaceholderThumbnail = (plotId: string): string => {
		// Generate a simple SVG placeholder thumbnail
		const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
			<rect width="40" height="40" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>
			<text x="20" y="25" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" fill="#666">📈</text>
		</svg>`;
		
		return `data:image/svg+xml;base64,${btoa(svg)}`;
	};

	if (isLoading) {
		return (
			<div className="plot-thumbnail-image">
				<div style={{ 
					width: '40px', 
					height: '40px', 
					display: 'flex', 
					alignItems: 'center', 
					justifyContent: 'center',
					background: '#f0f0f0',
					border: '1px solid #ccc'
				}}>
					⏳
				</div>
			</div>
		);
	}

	return (
		<div className="plot-thumbnail-image">
			{thumbnailUri ? (
				<img 
					src={thumbnailUri} 
					alt={`Plot ${props.plotClient.id} thumbnail`}
					style={{
						width: '40px',
						height: '40px',
						objectFit: 'cover',
						border: '1px solid #ccc'
					}}
					onError={() => {
						const placeholderUri = generatePlaceholderThumbnail(props.plotClient.id);
						setThumbnailUri(placeholderUri);
					}}
				/>
			) : (
				<div style={{ 
					width: '40px', 
					height: '40px', 
					display: 'flex', 
					alignItems: 'center', 
					justifyContent: 'center',
					background: '#f0f0f0',
					border: '1px solid #ccc'
				}}>
					📈
				</div>
			)}
		</div>
	);
};
