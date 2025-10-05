/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';
import { PlotInstancesState, usePlotInstances } from './usePlotInstances.js';

/**
 * React context for plot state distribution.
 */
const PlotsStateContext = createContext<PlotInstancesState>(undefined!);

/**
 * Provider component wrapping children with plot state context.
 */
export const PlotsStateProvider = (props: PropsWithChildren<{}>) => {
	const stateData = usePlotInstances();

	return (
		<PlotsStateContext.Provider value={stateData}>
			{props.children}
		</PlotsStateContext.Provider>
	);
};

/**
 * Hook to access plot state context data.
 */
export const usePlotsContextData = () => useContext(PlotsStateContext);


