/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useRef, useEffect, useState } from 'react';

// Other dependencies.
import { WebviewPlotClient } from '../webviewPlotClient.js';

/**
 * WebviewPlotInstanceProps interface.
 */
interface WebviewPlotInstanceProps {
	height: number;
	plotClient: WebviewPlotClient;
	visible: boolean;
	width: number;
}

/**
 * WebviewPlotInstance component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const WebviewPlotInstance = (props: WebviewPlotInstanceProps) => {
	const webviewRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		const setupWebview = async () => {
			try {
				setIsLoading(true);
				setError(undefined);

				// Check if plot client has HTML content
				const htmlContent = props.plotClient.htmlContent;
				if (htmlContent && webviewRef.current) {
					// If we have HTML content, render it directly in the iframe
					const doc = webviewRef.current.contentDocument;
					if (doc) {
						doc.open();
						doc.write(htmlContent);
						doc.close();
						setIsLoading(false);
						return;
					}
				}

				// Check if plot client has thumbnail
				const thumbnailUri = props.plotClient.thumbnailUri;
				if (thumbnailUri) {
					// If we have a thumbnail, we can display it as a fallback
					setIsLoading(false);
					return;
				}

				// For webview plots, we would typically activate the webview
				// and layout it over our container element
				if (props.visible && containerRef.current) {
					try {
						await props.plotClient.activate();
						props.plotClient.claim(webviewRef.current);
						props.plotClient.layoutWebviewOverElement(containerRef.current);
					} catch (err) {
						console.warn('Could not activate webview plot:', err);
						setError('Webview not available');
					}
				}
			} catch (err) {
				console.error('Failed to setup webview plot:', err);
				setError('Failed to setup webview');
			} finally {
				setIsLoading(false);
			}
		};

		setupWebview();

		// Cleanup function
		return () => {
			if (props.plotClient.isActive()) {
				try {
					props.plotClient.release(webviewRef.current);
				} catch (err) {
					console.warn('Failed to release webview:', err);
				}
			}
		};
	}, [props.plotClient, props.visible]);

	// Handle visibility changes
	useEffect(() => {
		if (!props.visible && props.plotClient.isActive()) {
			try {
				props.plotClient.release(webviewRef.current);
			} catch (err) {
				console.warn('Failed to release webview on hide:', err);
			}
		}
	}, [props.visible, props.plotClient]);

	if (isLoading) {
		return (
			<div 
				ref={containerRef}
				className="plot-instance webview-plot" 
				style={{ width: props.width, height: props.height }}
			>
				<div className="image-placeholder">
					<div className="image-placeholder-text">Loading webview plot...</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div 
				ref={containerRef}
				className="plot-instance webview-plot" 
				style={{ width: props.width, height: props.height }}
			>
				<div className="image-placeholder">
					<div className="image-placeholder-text">{error}</div>
				</div>
			</div>
		);
	}

	// If we have a thumbnail, display it as a fallback
	const thumbnailUri = props.plotClient.thumbnailUri;
	if (thumbnailUri && !props.plotClient.isActive()) {
		return (
			<div 
				ref={containerRef}
				className="plot-instance webview-plot" 
				style={{ width: props.width, height: props.height }}
			>
				<img 
					src={thumbnailUri}
					alt={`Webview Plot ${props.plotClient.id}`}
					style={{ 
						width: '100%', 
						height: '100%',
						objectFit: 'contain'
					}}
					onError={() => setError('Failed to load thumbnail')}
				/>
			</div>
		);
	}

	// Main webview container
	return (
		<div 
			ref={containerRef}
			className="plot-instance webview-plot" 
			style={{ width: props.width, height: props.height }}
		>
			{/* The actual webview will be positioned over this element by the WebviewPlotClient */}
			<iframe
				ref={webviewRef}
				width="100%"
				height="100%"
				frameBorder="0"
				sandbox="allow-scripts allow-same-origin"
				style={{ 
					position: 'absolute',
					top: 0,
					left: 0,
					background: 'transparent'
				}}
			/>
		</div>
	);
};
