/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../styles/plotsApp.css';

import React, { PropsWithChildren, useEffect, useState } from 'react';
import { PlotsStateProvider } from '../state/PlotsStateContext.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ActivePlotArea } from './ActivePlotArea.js';
import { PlotsViewPane } from '../panes/plotsViewPane.js';

/**
 * Configuration properties for the main plots application component.
 */
export interface PlotsAppConfiguration {
	readonly reactComponentContainer: PlotsViewPane;
}

/**
 * Root plots application component coordinating state and rendering.
 */
export const PlotsApp = (config: PropsWithChildren<PlotsAppConfiguration>) => {
	const [containerWidth, setContainerWidth] = useState(config.reactComponentContainer.width);
	const [containerHeight, setContainerHeight] = useState(config.reactComponentContainer.height);
	const [horizontalOffset, setHorizontalOffset] = useState(0);
	const [verticalOffset, setVerticalOffset] = useState(0);
	const [displayState, setDisplayState] = useState(config.reactComponentContainer.containerVisible);

	useEffect(() => {
		const cleanupHandlers = new DisposableStore();

		cleanupHandlers.add(config.reactComponentContainer.onSizeChanged((dimensions: { width: number; height: number }) => {
			setContainerWidth(dimensions.width);
			setContainerHeight(dimensions.height);
		}));

		cleanupHandlers.add(config.reactComponentContainer.onPositionChanged((coordinates: { x: number; y: number }) => {
			setHorizontalOffset(coordinates.x);
			setVerticalOffset(coordinates.y);
		}));

		cleanupHandlers.add(config.reactComponentContainer.onVisibilityChanged((isVisible: boolean) => {
			setDisplayState(isVisible);
		}));

		return () => cleanupHandlers.dispose();
	}, [config.reactComponentContainer]);

	return (
		<PlotsStateProvider {...config}>
			<ActivePlotArea
				areaHeight={containerHeight}
				visibilityState={displayState}
				areaWidth={containerWidth}
				horizontalPosition={horizontalOffset}
				verticalPosition={verticalOffset}
			/>
		</PlotsStateProvider>
	);
};

