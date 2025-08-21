/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React from 'react';

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
	return (
		<div className="plot-instance" style={{ width: props.width, height: props.height }}>
			<div className="image-placeholder">
				<div className="image-placeholder-text">
					Webview Plot (ID: {props.plotClient.id})
				</div>
			</div>
		</div>
	);
};
