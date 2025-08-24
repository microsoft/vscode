/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, createContext, useContext } from 'react';

import { ErdosActionBarState, useErdosActionBarState } from './erdosActionBarState.js';

const ErdosActionBarContext = createContext<ErdosActionBarState>(undefined!);

export const ErdosActionBarContextProvider = (props: PropsWithChildren<{}>) => {
	const erdosActionBarState = useErdosActionBarState();

	return (
		<ErdosActionBarContext.Provider value={erdosActionBarState}>
			{props.children}
		</ErdosActionBarContext.Provider>
	);
};

export const useErdosActionBarContext = () => useContext(ErdosActionBarContext);