/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { PropsWithChildren, createContext, useContext } from 'react';

// Other dependencies.
import { ErdosPlotsState, useErdosPlotsState } from './erdosPlotsState.js';

/**
 * Create the Erdos plots context.
 */
const ErdosPlotsContext = createContext<ErdosPlotsState>(undefined!);

/**
 * Export the ErdosPlotsContextProvider provider
 */
export const ErdosPlotsContextProvider = (props: PropsWithChildren<{}>) => {
	// Hooks.
	const erdosPlotsState = useErdosPlotsState();

	// Render.
	return (
		<ErdosPlotsContext.Provider value={erdosPlotsState}>
			{props.children}
		</ErdosPlotsContext.Provider>
	);
};

/**
 * Export useErdosPlotsContext to simplify using the Erdos plots context object.
 */
export const useErdosPlotsContext = () => useContext(ErdosPlotsContext);
